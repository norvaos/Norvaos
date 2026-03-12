import { NextResponse } from 'next/server'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type { XfaScanResult, IrccFormFieldInsert } from '@/lib/types/ircc-forms'
import { classifyField, deriveSectionTitle, deriveSectionDescription } from '@/lib/ircc/field-auto-classify'
import { detectDateGroups, buildDateSplitMap } from '@/lib/ircc/date-split-detector'
import { scannerTypeToFieldType } from '@/lib/ircc/scanner-type-map'

const execFileAsync = promisify(execFile)

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * POST /api/ircc/forms/[formId]/rescan
 *
 * Re-run XFA scanner on the stored PDF template.
 * Deletes existing unmapped fields and re-inserts from scan results.
 * Preserves fields that have already been mapped (profile_path set).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // 1. Get form and verify ownership
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('*')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // 2. Mark as scanning
    await supabase
      .from('ircc_forms')
      .update({ scan_status: 'scanning', scan_error: null })
      .eq('id', formId)

    // 3. Download template from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(form.storage_path)

    if (downloadError || !fileData) {
      await supabase
        .from('ircc_forms')
        .update({ scan_status: 'error', scan_error: 'Failed to download template from storage' })
        .eq('id', formId)

      return NextResponse.json(
        { error: 'Failed to download template from storage' },
        { status: 500 },
      )
    }

    // 4. Write to temp file and scan
    const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-rescan-'))
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
      scanResult = {
        root_element: null,
        is_xfa: false,
        field_count: 0,
        fields: [],
        error: scanErr instanceof Error ? scanErr.message : 'Scanner failed',
      }
    } finally {
      await unlink(tmpPdfPath).catch(() => {})
      const { rmdir } = await import('fs/promises')
      await rmdir(tmpDir).catch(() => {})
    }

    const scanStatus = scanResult.error ? 'error' : 'scanned'

    // 5. Update form with scan results
    await supabase
      .from('ircc_forms')
      .update({
        xfa_root_element: scanResult.root_element,
        is_xfa: scanResult.is_xfa,
        scan_status: scanStatus,
        scan_error: scanResult.error ?? null,
        scan_result: scanResult,
      })
      .eq('id', formId)

    // 6. Get existing mapped fields (to preserve)
    const { data: existingFields } = await supabase
      .from('ircc_form_fields')
      .select('xfa_path')
      .eq('form_id', formId)
      .eq('is_mapped', true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedPaths = new Set(((existingFields ?? []) as any[]).map((f: any) => f.xfa_path as string))

    // 7. Delete unmapped fields (they'll be replaced by scan results)
    await supabase
      .from('ircc_form_fields')
      .delete()
      .eq('form_id', formId)
      .eq('is_mapped', false)

    // 8. Auto-classify and insert newly scanned fields (skip already mapped)
    let sectionsCreated = 0
    let metaFieldsTagged = 0
    let newFieldCount = 0

    if (scanResult.fields.length > 0) {
      const unmappedFields = scanResult.fields.filter((f) => !mappedPaths.has(f.xfa_path))

      if (unmappedFields.length > 0) {
        // 8a. Classify every field
        const classified = unmappedFields.map((f, idx) => ({
          raw: f,
          idx,
          classification: classifyField(f.xfa_path, f.suggested_label),
        }))

        // 8b. Collect unique section keys
        const sectionKeys = new Map<string, { title: string; description: string | undefined; firstIdx: number }>()
        for (const { classification, idx } of classified) {
          if (!classification.is_meta_field && classification.section_key) {
            if (!sectionKeys.has(classification.section_key)) {
              sectionKeys.set(classification.section_key, {
                title: classification.section_title || deriveSectionTitle(classification.section_key),
                description: classification.section_description || deriveSectionDescription(classification.section_key),
                firstIdx: idx,
              })
            }
          }
        }

        // 8c. Upsert sections (avoid duplicate section_key conflicts on re-scan)
        const sectionIdMap = new Map<string, string>()
        if (sectionKeys.size > 0) {
          for (const [key, info] of sectionKeys) {
            const { data: upserted, error: sectionErr } = await supabase
              .from('ircc_form_sections')
              .upsert(
                {
                  tenant_id: auth.tenantId,
                  form_id: formId,
                  section_key: key,
                  title: info.title,
                  description: info.description ?? null,
                  sort_order: info.firstIdx,
                },
                { onConflict: 'form_id,section_key' },
              )
              .select('id, section_key')
              .single()

            if (sectionErr) {
              console.error('[ircc-forms/rescan] Failed to upsert section:', key, sectionErr)
            } else if (upserted) {
              sectionIdMap.set(upserted.section_key, upserted.id)
              sectionsCreated++
            }
          }
        }

        // 8d. Detect date-split groups
        const dateGroups = detectDateGroups(unmappedFields)
        const dateSplitMap = buildDateSplitMap(dateGroups)

        // 8e. Insert fields with classification + date-split + inferred metadata
        const newFields: IrccFormFieldInsert[] = classified.map(({ raw, idx, classification }) => {
          const dateMeta = dateSplitMap.get(idx)

          return {
            tenant_id: auth.tenantId,
            form_id: formId,
            xfa_path: raw.xfa_path,
            xfa_field_type: raw.suggested_type,
            suggested_label: raw.suggested_label,
            sort_order: idx,
            is_mapped: false,
            is_meta_field: classification.is_meta_field,
            is_client_visible: dateMeta ? dateMeta.is_client_visible : classification.is_client_visible,
            section_id: classification.section_key ? (sectionIdMap.get(classification.section_key) ?? null) : null,
            date_split: dateMeta?.date_split ?? null,
            profile_path: dateMeta?.profile_path ?? null,
            // Fallback chain: date-split → auto-classify → scanner XFA type → null
            field_type: dateMeta?.field_type ?? classification.inferred_field_type ?? scannerTypeToFieldType(raw.suggested_type),
            placeholder: classification.inferred_placeholder ?? null,
            description: classification.inferred_description ?? null,
            options: classification.inferred_options ?? null,
          }
        })

        metaFieldsTagged = classified.filter((c) => c.classification.is_meta_field).length
        newFieldCount = newFields.length

        const { error: insertError } = await supabase
          .from('ircc_form_fields')
          .insert(newFields)

        if (insertError) {
          console.error('[ircc-forms/rescan] Failed to insert fields:', insertError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      scan_status: scanStatus,
      field_count: scanResult.field_count,
      root_element: scanResult.root_element,
      is_xfa: scanResult.is_xfa,
      preserved_mapped: mappedPaths.size,
      new_fields: newFieldCount,
      sections_created: sectionsCreated,
      meta_fields_tagged: metaFieldsTagged,
      date_groups_detected: scanResult.fields.length > 0 ? detectDateGroups(scanResult.fields.filter((f) => !mappedPaths.has(f.xfa_path))).length : 0,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/rescan] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
