import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { scanXfa } from '@/lib/services/python-worker-client'
import type { XfaScanResult, IrccFormFieldInsert } from '@/lib/types/ircc-forms'
import { classifyField, deriveSectionTitle, deriveSectionDescription } from '@/lib/ircc/field-auto-classify'
import { detectDateGroups, buildDateSplitMap } from '@/lib/ircc/date-split-detector'
import { scannerTypeToFieldType } from '@/lib/ircc/scanner-type-map'
import { tryAutoMap, AUTO_MAP_CONFIDENCE_THRESHOLD } from '@/lib/ircc/auto-mapper'
import { deriveClientLabel } from '@/lib/ircc/xfa-label-utils'

// Allow large PDF uploads (up to 50MB) and longer processing time for XFA scanning
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/ircc/forms/upload
 *
 * Upload an IRCC PDF form template, scan its XFA fields, and store it.
 *
 * Body: multipart/form-data with:
 *   - file: PDF file
 *   - form_code: string (e.g. 'IMM5257E')
 *   - form_name: string (e.g. 'Application for Temporary Resident Visa')
 *   - description: string (optional)
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const tenantId = auth.tenantId

    // 1. Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const formCode = formData.get('form_code') as string | null
    const formName = formData.get('form_name') as string | null
    const description = (formData.get('description') as string) || null
    const descriptionTranslationsRaw = formData.get('description_translations') as string | null
    let descriptionTranslations: Record<string, string> = {}
    if (descriptionTranslationsRaw && descriptionTranslationsRaw.length < 10000) {
      try { descriptionTranslations = JSON.parse(descriptionTranslationsRaw) } catch { /* ignore */ }
    }

    if (!file || !formCode || !formName) {
      return NextResponse.json(
        { error: 'file, form_code, and form_name are required' },
        { status: 400 },
      )
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are accepted' },
        { status: 400 },
      )
    }

    // 2. Read file bytes and compute checksum
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const checksum = createHash('sha256').update(fileBuffer).digest('hex')

    // 3. Upload to Supabase Storage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()
    const storagePath = `${tenantId}/ircc-templates/${formCode}/${checksum}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${(uploadError as Error).message}` },
        { status: 500 },
      )
    }

    // 4. Run XFA scanner via Python worker sidecar
    let scanResult: XfaScanResult
    try {
      scanResult = await scanXfa(fileBuffer, { timeoutMs: 30_000 })
    } catch (scanErr) {
      scanResult = {
        root_element: null,
        is_xfa: false,
        field_count: 0,
        fields: [],
        error: scanErr instanceof Error ? scanErr.message : 'Scanner failed',
      }
    }

    const scanStatus = scanResult.error ? 'error' : 'scanned'

    // 5. Replace any existing form with the same form_code for this tenant.
    //    Capture its mapped fields first so step 7 can restore them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prevMappedFieldsForRestore: any[] = []
    try {
      const { data: existingForms } = await supabase
        .from('ircc_forms')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('form_code', formCode)

      if (existingForms && (existingForms as { id: string }[]).length > 0) {
        const oldFormId = (existingForms as { id: string }[])[0].id

        // Capture mapped fields before deletion so we can restore them onto the new form
        const { data: oldMapped } = await supabase
          .from('ircc_form_fields')
          .select(
            'xfa_path, profile_path, label, field_type, is_required, is_client_visible, is_meta_field, meta_field_key, date_split, options, value_format, show_when, placeholder, description',
          )
          .eq('form_id', oldFormId)
          .not('profile_path', 'is', null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prevMappedFieldsForRestore = (oldMapped as any[]) ?? []

        // Null out form_id on form_pack_versions before deletion  -  this FK has no ON DELETE CASCADE
        await supabase.from('form_pack_versions').update({ form_id: null }).eq('form_id', oldFormId)

        // Delete old form  -  cascade removes its fields, sections, stream links, and assignments
        const { error: deleteErr } = await supabase.from('ircc_forms').delete().eq('id', oldFormId)
        if (deleteErr) {
          console.error('[ircc-forms/upload] Failed to delete old form (will retry without mappings):', deleteErr.message)
          prevMappedFieldsForRestore = []
        } else {
          console.log(`[ircc-forms/upload] Replaced existing ${formCode} (old id: ${oldFormId}), captured ${prevMappedFieldsForRestore.length} mappings`)
        }
      }
    } catch (replaceErr) {
      console.error('[ircc-forms/upload] Pre-insert replace step failed:', replaceErr instanceof Error ? replaceErr.message : replaceErr)
      // Continue  -  insert will fail below if conflict still exists
    }

    const { data: form, error: insertError } = await supabase
      .from('ircc_forms')
      .insert({
        tenant_id: tenantId,
        form_code: formCode,
        form_name: formName,
        description,
        description_translations: descriptionTranslations,
        storage_path: storagePath,
        file_name: file.name,
        file_size: fileBuffer.length,
        checksum_sha256: checksum,
        xfa_root_element: scanResult.root_element,
        is_xfa: scanResult.is_xfa,
        scan_status: scanStatus,
        scan_error: scanResult.error ?? null,
        scan_result: scanResult,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to create form record: ${(insertError as Error).message}` },
        { status: 500 },
      )
    }

    // 6. Auto-classify fields and create sections
    let sectionsCreated = 0
    let metaFieldsTagged = 0
    let autoMappedCount = 0

    if (scanResult.fields.length > 0) {
      // 6a. Classify every field
      const classified = scanResult.fields.map((f, idx) => ({
        raw: f,
        idx,
        classification: classifyField(f.xfa_path, f.suggested_label),
      }))

      // 6b. Collect unique section keys (from non-meta fields)
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

      // 6c. Insert sections
      const sectionIdMap = new Map<string, string>()
      if (sectionKeys.size > 0) {
        const sectionRows = Array.from(sectionKeys.entries()).map(([key, info], sortIdx) => ({
          tenant_id: tenantId,
          form_id: form.id,
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
          console.error('[ircc-forms/upload] Failed to insert sections:', sectionsError)
        } else if (insertedSections) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const s of insertedSections as any[]) {
            sectionIdMap.set(s.section_key, s.id)
          }
          sectionsCreated = insertedSections.length
        }
      }

      // 6d. Detect date-split groups (FromYr+FromMM+FromDD → single date)
      const dateGroups = detectDateGroups(scanResult.fields)
      const dateSplitMap = buildDateSplitMap(dateGroups)

      // 6e. Insert fields with classification + date-split + auto-map + inferred metadata
      const fieldRows: IrccFormFieldInsert[] = classified.map(({ raw, idx, classification }) => {
        const dateMeta = dateSplitMap.get(idx)

        // Strip French bilingual portion from IRCC captions (e.g. "Family name / Nom de famille" → "Family name")
        const captionEnglish = raw.caption_label?.trim().split(/\s*\/\s*/)[0]?.trim() || null
        // Derive a clean client-friendly label using the full resolution chain
        const effectiveLabel = deriveClientLabel(raw.xfa_path, null, captionEnglish || raw.suggested_label)

        // Attempt auto-mapping (only for unmapped, non-meta, non-date-split fields)
        let autoProfilePath: string | null = null
        let autoMapped = false
        if (!dateMeta?.profile_path && !classification.is_meta_field) {
          const autoResult = tryAutoMap(
            raw.xfa_path,
            raw.suggested_type,
            classification.section_key,
            raw.caption_label,
          )
          if (autoResult && autoResult.confidence >= AUTO_MAP_CONFIDENCE_THRESHOLD) {
            autoProfilePath = autoResult.profile_path
            autoMapped = true
            autoMappedCount++
          }
        }

        return {
          tenant_id: tenantId,
          form_id: form.id,
          xfa_path: raw.xfa_path,
          xfa_field_type: raw.suggested_type,
          suggested_label: effectiveLabel,
          sort_order: idx,
          is_mapped: autoMapped || !!dateMeta?.profile_path,
          is_meta_field: classification.is_meta_field,
          is_client_visible: dateMeta ? dateMeta.is_client_visible : classification.is_client_visible,
          section_id: classification.section_key ? (sectionIdMap.get(classification.section_key) ?? null) : null,
          // Date-split metadata takes precedence over auto-map
          date_split: dateMeta?.date_split ?? null,
          profile_path: dateMeta?.profile_path ?? autoProfilePath ?? null,
          // Inferred field metadata (date-split overrides field_type)
          // Fallback chain: date-split → auto-classify → scanner XFA type → null
          field_type: dateMeta?.field_type ?? classification.inferred_field_type ?? scannerTypeToFieldType(raw.suggested_type),
          placeholder: classification.inferred_placeholder ?? null,
          description: classification.inferred_description ?? null,
          options: classification.inferred_options ?? null,
        }
      })

      metaFieldsTagged = classified.filter((c) => c.classification.is_meta_field).length

      const { error: fieldsError } = await supabase
        .from('ircc_form_fields')
        .insert(fieldRows)

      if (fieldsError) {
        console.error('[ircc-forms/upload] Failed to insert fields:', fieldsError)
        // Don't fail the whole upload  -  form record exists, fields can be re-scanned
      }
    }

    // 7. Restore mappings from previous form (captured in step 5 before deletion).
    //    Matches fields by xfa_path and applies saved mapping data to new form's fields.
    let mappingsRestored = 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevMappedFields: any[] = prevMappedFieldsForRestore

      if (prevMappedFields.length > 0) {
        // Build lookup: xfa_path → previous mapping
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prevByPath = new Map((prevMappedFields as any[]).map((f) => [f.xfa_path, f]))

        // Fetch new form's field IDs
        const { data: newFields } = await supabase
          .from('ircc_form_fields')
          .select('id, xfa_path')
          .eq('form_id', form.id)

        if (newFields) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toRestore = (newFields as any[]).filter((f) => prevByPath.has(f.xfa_path))

          if (toRestore.length > 0) {
            // Batched bulk update  -  each field gets its previous mapping applied
            const BATCH_SIZE = 50
            for (let i = 0; i < toRestore.length; i += BATCH_SIZE) {
              const batch = toRestore.slice(i, i + BATCH_SIZE)
              await Promise.all(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                batch.map((newField: any) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const prev = prevByPath.get(newField.xfa_path) as any
                  return supabase
                    .from('ircc_form_fields')
                    .update({
                      profile_path: prev.profile_path,
                      label: prev.label,
                      field_type: prev.field_type,
                      is_required: prev.is_required ?? false,
                      is_client_visible: prev.is_client_visible ?? true,
                      is_meta_field: prev.is_meta_field ?? false,
                      meta_field_key: prev.meta_field_key ?? null,
                      date_split: prev.date_split ?? null,
                      options: prev.options ?? null,
                      value_format: prev.value_format ?? null,
                      show_when: prev.show_when ?? null,
                      placeholder: prev.placeholder ?? null,
                      description: prev.description ?? null,
                      is_mapped: true,
                    })
                    .eq('id', newField.id)
                }),
              )
            }
            mappingsRestored = toRestore.length
            console.log(`[ircc-forms/upload] Restored ${mappingsRestored} field mappings onto new form`)
          }
        }
      }
    } catch (restoreErr) {
      // Non-fatal  -  mappings can be re-applied manually or via seed script
      console.error('[ircc-forms/upload] Mapping restore failed (non-fatal):', restoreErr instanceof Error ? restoreErr.message : restoreErr)
    }

    // 8. Auto-link new form to all active matter types for this tenant
    let matterTypesLinked = 0
    try {
      // Find which matter types already have this form linked
      const { data: existingLinks } = await supabase
        .from('ircc_stream_forms')
        .select('matter_type_id')
        .eq('form_id', form.id)
        .eq('tenant_id', tenantId)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alreadyLinked = new Set((existingLinks ?? []).map((l: any) => l.matter_type_id as string))

      // Fetch all active matter types
      const { data: matterTypes } = await supabase
        .from('matter_types')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toLink = (matterTypes ?? []).filter((mt: any) => !alreadyLinked.has(mt.id))

      if (toLink.length > 0) {
        const { error: linkError } = await supabase
          .from('ircc_stream_forms')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(toLink.map((mt: any, idx: number) => ({
            tenant_id: tenantId,
            matter_type_id: mt.id,
            form_id: form.id,
            sort_order: idx + 1,
            is_required: true,
          })))

        if (linkError) {
          console.error('[ircc-forms/upload] Auto-link to matter types failed:', linkError)
        } else {
          matterTypesLinked = toLink.length
          console.log(`[ircc-forms/upload] Auto-linked ${formCode} to ${matterTypesLinked} matter type(s)`)
        }
      }
    } catch (linkErr) {
      // Non-fatal  -  form is fully usable, linking can be done manually
      console.error('[ircc-forms/upload] Auto-link step failed (non-fatal):', linkErr instanceof Error ? linkErr.message : linkErr)
    }

    return NextResponse.json({
      success: true,
      form_id: form.id,
      form_code: formCode,
      scan_status: scanStatus,
      field_count: scanResult.field_count,
      root_element: scanResult.root_element,
      is_xfa: scanResult.is_xfa,
      sections_created: sectionsCreated,
      meta_fields_tagged: metaFieldsTagged,
      auto_mapped_count: autoMappedCount,
      mappings_restored: mappingsRestored,
      matter_types_linked: matterTypesLinked,
      date_groups_detected: scanResult.fields.length > 0 ? detectDateGroups(scanResult.fields).length : 0,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      console.error('[ircc-forms/upload] AuthError:', error.message, 'status:', error.status)
      return NextResponse.json({ error: error.message }, { status: error.status ?? 401 })
    }
    console.error('[ircc-forms/upload] Unhandled error:', error instanceof Error ? error.stack : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
