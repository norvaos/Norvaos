/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DB-Driven XFA Form Filler — Server Only
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file contains the server-only code for filling XFA PDFs via the
 * Python worker sidecar (FastAPI). It must ONLY be imported from server
 * routes and server-side modules (never from client components or query hooks).
 *
 * Client-safe functions (buildXfaFieldDataFromDB, computePackReadinessFromDB)
 * remain in xfa-filler-db.ts.
 *
 * The Python filler logic runs in the FastAPI sidecar worker (worker/).
 * PDF bytes and field data are sent via HTTP multipart/form-data.
 */

import { buildXfaFieldDataFromDB } from '@/lib/ircc/xfa-filler-db'
import { fillXfa } from '@/lib/services/python-worker-client'
import { readFile } from 'fs/promises'

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
 * 3. Reads template PDF bytes from disk
 * 4. Calls the Python worker sidecar /fill-xfa endpoint
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

    // 3. Build the payload for the Python worker sidecar
    const fieldDataPayload = {
      rootElement: xfaData.root_element,
      scalarFields: xfaData.scalar_fields,
      arrayData: Object.entries(xfaData.array_data).map(([basePath, entry]) => ({
        basePath,
        entryName: entry.entry_name,
        entries: entry.rows,
      })),
      barcodeData: barcodeData ?? undefined,
    }

    // 4. Read template PDF and call the Python worker sidecar
    const templateBytes = await readFile(templatePath)

    const filledBytes = await fillXfa(
      new Uint8Array(templateBytes),
      fieldDataPayload,
      { timeoutMs: 30_000 },
    )

    // Note: barcode embedding is handled inside the worker — if barcodeData was
    // provided, the worker will attempt to embed it. We assume success unless
    // the worker throws.
    const barcodeEmbedded = !!barcodeData

    return { bytes: filledBytes, barcodeEmbedded }
  } catch (error) {
    console.error('[xfa-filler-db] Error filling XFA form:', error)
    return null
  }
}
