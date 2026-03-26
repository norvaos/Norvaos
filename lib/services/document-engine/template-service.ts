/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Template Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Template CRUD, versioning, publishing, cloning, archival, deletion.
 * All mutations log to document_template_audit_log.
 *
 * Key rules:
 *   - Templates are tenant-scoped
 *   - Publishing creates an immutable version snapshot
 *   - Only empty draft templates can be deleted (soft-delete via is_active)
 *   - Used templates can only be archived (after supersession)
 *   - System templates cannot be deleted or archived  -  only cloned
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type {
  DocumentTemplateRow,
  DocumentTemplateVersionRow,
  DocumentTemplateMappingRow,
  DocumentTemplateConditionRow,
  DocumentClauseAssignmentRow,
} from '@/lib/types/database'
import type { TemplateBody, TemplateWithVersion } from '@/lib/types/document-engine'
import { logTemplateAudit } from './audit-service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateTemplateParams {
  tenantId: string
  templateKey: string
  name: string
  description?: string
  documentFamily: string
  practiceArea?: string
  matterTypeId?: string
  jurisdictionCode?: string
  languageCode?: string
  requiresReview?: boolean
  createdBy: string
}

export interface CreateVersionParams {
  tenantId: string
  templateId: string
  templateBody: TemplateBody
  versionLabel?: string
  changeSummary?: string
  mappings: Omit<DocumentTemplateMappingRow, 'id' | 'tenant_id' | 'template_version_id' | 'created_at'>[]
  conditions: Omit<DocumentTemplateConditionRow, 'id' | 'tenant_id' | 'template_version_id' | 'created_at'>[]
  clauseAssignments: Omit<DocumentClauseAssignmentRow, 'id' | 'tenant_id' | 'template_version_id' | 'created_at'>[]
  createdBy: string
}

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── Create Template ─────────────────────────────────────────────────────────

export async function createTemplate(
  supabase: SupabaseClient<Database>,
  params: CreateTemplateParams
): Promise<ServiceResult<DocumentTemplateRow>> {
  const { data, error } = await supabase
    .from('docgen_templates')
    .insert({
      tenant_id: params.tenantId,
      template_key: params.templateKey,
      name: params.name,
      description: params.description ?? null,
      document_family: params.documentFamily,
      practice_area: params.practiceArea ?? null,
      matter_type_id: params.matterTypeId ?? null,
      jurisdiction_code: params.jurisdictionCode ?? 'ON-CA',
      language_code: params.languageCode ?? 'en',
      status: 'draft',
      requires_review: params.requiresReview ?? true,
      is_system_template: false,
      is_active: true,
      created_by: params.createdBy,
      updated_by: params.createdBy,
    } as never)
    .select()
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Failed to create template' }
  }

  // Auto-create an initial v1 draft version with empty template body
  const emptyBody: TemplateBody = {
    sections: [],
    header: { content: '', show_logo: false, alignment: 'center' },
    footer: { content: '', show_page_numbers: true, page_number_format: 'Page {PAGE} of {NUMPAGES}' },
    metadata: { page_size: 'letter', margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, font_family: 'Times New Roman', font_size: 24, line_spacing: 276 },
  }

  const { data: version } = await supabase
    .from('document_template_versions')
    .insert({
      tenant_id: params.tenantId,
      template_id: data.id,
      version_number: 1,
      version_label: 'v1',
      template_body: emptyBody as unknown as Record<string, unknown>,
      change_summary: 'Initial draft',
      status: 'draft',
      created_by: params.createdBy,
    } as never)
    .select()
    .single()

  // Set current_version_id on the template
  if (version) {
    await supabase
      .from('docgen_templates')
      .update({ current_version_id: version.id } as never)
      .eq('id', data.id)

    data.current_version_id = version.id
  }

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: data.id,
    eventType: 'template_created',
    eventPayload: { name: params.name, document_family: params.documentFamily },
    performedBy: params.createdBy,
  })

  return { success: true, data: data as unknown as DocumentTemplateRow }
}

// ─── Create Version ──────────────────────────────────────────────────────────

export async function createTemplateVersion(
  supabase: SupabaseClient<Database>,
  params: CreateVersionParams
): Promise<ServiceResult<DocumentTemplateVersionRow>> {
  // Get next version number
  const { data: existing } = await supabase
    .from('document_template_versions')
    .select('version_number')
    .eq('template_id', params.templateId)
    .order('version_number', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version_number + 1 : 1

  // Create version
  const { data: version, error: versionError } = await supabase
    .from('document_template_versions')
    .insert({
      tenant_id: params.tenantId,
      template_id: params.templateId,
      version_number: nextVersion,
      version_label: params.versionLabel ?? `v${nextVersion}`,
      template_body: params.templateBody as unknown as Record<string, unknown>,
      change_summary: params.changeSummary ?? null,
      status: 'draft',
      created_by: params.createdBy,
    } as never)
    .select()
    .single()

  if (versionError || !version) {
    return { success: false, error: versionError?.message ?? 'Failed to create version' }
  }

  // Insert mappings
  if (params.mappings.length > 0) {
    const { error: mappingError } = await supabase
      .from('document_template_mappings')
      .insert(
        params.mappings.map((m) => ({
          ...m,
          tenant_id: params.tenantId,
          template_version_id: version.id,
        })) as never
      )
    if (mappingError) {
      return { success: false, error: `Failed to create mappings: ${mappingError.message}` }
    }
  }

  // Insert conditions
  if (params.conditions.length > 0) {
    const { error: conditionError } = await supabase
      .from('document_template_conditions')
      .insert(
        params.conditions.map((c) => ({
          ...c,
          tenant_id: params.tenantId,
          template_version_id: version.id,
        })) as never
      )
    if (conditionError) {
      return { success: false, error: `Failed to create conditions: ${conditionError.message}` }
    }
  }

  // Insert clause assignments
  if (params.clauseAssignments.length > 0) {
    const { error: clauseError } = await supabase
      .from('document_clause_assignments')
      .insert(
        params.clauseAssignments.map((ca) => ({
          ...ca,
          tenant_id: params.tenantId,
          template_version_id: version.id,
        })) as never
      )
    if (clauseError) {
      return { success: false, error: `Failed to create clause assignments: ${clauseError.message}` }
    }
  }

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: params.templateId,
    templateVersionId: version.id,
    eventType: 'version_created',
    eventPayload: { version_number: nextVersion },
    performedBy: params.createdBy,
  })

  return { success: true, data: version }
}

// ─── Publish Version ─────────────────────────────────────────────────────────

export async function publishVersion(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    templateId: string
    versionId: string
    publishedBy: string
  }
): Promise<ServiceResult> {
  // Verify version exists and is draft
  const { data: version } = await supabase
    .from('document_template_versions')
    .select('id, status, version_number')
    .eq('id', params.versionId)
    .eq('template_id', params.templateId)
    .single()

  if (!version) {
    return { success: false, error: 'Version not found' }
  }
  if (version.status !== 'draft') {
    return { success: false, error: `Cannot publish version in "${version.status}" status` }
  }

  // ── REDLINE 4: Mandatory publish validation (6 checks) ─────────────────────
  const publishErrors: string[] = []

  // Fetch version data for validation
  const { data: fullVersion } = await supabase
    .from('document_template_versions')
    .select('template_body')
    .eq('id', params.versionId)
    .single()

  const { data: vMappings } = await supabase
    .from('document_template_mappings')
    .select('field_key')
    .eq('template_version_id', params.versionId)

  const { data: vConditions } = await supabase
    .from('document_template_conditions')
    .select('condition_key, rules')
    .eq('template_version_id', params.versionId)

  const { data: vClauseAssignments } = await supabase
    .from('document_clause_assignments')
    .select('placement_key, clause_id')
    .eq('template_version_id', params.versionId)

  if (fullVersion?.template_body) {
    const body = fullVersion.template_body as unknown as { sections?: { elements?: { type?: string; content?: string; clause_placement_key?: string; condition_key?: string }[]; condition_key?: string }[] }
    const bodyJson = JSON.stringify(body)
    const mappingKeys = new Set((vMappings ?? []).map(m => m.field_key))
    const conditionKeys = new Set((vConditions ?? []).map(c => c.condition_key))

    // Check 1: Unmapped fields  -  placeholders in body not in mappings
    const placeholderRegex = /\{\{([^}]+)\}\}/g
    const bodyPlaceholders = new Set<string>()
    let pm: RegExpExecArray | null
    while ((pm = placeholderRegex.exec(bodyJson)) !== null) {
      bodyPlaceholders.add(pm[1].trim())
    }
    const unmapped = [...bodyPlaceholders].filter(p => !mappingKeys.has(p))
    if (unmapped.length > 0) {
      publishErrors.push(`Unmapped placeholders: ${unmapped.join(', ')}`)
    }

    // Check 2: Orphan placeholders  -  mappings not referenced in body
    const orphans = [...mappingKeys].filter(k => !bodyPlaceholders.has(k))
    if (orphans.length > 0) {
      publishErrors.push(`Orphan mappings (not in template body): ${orphans.join(', ')}`)
    }

    // Check 3: Invalid conditions  -  conditions referenced in body but not defined
    const bodyConditions = new Set<string>()
    if (body.sections) {
      for (const section of body.sections) {
        if (section.condition_key) bodyConditions.add(section.condition_key)
        if (section.elements) {
          for (const el of section.elements) {
            if (el.condition_key) bodyConditions.add(el.condition_key)
          }
        }
      }
    }
    const invalidConditions = [...bodyConditions].filter(c => !conditionKeys.has(c))
    if (invalidConditions.length > 0) {
      publishErrors.push(`Invalid conditions (referenced but not defined): ${invalidConditions.join(', ')}`)
    }

    // Check 4: Broken clause slots  -  slots with no assignments
    const clauseSlots = new Set<string>()
    if (body.sections) {
      for (const section of body.sections) {
        if (section.elements) {
          for (const el of section.elements) {
            if (el.type === 'clause_placeholder' && el.clause_placement_key) {
              clauseSlots.add(el.clause_placement_key)
            }
          }
        }
      }
    }
    const assignedSlots = new Set((vClauseAssignments ?? []).map(a => a.placement_key))
    const brokenSlots = [...clauseSlots].filter(s => !assignedSlots.has(s))
    if (brokenSlots.length > 0) {
      publishErrors.push(`Clause slots with no assignments: ${brokenSlots.join(', ')}`)
    }

    // Check 5: Preview validation  -  body must be valid JSON structure
    if (!body.sections || !Array.isArray(body.sections)) {
      publishErrors.push('Template body missing sections array')
    }

    // Check 6: Structure check  -  sections must have required properties
    if (body.sections) {
      for (let i = 0; i < body.sections.length; i++) {
        const s = body.sections[i]
        if (!s.elements || !Array.isArray(s.elements)) {
          publishErrors.push(`Section ${i + 1} missing elements array`)
        }
      }
    }
  } else {
    publishErrors.push('Template body is empty or could not be loaded')
  }

  if (publishErrors.length > 0) {
    return { success: false, error: `Publish validation failed:\n${publishErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` }
  }

  // Supersede the current published version (if any)
  await supabase
    .from('document_template_versions')
    .update({ status: 'superseded' } as never)
    .eq('template_id', params.templateId)
    .eq('status', 'published')

  // Publish the new version
  const { error: publishError } = await supabase
    .from('document_template_versions')
    .update({ status: 'published', published_at: new Date().toISOString() } as never)
    .eq('id', params.versionId)

  if (publishError) {
    return { success: false, error: publishError.message }
  }

  // Update template to point to new current version + set status to published
  await supabase
    .from('docgen_templates')
    .update({
      current_version_id: params.versionId,
      status: 'published',
      updated_by: params.publishedBy,
    } as never)
    .eq('id', params.templateId)

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: params.templateId,
    templateVersionId: params.versionId,
    eventType: 'version_published',
    eventPayload: { version_number: version.version_number },
    performedBy: params.publishedBy,
  })

  return { success: true }
}

// ─── Get Template With Version ───────────────────────────────────────────────

export async function getTemplateWithVersion(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; templateId: string }
): Promise<ServiceResult<TemplateWithVersion>> {
  // Fetch template
  const { data: template } = await supabase
    .from('docgen_templates')
    .select('*')
    .eq('id', params.templateId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!template) {
    return { success: false, error: 'Template not found' }
  }

  // If no version exists yet, return template with empty version data
  if (!template.current_version_id) {
    // Try to find the latest version (may be a draft not yet set as current)
    const { data: latestVersion } = await supabase
      .from('document_template_versions')
      .select('*')
      .eq('template_id', params.templateId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()

    return {
      success: true,
      data: {
        template: template as unknown as DocumentTemplateRow,
        version: (latestVersion ?? null) as DocumentTemplateVersionRow | null,
        mappings: [] as DocumentTemplateMappingRow[],
        conditions: [] as DocumentTemplateConditionRow[],
        clauseAssignments: [] as TemplateWithVersion['clauseAssignments'],
      },
    }
  }

  // Fetch version + related data in parallel
  const [versionResult, mappingsResult, conditionsResult, clauseAssignmentsResult] = await Promise.all([
    supabase
      .from('document_template_versions')
      .select('*')
      .eq('id', template.current_version_id)
      .single(),
    supabase
      .from('document_template_mappings')
      .select('*')
      .eq('template_version_id', template.current_version_id)
      .order('sort_order'),
    supabase
      .from('document_template_conditions')
      .select('*')
      .eq('template_version_id', template.current_version_id)
      .order('evaluation_order'),
    supabase
      .from('document_clause_assignments')
      .select('*, clause:document_clauses(*)')
      .eq('template_version_id', template.current_version_id)
      .order('sort_order'),
  ])

  if (!versionResult.data) {
    return { success: false, error: 'Published version not found' }
  }

  return {
    success: true,
    data: {
      template: template as unknown as DocumentTemplateRow,
      version: versionResult.data as DocumentTemplateVersionRow,
      mappings: (mappingsResult.data ?? []) as DocumentTemplateMappingRow[],
      conditions: (conditionsResult.data ?? []) as DocumentTemplateConditionRow[],
      clauseAssignments: (clauseAssignmentsResult.data ?? []) as unknown as TemplateWithVersion['clauseAssignments'],
    },
  }
}

// ─── Clone Template ──────────────────────────────────────────────────────────

export async function cloneTemplate(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    sourceTemplateId: string
    newTemplateKey: string
    newName: string
    clonedBy: string
  }
): Promise<ServiceResult<DocumentTemplateRow>> {
  const source = await getTemplateWithVersion(supabase, {
    tenantId: params.tenantId,
    templateId: params.sourceTemplateId,
  })

  if (!source.success || !source.data) {
    return { success: false, error: source.error ?? 'Source template not found' }
  }

  // Create new template
  const sourceTemplate = source.data.template as unknown as Record<string, unknown>
  const templateResult = await createTemplate(supabase, {
    tenantId: params.tenantId,
    templateKey: params.newTemplateKey,
    name: params.newName,
    description: (sourceTemplate.description as string) ?? undefined,
    documentFamily: sourceTemplate.document_family as string,
    practiceArea: (sourceTemplate.practice_area as string) ?? undefined,
    matterTypeId: (sourceTemplate.matter_type_id as string) ?? undefined,
    jurisdictionCode: (sourceTemplate.jurisdiction_code as string) ?? undefined,
    languageCode: (sourceTemplate.language_code as string) ?? undefined,
    requiresReview: sourceTemplate.requires_review as boolean,
    createdBy: params.clonedBy,
  })

  if (!templateResult.success || !templateResult.data) {
    return templateResult
  }

  // Create version with cloned data
  const versionResult = await createTemplateVersion(supabase, {
    tenantId: params.tenantId,
    templateId: templateResult.data.id,
    templateBody: source.data.version?.template_body as unknown as TemplateBody,
    versionLabel: 'v1 (cloned)',
    changeSummary: `Cloned from "${source.data.template.name}"`,
    mappings: source.data.mappings.map(({ id, tenant_id, template_version_id, created_at, ...rest }) => rest),
    conditions: source.data.conditions.map(({ id, tenant_id, template_version_id, created_at, ...rest }) => rest),
    clauseAssignments: source.data.clauseAssignments.map(({ id, tenant_id, template_version_id, created_at, clause, ...rest }) => rest),
    createdBy: params.clonedBy,
  })

  if (!versionResult.success) {
    return { success: false, error: versionResult.error }
  }

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: templateResult.data.id,
    eventType: 'template_cloned',
    eventPayload: { source_template_id: params.sourceTemplateId },
    performedBy: params.clonedBy,
  })

  return { success: true, data: templateResult.data }
}

// ─── Archive Template ────────────────────────────────────────────────────────

export async function archiveTemplate(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    templateId: string
    archivedBy: string
  }
): Promise<ServiceResult> {
  // Fetch template
  const { data: template } = await supabase
    .from('docgen_templates')
    .select('id, status, is_system_template')
    .eq('id', params.templateId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!template) {
    return { success: false, error: 'Template not found' }
  }

  if (template.is_system_template) {
    return { success: false, error: 'System templates cannot be archived  -  clone instead' }
  }

  // Check for active published version
  const { data: publishedVersions } = await supabase
    .from('document_template_versions')
    .select('id')
    .eq('template_id', params.templateId)
    .eq('status', 'published')
    .limit(1)

  if (publishedVersions && publishedVersions.length > 0) {
    return { success: false, error: 'Cannot archive a template with an active published version  -  supersede it first' }
  }

  // Check for in-flight instances
  const { count } = await supabase
    .from('document_instances')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', params.templateId)
    .in('status', ['draft', 'pending_review', 'approved', 'sent', 'partially_signed'])

  if (count && count > 0) {
    return { success: false, error: `Cannot archive  -  ${count} document(s) are still in progress` }
  }

  // Archive
  const { error } = await supabase
    .from('docgen_templates')
    .update({ status: 'archived', updated_by: params.archivedBy } as never)
    .eq('id', params.templateId)

  if (error) {
    return { success: false, error: error.message }
  }

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: params.templateId,
    eventType: 'template_archived',
    performedBy: params.archivedBy,
  })

  return { success: true }
}

// ─── Delete Template (Soft) ──────────────────────────────────────────────────

export async function deleteTemplate(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    templateId: string
    deletedBy: string
  }
): Promise<ServiceResult> {
  const { data: template } = await supabase
    .from('docgen_templates')
    .select('id, status, is_system_template')
    .eq('id', params.templateId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!template) {
    return { success: false, error: 'Template not found' }
  }

  if (template.is_system_template) {
    return { success: false, error: 'System templates cannot be deleted' }
  }

  if (template.status !== 'draft') {
    return { success: false, error: 'Only draft templates can be deleted' }
  }

  // Check no non-draft versions exist
  const { data: versions } = await supabase
    .from('document_template_versions')
    .select('id, status')
    .eq('template_id', params.templateId)
    .neq('status', 'draft')
    .limit(1)

  if (versions && versions.length > 0) {
    return { success: false, error: 'Cannot delete  -  template has non-draft versions' }
  }

  // Check no instances exist
  const { count } = await supabase
    .from('document_instances')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', params.templateId)

  if (count && count > 0) {
    return { success: false, error: 'Cannot delete  -  template has generated documents' }
  }

  // Soft-delete
  const { error } = await supabase
    .from('docgen_templates')
    .update({ is_active: false, updated_by: params.deletedBy } as never)
    .eq('id', params.templateId)

  if (error) {
    return { success: false, error: error.message }
  }

  await logTemplateAudit(supabase, {
    tenantId: params.tenantId,
    templateId: params.templateId,
    eventType: 'template_deleted',
    performedBy: params.deletedBy,
  })

  return { success: true }
}

// ─── List Templates ──────────────────────────────────────────────────────────

export async function listTemplates(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    documentFamily?: string
    status?: string
    includeInactive?: boolean
  }
): Promise<ServiceResult<DocumentTemplateRow[]>> {
  let query = supabase
    .from('docgen_templates')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .order('name')

  if (!params.includeInactive) {
    query = query.eq('is_active', true)
  }

  if (params.documentFamily) {
    query = query.eq('document_family', params.documentFamily)
  }

  if (params.status) {
    query = (query as unknown as typeof query).eq('status', params.status as never)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: (data ?? []) as unknown as DocumentTemplateRow[] }
}
