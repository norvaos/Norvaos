import { NextResponse } from 'next/server'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type { XfaScanResult } from '@/lib/types/ircc-forms'
import { deriveClientLabel } from '@/lib/ircc/xfa-label-utils'

const execFileAsync = promisify(execFile)

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * POST /api/ircc/forms/[formId]/relabel
 *
 * Re-scan the stored PDF and update every field's suggested_label
 * using the actual printed caption text from the form (caption_label),
 * stripped of French bilingual content and run through the full
 * deriveClientLabel resolution chain.
 *
 * Does NOT modify manually-set labels (field.label) or profile mappings.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // 1. Verify form ownership
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('id, storage_path, form_code')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // 2. Download PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(form.storage_path)

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: 'Failed to download template from storage' },
        { status: 500 },
      )
    }

    // 3. Write to temp file and run XFA scanner
    const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-relabel-'))
    const tmpPdfPath = join(tmpDir, 'template.pdf')
    const fileBuffer = Buffer.from(await fileData.arrayBuffer())
    await writeFile(tmpPdfPath, fileBuffer)

    let scanResult: XfaScanResult
    try {
      const scriptPath = join(process.cwd(), 'scripts', 'xfa-scanner.py')
      const { stdout } = await execFileAsync('python3', [scriptPath, tmpPdfPath], {
        timeout: 30000,
      })
      scanResult = JSON.parse(stdout)
    } catch (scanErr) {
      return NextResponse.json(
        { error: scanErr instanceof Error ? scanErr.message : 'XFA scanner failed' },
        { status: 500 },
      )
    } finally {
      await unlink(tmpPdfPath).catch(() => {})
      const { rmdir } = await import('fs/promises')
      await rmdir(tmpDir).catch(() => {})
    }

    if (!scanResult.fields.length) {
      return NextResponse.json({ success: true, relabeled: 0, message: 'No XFA fields found in form' })
    }

    // 4. Build xfa_path → best English label from scanner output
    const labelMap = new Map<string, string>()
    for (const f of scanResult.fields) {
      // Strip French bilingual portion (e.g. "Family name / Nom de famille" → "Family name")
      const captionEnglish = f.caption_label?.trim().split(/\s*\/\s*/)[0]?.trim() || null
      const label = deriveClientLabel(f.xfa_path, null, captionEnglish || f.suggested_label)
      if (label) {
        labelMap.set(f.xfa_path, label)
      }
    }

    // 5. Fetch all DB field IDs + xfa_paths for this form
    const { data: dbFields, error: fieldsError } = await supabase
      .from('ircc_form_fields')
      .select('id, xfa_path')
      .eq('form_id', formId)

    if (fieldsError || !dbFields?.length) {
      return NextResponse.json({ success: true, relabeled: 0, message: 'No fields found to relabel' })
    }

    // 6. Update suggested_label for all fields that have a scanner-derived label
    //    (does not touch field.label which is the admin-set override)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toUpdate = (dbFields as any[]).filter((f: any) => labelMap.has(f.xfa_path))

    if (!toUpdate.length) {
      return NextResponse.json({ success: true, relabeled: 0, message: 'No matching labels found' })
    }

    await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toUpdate.map((f: any) =>
        supabase
          .from('ircc_form_fields')
          .update({ suggested_label: labelMap.get(f.xfa_path) })
          .eq('id', f.id),
      ),
    )

    console.log(`[ircc-forms/relabel] Updated ${toUpdate.length} field labels for form ${form.form_code} (${formId})`)

    return NextResponse.json({ success: true, relabeled: toUpdate.length })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/relabel] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
