/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DB-Driven XFA Form Filler — Server Only
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file contains the Node.js-dependent code for filling XFA PDFs via the
 * Python pikepdf/lxml/PyMuPDF pipeline. It must ONLY be imported from server
 * routes and server-side modules (never from client components or query hooks).
 *
 * Client-safe functions (buildXfaFieldDataFromDB, computePackReadinessFromDB)
 * remain in xfa-filler-db.ts.
 *
 * The Python filler logic lives in scripts/xfa-filler.py (static file).
 * Input is passed via a JSON file in a per-call unique temp directory.
 */

import { buildXfaFieldDataFromDB } from '@/lib/ircc/xfa-filler-db'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const execFileAsync = promisify(execFile)

// Path to the static Python filler script (same pattern as scripts/pdf-preview.py)
const FILLER_SCRIPT_PATH = resolve(process.cwd(), 'scripts', 'xfa-filler.py')

// ── Meta Field Resolution ──────────────────────────────────────────────────

/**
 * Resolve the value for a meta field (not from client profile).
 * Meta fields include representative signatures, dates, etc.
 */
function resolveMetaFieldValue(
  metaFieldKey: string,
  representativeName?: string,
): string | null {
  const today = new Date().toISOString().split('T')[0]

  // Representative name parts
  const repParts = representativeName ? representativeName.split(' ') : []
  const repGiven = repParts[0] ?? ''
  const repFamily = repParts.slice(1).join(' ') || (repParts[0] ?? '')

  switch (metaFieldKey) {
    case '__signature':
    case '__rep_signature':
    case '__rep_d_signature':
      return representativeName ?? null

    case '__signed_date':
    case '__rep_signed_date':
    case '__rep_d_signed_date':
      return representativeName ? today : null

    case '__rep_family_name':
    case '__rep_d_family_name':
      return representativeName ? repFamily : null

    case '__rep_given_name':
    case '__rep_d_given_name':
      return representativeName ? repGiven : null

    // Phone type indicator — "1" means international/other (non-NA number)
    // Used to activate the ActualNumber display path in IRCC XFA forms
    case '__phone_intl_flag':
      return '1'

    // Consent checkbox — always "1" (agreed) on a generated form
    case '__consent_yes':
      return '1'

    default:
      console.warn(`[xfa-filler-db] Unknown meta_field_key: ${metaFieldKey}`)
      return null
  }
}

// ── XFA Form Filler (DB-driven) ────────────────────────────────────────────

// ── Return type ────────────────────────────────────────────────────────────

export interface FilledFormResult {
  bytes: Uint8Array
  barcodeEmbedded: boolean
}

// ── Barcode data ────────────────────────────────────────────────────────────

export interface BarcodeData {
  code: string
  applicant: string
  generated: string
  version: string
  hash: string
}

/**
 * Fill an XFA PDF form using DB-driven field mappings.
 *
 * 1. Builds field data from ircc_form_fields + ircc_form_array_maps
 * 2. Resolves meta fields (representative info, dates)
 * 3. Writes field data JSON to a unique temp directory
 * 4. Executes scripts/xfa-filler.py via Python subprocess
 * 5. Returns the filled PDF bytes + barcode status
 *
 * @param templatePath - Path to the blank IRCC PDF template
 * @param formId - The ircc_forms.id to build data for
 * @param profile - The client's immigration_data profile
 * @param supabase - Supabase client (admin or authenticated)
 * @param representativeName - Optional representative name for meta fields
 * @param barcodeData - Optional barcode payload to embed in the filled PDF
 * @returns FilledFormResult or null if filling fails
 */
export async function fillXFAFormFromDB(
  templatePath: string,
  formId: string,
  profile: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  representativeName?: string,
  barcodeData?: BarcodeData,
): Promise<FilledFormResult | null> {
  // Each call gets its own temp directory — no cross-request path collisions
  const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-xfa-'))
  const outputPath = join(tmpDir, 'output.pdf')
  const dataPath = join(tmpDir, 'field_data.json')

  try {
    // 1. Build field data from DB
    const xfaData = await buildXfaFieldDataFromDB(formId, profile, supabase)
    if (!xfaData) {
      console.error('[xfa-filler-db] Failed to build XFA field data for form:', formId)
      return null
    }

    // 2. Resolve meta fields from DB
    const { data: metaFields } = await supabase
      .from('ircc_form_fields')
      .select('xfa_path, meta_field_key')
      .eq('form_id', formId)
      .eq('is_meta_field', true)

    for (const mf of (metaFields ?? []) as { xfa_path: string; meta_field_key: string }[]) {
      if (!mf.xfa_path || !mf.meta_field_key) continue
      const value = resolveMetaFieldValue(mf.meta_field_key, representativeName)
      if (value) {
        xfaData.scalar_fields[mf.xfa_path] = value
      }
    }

    // 3. Build the JSON payload for the Python script
    const fieldData: Record<string, unknown> = {
      pdfPath: templatePath,
      outputPath,
      rootElement: xfaData.root_element,
      scalarFields: xfaData.scalar_fields,
      arrayData: Object.entries(xfaData.array_data).map(([basePath, entry]) => ({
        basePath,
        entryName: entry.entry_name,
        entries: entry.rows,
      })),
    }

    if (barcodeData) {
      fieldData.barcodeData = barcodeData
    }

    await writeFile(dataPath, JSON.stringify(fieldData, null, 2))

    // 4. Run the static Python filler script
    const { stdout } = await execFileAsync('python3', [FILLER_SCRIPT_PATH, dataPath], {
      timeout: 30000,
    })

    // 5. Parse barcode result from stdout JSON
    let barcodeEmbedded = false
    try {
      const result = JSON.parse(stdout.trim())
      barcodeEmbedded = result.barcode_embedded === true
    } catch {
      // stdout may not be valid JSON if python printed debug lines — ignore
    }

    // 6. Read the output PDF
    const filledPdf = await readFile(outputPath)
    return { bytes: new Uint8Array(filledPdf), barcodeEmbedded }
  } catch (error) {
    console.error('[xfa-filler-db] Error filling XFA form:', error)
    return null
  } finally {
    // Remove the entire temp directory in one shot — handles partial failures cleanly
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
