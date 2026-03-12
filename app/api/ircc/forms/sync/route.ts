import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { readFile, writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  XfaScanResult,
  IrccFormFieldInsert,
  SyncFormRequest,
  SyncResult,
  SyncResultItem,
} from '@/lib/types/ircc-forms'
import { classifyField, deriveSectionTitle, deriveSectionDescription } from '@/lib/ircc/field-auto-classify'
import { detectDateGroups, buildDateSplitMap } from '@/lib/ircc/date-split-detector'
import { scannerTypeToFieldType } from '@/lib/ircc/scanner-type-map'

const execFileAsync = promisify(execFile)

/**
 * Shared helper: Run XFA scanner on a PDF buffer and return scan result.
 */
async function runXfaScanner(fileBuffer: Buffer): Promise<XfaScanResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'ircc-sync-'))
  const tmpPdfPath = join(tmpDir, 'template.pdf')
  await writeFile(tmpPdfPath, fileBuffer)

  try {
    const scriptPath = join(process.cwd(), 'scripts', 'xfa-scanner.py')
    const { stdout } = await execFileAsync('python3', [scriptPath, tmpPdfPath], {
      timeout: 30000,
    })
    return JSON.parse(stdout)
  } catch (scanErr) {
    return {
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
}

/**
 * POST /api/ircc/forms/sync
 *
 * Sync forms from the local folder into the database.
 * - 'add': Upload new form (PDF → Storage → XFA scan → DB)
 * - 'update': Archive current version, upload new PDF, preserve field mappings
 *
 * Body: { forms: SyncFormRequest[] }
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const tenantId = auth.tenantId
    const userId = auth.userId

    const body = await request.json()
    const forms = (body.forms ?? []) as SyncFormRequest[]

    if (!forms.length) {
      return NextResponse.json({ error: 'No forms to sync' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()
    const folderPath = join(process.cwd(), 'public', 'ircc-forms')
    const results: SyncResultItem[] = []

    // Process each form sequentially to avoid race conditions
    for (const form of forms) {
      try {
        if (form.action === 'add') {
          // ─── ADD NEW FORM ──────────────────────────────────────────
          const filePath = join(folderPath, form.fileName)
          const fileBuffer = await readFile(filePath)
          const checksum = createHash('sha256').update(fileBuffer).digest('hex')

          // Upload to Supabase Storage
          const storagePath = `${tenantId}/ircc-templates/${form.formCode}/${checksum}.pdf`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, fileBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            })

          if (uploadError) throw new Error(`Storage upload failed: ${(uploadError as Error).message}`)

          // Run XFA scanner
          const scanResult = await runXfaScanner(fileBuffer)
          const scanStatus = scanResult.error ? 'error' : 'scanned'

          // Insert form record
          const { data: newForm, error: insertError } = await supabase
            .from('ircc_forms')
            .insert({
              tenant_id: tenantId,
              form_code: form.formCode,
              form_name: form.formName || form.formCode,
              storage_path: storagePath,
              file_name: form.fileName,
              file_size: fileBuffer.length,
              checksum_sha256: checksum,
              xfa_root_element: scanResult.root_element,
              is_xfa: scanResult.is_xfa,
              scan_status: scanStatus,
              scan_error: scanResult.error ?? null,
              scan_result: scanResult,
              current_version: 1,
              form_date: form.formDate ?? null,
            })
            .select()
            .single()

          if (insertError) throw new Error(`Insert failed: ${(insertError as Error).message}`)

          // Auto-classify fields and create sections (same as upload route)
          let sectionsCreated = 0
          if (scanResult.fields.length > 0) {
            // Classify every field
            const classified = scanResult.fields.map((f, idx) => ({
              raw: f,
              idx,
              classification: classifyField(f.xfa_path, f.suggested_label),
            }))

            // Collect unique section keys (from non-meta fields)
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

            // Insert sections
            const sectionIdMap = new Map<string, string>()
            if (sectionKeys.size > 0) {
              const sectionRows = Array.from(sectionKeys.entries()).map(([key, info], sortIdx) => ({
                tenant_id: tenantId,
                form_id: newForm.id,
                section_key: key,
                title: info.title,
                description: info.description ?? null,
                sort_order: sortIdx,
              }))

              const { data: insertedSections, error: sectionsError } = await supabase
                .from('ircc_form_sections')
                .insert(sectionRows)
                .select('id, section_key')

              if (sectionsError) {
                console.error('[ircc-forms/sync] Failed to insert sections:', sectionsError)
              } else if (insertedSections) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const s of insertedSections as any[]) {
                  sectionIdMap.set(s.section_key, s.id)
                }
                sectionsCreated = insertedSections.length
              }
            }

            // Detect date-split groups
            const dateGroups = detectDateGroups(scanResult.fields)
            const dateSplitMap = buildDateSplitMap(dateGroups)

            // Insert fields with classification + date-split + inferred metadata
            const fieldRows: IrccFormFieldInsert[] = classified.map(({ raw, idx, classification }) => {
              const dateMeta = dateSplitMap.get(idx)
              return {
                tenant_id: tenantId,
                form_id: newForm.id,
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
                field_type: dateMeta?.field_type ?? classification.inferred_field_type ?? scannerTypeToFieldType(raw.suggested_type),
                placeholder: classification.inferred_placeholder ?? null,
                description: classification.inferred_description ?? null,
                options: classification.inferred_options ?? null,
              }
            })

            await supabase.from('ircc_form_fields').insert(fieldRows)
          }

          results.push({
            formCode: form.formCode,
            action: 'add',
            success: true,
            formId: newForm.id,
            fieldCount: scanResult.field_count,
            newVersion: 1,
            sectionsCreated,
          })
        } else if (form.action === 'update') {
          // ─── UPDATE EXISTING FORM ──────────────────────────────────
          // 1. Fetch existing form
          const { data: existingForm, error: fetchError } = await supabase
            .from('ircc_forms')
            .select('*')
            .eq('form_code', form.formCode)
            .eq('tenant_id', tenantId)
            .single()

          if (fetchError || !existingForm) throw new Error('Existing form not found')

          const currentVersion = existingForm.current_version ?? 1

          // 2. Count existing fields for snapshot
          const { data: fieldData } = await supabase
            .from('ircc_form_fields')
            .select('is_mapped')
            .eq('form_id', existingForm.id)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allFields = (fieldData ?? []) as any[]
          const fieldCount = allFields.length
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mappedFieldCount = allFields.filter((f: any) => f.is_mapped).length

          // 3. Archive current version to ircc_form_versions
          const { error: archiveError } = await supabase
            .from('ircc_form_versions')
            .insert({
              tenant_id: tenantId,
              form_id: existingForm.id,
              version_number: currentVersion,
              storage_path: existingForm.storage_path,
              file_name: existingForm.file_name,
              file_size: existingForm.file_size,
              checksum_sha256: existingForm.checksum_sha256,
              scan_result: existingForm.scan_result,
              field_count: fieldCount,
              mapped_field_count: mappedFieldCount,
              is_xfa: existingForm.is_xfa,
              xfa_root_element: existingForm.xfa_root_element,
              form_date: existingForm.form_date ?? null,
              archived_by: userId,
            })

          if (archiveError) throw new Error(`Archive failed: ${(archiveError as Error).message}`)

          // 4. Read new file from folder
          const filePath = join(folderPath, form.fileName)
          const fileBuffer = await readFile(filePath)
          const checksum = createHash('sha256').update(fileBuffer).digest('hex')

          // 5. Upload new PDF to Supabase Storage
          const storagePath = `${tenantId}/ircc-templates/${form.formCode}/${checksum}.pdf`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, fileBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            })

          if (uploadError) throw new Error(`Storage upload failed: ${(uploadError as Error).message}`)

          // 6. Run XFA scanner on new PDF
          const scanResult = await runXfaScanner(fileBuffer)
          const scanStatus = scanResult.error ? 'error' : 'scanned'

          // 7. Preserve existing field mappings (same pattern as rescan route)
          const { data: existingFields } = await supabase
            .from('ircc_form_fields')
            .select('xfa_path')
            .eq('form_id', existingForm.id)
            .eq('is_mapped', true)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mappedPaths = new Set(((existingFields ?? []) as any[]).map((f: any) => f.xfa_path as string))

          // Delete unmapped fields and existing sections (they'll be replaced by new scan)
          await supabase
            .from('ircc_form_fields')
            .delete()
            .eq('form_id', existingForm.id)
            .eq('is_mapped', false)

          await supabase
            .from('ircc_form_sections')
            .delete()
            .eq('form_id', existingForm.id)

          // Insert newly scanned fields with classification (skip already-mapped xfa_paths)
          if (scanResult.fields.length > 0) {
            const classified = scanResult.fields
              .map((f, idx) => ({
                raw: f,
                idx,
                classification: classifyField(f.xfa_path, f.suggested_label),
              }))

            // Create sections from non-meta, non-mapped fields
            const sectionKeys = new Map<string, { title: string; description: string | undefined; firstIdx: number }>()
            for (const { raw, classification, idx } of classified) {
              if (!mappedPaths.has(raw.xfa_path) && !classification.is_meta_field && classification.section_key) {
                if (!sectionKeys.has(classification.section_key)) {
                  sectionKeys.set(classification.section_key, {
                    title: classification.section_title || deriveSectionTitle(classification.section_key),
                    description: classification.section_description || deriveSectionDescription(classification.section_key),
                    firstIdx: idx,
                  })
                }
              }
            }

            const sectionIdMap = new Map<string, string>()
            if (sectionKeys.size > 0) {
              const sectionRows = Array.from(sectionKeys.entries()).map(([key, info], sortIdx) => ({
                tenant_id: tenantId,
                form_id: existingForm.id,
                section_key: key,
                title: info.title,
                description: info.description ?? null,
                sort_order: sortIdx,
              }))

              const { data: insertedSections } = await supabase
                .from('ircc_form_sections')
                .insert(sectionRows)
                .select('id, section_key')

              if (insertedSections) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const s of insertedSections as any[]) {
                  sectionIdMap.set(s.section_key, s.id)
                }
              }
            }

            // Detect date-split groups
            const dateGroups = detectDateGroups(scanResult.fields)
            const dateSplitMap = buildDateSplitMap(dateGroups)

            const newFields: IrccFormFieldInsert[] = classified
              .filter(({ raw }) => !mappedPaths.has(raw.xfa_path))
              .map(({ raw, idx, classification }) => {
                const dateMeta = dateSplitMap.get(idx)
                return {
                  tenant_id: tenantId,
                  form_id: existingForm.id,
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
                  field_type: dateMeta?.field_type ?? classification.inferred_field_type ?? scannerTypeToFieldType(raw.suggested_type),
                  placeholder: classification.inferred_placeholder ?? null,
                  description: classification.inferred_description ?? null,
                  options: classification.inferred_options ?? null,
                }
              })

            if (newFields.length > 0) {
              await supabase.from('ircc_form_fields').insert(newFields)
            }
          }

          // 8. Update ircc_forms record
          const newVersion = currentVersion + 1
          const { error: updateError } = await supabase
            .from('ircc_forms')
            .update({
              storage_path: storagePath,
              file_name: form.fileName,
              file_size: fileBuffer.length,
              checksum_sha256: checksum,
              xfa_root_element: scanResult.root_element,
              is_xfa: scanResult.is_xfa,
              scan_status: scanStatus,
              scan_error: scanResult.error ?? null,
              scan_result: scanResult,
              current_version: newVersion,
              form_date: form.formDate ?? existingForm.form_date ?? null,
            })
            .eq('id', existingForm.id)

          if (updateError) throw new Error(`Update failed: ${(updateError as Error).message}`)

          results.push({
            formCode: form.formCode,
            action: 'update',
            success: true,
            formId: existingForm.id,
            fieldCount: scanResult.field_count,
            previousVersion: currentVersion,
            newVersion,
          })
        }
      } catch (err) {
        results.push({
          formCode: form.formCode,
          action: form.action,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const syncResult: SyncResult = {
      results,
      summary: {
        added: results.filter((r) => r.action === 'add' && r.success).length,
        updated: results.filter((r) => r.action === 'update' && r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    }

    return NextResponse.json(syncResult)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/sync] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
