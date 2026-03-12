import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  classifyField,
  deriveSectionTitle,
  deriveSectionDescription,
} from '@/lib/ircc/field-auto-classify'
import { detectDateGroups, buildDateSplitMap } from '@/lib/ircc/date-split-detector'

/**
 * POST /api/ircc/forms/backfill-classify
 *
 * Apply auto-classification to existing forms that have unclassified fields.
 * Only updates fields in default state (is_mapped = false AND section_id IS NULL).
 * Preserves any admin-configured settings.
 *
 * Body (optional): { formId?: string }
 *   - If formId is provided, only processes that form.
 *   - If omitted, processes all forms with unclassified fields.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const tenantId = auth.tenantId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    let formId: string | undefined
    try {
      const body = await request.json()
      formId = body?.formId
    } catch {
      // No body — process all forms
    }

    // 1. Find unmapped fields that need classification or metadata enrichment
    //    - Unclassified: is_mapped=false AND section_id IS NULL
    //    - Needs metadata: is_mapped=false AND (field_type IS NULL OR date_split IS NULL)
    let query = supabase
      .from('ircc_form_fields')
      .select('id, form_id, xfa_path, suggested_label, is_meta_field, section_id, field_type, date_split, placeholder, description, options, profile_path, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_mapped', false)

    if (formId) {
      query = query.eq('form_id', formId)
    }

    const { data: fields, error: fieldsError } = await query

    if (fieldsError) {
      return NextResponse.json(
        { error: `Failed to fetch fields: ${fieldsError.message}` },
        { status: 500 },
      )
    }

    if (!fields || fields.length === 0) {
      return NextResponse.json({
        success: true,
        forms_processed: 0,
        fields_classified: 0,
        sections_created: 0,
        meta_fields_tagged: 0,
        date_groups_created: 0,
        field_types_set: 0,
        message: 'No unmapped fields found',
      })
    }

    // 2. Group by form_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byForm = new Map<string, any[]>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of fields as any[]) {
      const list = byForm.get(f.form_id) || []
      list.push(f)
      byForm.set(f.form_id, list)
    }

    let totalFieldsClassified = 0
    let totalSectionsCreated = 0
    let totalMetaFieldsTagged = 0
    let totalDateGroupsCreated = 0
    let totalFieldTypesSet = 0

    // 3. Process each form
    for (const [fId, formFields] of byForm) {
      // 3a. Classify each field
      const classified = formFields.map((f: Record<string, unknown>, idx: number) => ({
        field: f,
        idx,
        classification: classifyField(f.xfa_path as string, f.suggested_label as string | null),
      }))

      // 3b. Collect unique section keys (only for fields that need section assignment)
      const sectionKeys = new Map<string, { title: string; description: string | undefined }>()
      for (const { field, classification } of classified) {
        if (field.section_id) continue // Already has section
        if (!classification.is_meta_field && classification.section_key) {
          if (!sectionKeys.has(classification.section_key)) {
            sectionKeys.set(classification.section_key, {
              title: classification.section_title || deriveSectionTitle(classification.section_key),
              description: classification.section_description || deriveSectionDescription(classification.section_key),
            })
          }
        }
      }

      // 3c. Upsert sections
      const sectionIdMap = new Map<string, string>()
      let sortIdx = 0
      for (const [key, info] of sectionKeys) {
        const { data: upserted, error: sectionErr } = await supabase
          .from('ircc_form_sections')
          .upsert(
            {
              tenant_id: tenantId,
              form_id: fId,
              section_key: key,
              title: info.title,
              description: info.description ?? null,
              sort_order: sortIdx++,
            },
            { onConflict: 'form_id,section_key' },
          )
          .select('id, section_key')
          .single()

        if (sectionErr) {
          console.error(`[backfill-classify] Failed to upsert section ${key} for form ${fId}:`, sectionErr)
        } else if (upserted) {
          sectionIdMap.set(upserted.section_key, upserted.id)
          totalSectionsCreated++
        }
      }

      // 3d. Detect date-split groups for this form
      const dateGroups = detectDateGroups(
        formFields.map((f: Record<string, unknown>) => ({
          xfa_path: f.xfa_path as string,
          suggested_label: f.suggested_label as string | null,
        })),
      )
      const dateSplitMap = buildDateSplitMap(dateGroups)
      totalDateGroupsCreated += dateGroups.length

      // 3e. Update each field with classification + date-split + inferred metadata
      for (const { field, idx, classification } of classified) {
        const dateMeta = dateSplitMap.get(idx)
        const updates: Record<string, unknown> = {}

        // Section assignment (only if not already assigned)
        if (!field.section_id && classification.section_key && sectionIdMap.has(classification.section_key)) {
          updates.section_id = sectionIdMap.get(classification.section_key)
        }

        // Classification (always update)
        updates.is_meta_field = classification.is_meta_field
        updates.is_client_visible = dateMeta ? dateMeta.is_client_visible : classification.is_client_visible

        // Date-split metadata (only if not already set)
        if (!field.date_split && dateMeta) {
          updates.date_split = dateMeta.date_split
          updates.profile_path = dateMeta.profile_path
          if (dateMeta.field_type) updates.field_type = dateMeta.field_type
        }

        // Inferred field metadata (only set if column is currently NULL)
        if (!field.field_type && !dateMeta?.field_type && classification.inferred_field_type) {
          updates.field_type = classification.inferred_field_type
          totalFieldTypesSet++
        }
        if (!field.placeholder && classification.inferred_placeholder) {
          updates.placeholder = classification.inferred_placeholder
        }
        if (!field.description && classification.inferred_description) {
          updates.description = classification.inferred_description
        }
        if (!field.options && classification.inferred_options) {
          updates.options = classification.inferred_options
        }

        const { error: updateErr } = await supabase
          .from('ircc_form_fields')
          .update(updates)
          .eq('id', field.id)

        if (updateErr) {
          console.error(`[backfill-classify] Failed to update field ${field.id}:`, updateErr)
        } else {
          totalFieldsClassified++
          if (classification.is_meta_field) totalMetaFieldsTagged++
        }
      }
    }

    return NextResponse.json({
      success: true,
      forms_processed: byForm.size,
      fields_classified: totalFieldsClassified,
      sections_created: totalSectionsCreated,
      meta_fields_tagged: totalMetaFieldsTagged,
      date_groups_created: totalDateGroupsCreated,
      field_types_set: totalFieldTypesSet,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 401 })
    }
    console.error('[backfill-classify] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
