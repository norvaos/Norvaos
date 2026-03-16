/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine — Instance Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Document instance lifecycle: generate, regenerate, approve, send, void.
 *
 * Key rules:
 *   - generateInstance(): resolves fields → checks required → renders → uploads → creates instance
 *   - regenerateInstance():
 *       - Draft → re-render in place (new artifact, same instance)
 *       - Non-draft → new instance, old → superseded
 *   - All status transitions validated against VALID_INSTANCE_TRANSITIONS
 *   - All transitions logged to document_status_events
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type {
  DocumentInstanceRow,
  DocumentArtifactRow,
} from '@/lib/types/database'
import type {
  GenerateInstanceParams,
  TemplateBody,
  FieldResolutionContext,
  ClauseAssignmentWithBody,
  InstanceWithDetails,
  RenderResult,
} from '@/lib/types/document-engine'
import { VALID_INSTANCE_TRANSITIONS } from '@/lib/types/document-engine'
import { renderDocument } from './render-engine'
import { findMissingRequiredFields, resolveFields, buildFieldMap } from './field-resolver'
import { getTemplateWithVersion } from './template-service'
import { logInstanceEvent } from './audit-service'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── Generate Instance ───────────────────────────────────────────────────────

export async function generateInstance(
  supabase: SupabaseClient<Database>,
  params: GenerateInstanceParams
): Promise<ServiceResult<DocumentInstanceRow>> {
  const { tenantId, templateId, matterId, contactId, customValues, generatedBy } = params

  // 1. Fetch template with published version
  const templateResult = await getTemplateWithVersion(supabase, { tenantId, templateId })
  if (!templateResult.success || !templateResult.data) {
    return { success: false, error: templateResult.error ?? 'Template not found' }
  }

  const { template, version, mappings, conditions, clauseAssignments } = templateResult.data
  if (!version) return { success: false, error: 'No template version found' }
  const templateBody = version.template_body as unknown as TemplateBody

  // ── REDLINE 5: Closed-matter check ──────────────────────────────────────────
  const { data: matter } = await supabase
    .from('matters')
    .select('id, status')
    .eq('id', matterId)
    .single()

  if (matter && matter.status !== 'active') {
    const allowedClosedFamilies = ['general', 'correspondence']
    const isOverrideAllowed = allowedClosedFamilies.includes(template.document_family)
    const hasOverride = params.generationMode === 'closed_matter_override'

    if (!isOverrideAllowed) {
      return { success: false, error: `Cannot generate documents for closed matters (family: ${template.document_family}). Only general and correspondence documents are permitted with override.` }
    }
    if (!hasOverride) {
      return { success: false, error: 'This matter is closed. Generation requires explicit override confirmation for general/correspondence documents.' }
    }
  }

  // 2. Build field resolution context
  const fieldContext = await buildFieldContext(supabase, { tenantId, matterId, contactId })

  if (customValues) {
    Object.assign(fieldContext.customValues, customValues)
  }

  // 3. Check required fields
  const resolved = resolveFields(mappings, fieldContext)
  const missing = findMissingRequiredFields(mappings, resolved)

  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missing.map((m) => m.display_name).join(', ')}`,
    }
  }

  // ── REDLINE 1: Unresolved placeholders block final generation ───────────────
  const fieldMap = buildFieldMap(resolved)
  const allContent = JSON.stringify(templateBody)
  const placeholderRegex = /\{\{([^}]+)\}\}/g
  const unresolvedPlaceholders: string[] = []
  let match: RegExpExecArray | null
  while ((match = placeholderRegex.exec(allContent)) !== null) {
    const key = match[1].trim()
    if (!(key in fieldMap)) {
      unresolvedPlaceholders.push(key)
    }
  }
  if (unresolvedPlaceholders.length > 0) {
    return {
      success: false,
      error: `Unresolved placeholders block generation: ${[...new Set(unresolvedPlaceholders)].join(', ')}. All placeholders must be mapped before final generation.`,
    }
  }

  // ── REDLINE 2: No silent truncation — max_length enforcement ────────────────
  const oversizedFields: string[] = []
  for (const mapping of mappings) {
    if (mapping.max_length && mapping.max_length > 0) {
      const value = fieldMap[mapping.field_key] ?? ''
      if (value.length > mapping.max_length) {
        oversizedFields.push(`${mapping.display_name} (${value.length} chars, max ${mapping.max_length})`)
      }
    }
  }
  if (oversizedFields.length > 0) {
    return {
      success: false,
      error: `Fields exceed maximum length: ${oversizedFields.join('; ')}. Shorten the source data before generating.`,
    }
  }

  // 4. Build clause assignments with body content
  const clauseAssignmentsWithBody: ClauseAssignmentWithBody[] = clauseAssignments.map((ca) => ({
    placement_key: ca.placement_key,
    clause_key: ca.clause?.clause_key ?? '',
    clause_name: ca.clause?.name ?? '',
    content: ca.clause?.content ?? '',
    sort_order: ca.sort_order,
    is_required: ca.is_required,
    condition_id: ca.condition_id,
  }))

  // 5. Render document
  const documentTitle = `${template.name} — ${fieldContext.contact.full_name ?? 'Unknown'}`

  let renderResult: RenderResult
  try {
    renderResult = await renderDocument({
      templateBody,
      mappings,
      conditions,
      clauseAssignments: clauseAssignmentsWithBody,
      fieldContext,
      documentTitle,
    })
  } catch (err) {
    return { success: false, error: `Render failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  // 6. Upload artifact to storage
  const storagePath = `${tenantId}/documents/${Date.now()}-${renderResult.fileName}`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, renderResult.buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` }
  }

  // 7. Create instance record
  const { data: instance, error: instanceError } = await supabase
    .from('document_instances')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      contact_id: contactId ?? null,
      template_id: templateId,
      template_version_id: version.id,
      document_family: template.document_family,
      jurisdiction_code: template.jurisdiction_code,
      title: documentTitle,
      status: 'draft',
      generation_mode: (['manual', 'auto', 'workflow_trigger'].includes(params.generationMode ?? '')
        ? params.generationMode
        : 'manual') as never,
      source_snapshot_json: { fieldContext, templateBody } as unknown as Record<string, unknown>,
      generated_by: generatedBy,
      is_active: true,
    } as never)
    .select()
    .single()

  if (instanceError || !instance) {
    return { success: false, error: instanceError?.message ?? 'Failed to create instance' }
  }

  // 8. Create artifact record
  const { data: artifact } = await supabase
    .from('document_artifacts')
    .insert({
      tenant_id: tenantId,
      instance_id: instance.id,
      artifact_type: 'generated_draft',
      storage_path: storagePath,
      file_name: renderResult.fileName,
      file_size: renderResult.fileSize,
      file_type: 'docx',
      checksum_sha256: renderResult.checksum,
      is_final: false,
      created_by: generatedBy,
    } as never)
    .select()
    .single()

  // Update instance with latest artifact
  if (artifact) {
    await supabase
      .from('document_instances')
      .update({ latest_artifact_id: artifact.id } as never)
      .eq('id', instance.id)
  }

  // 9. Save resolved fields
  const resolvedFieldMap = buildFieldMap(renderResult.resolvedFields)
  const fieldInserts = renderResult.resolvedFields.map((f) => ({
    tenant_id: tenantId,
    document_instance_id: instance.id,
    field_key: f.field_key,
    resolved_value_text: f.resolved_value,
    resolution_status: f.was_empty ? 'missing' : 'resolved',
    source_path: `${f.source_entity}.${f.source_path}`,
  }))

  if (fieldInserts.length > 0) {
    await supabase.from('document_instance_fields').insert(fieldInserts as never)
  }

  // 10. Log event
  await logInstanceEvent(supabase, {
    tenantId,
    instanceId: instance.id,
    eventType: 'generated',
    toStatus: 'draft',
    eventPayload: {
      template_name: template.name,
      version_number: version.version_number,
      checksum: renderResult.checksum,
    },
    performedBy: generatedBy,
  })

  return { success: true, data: instance as DocumentInstanceRow }
}

// ─── Regenerate Instance ─────────────────────────────────────────────────────

export async function regenerateInstance(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    instanceId: string
    customValues?: Record<string, string>
    regeneratedBy: string
  }
): Promise<ServiceResult<DocumentInstanceRow>> {
  // Fetch existing instance
  const { data: instance } = await supabase
    .from('document_instances')
    .select('*')
    .eq('id', params.instanceId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!instance) {
    return { success: false, error: 'Instance not found' }
  }

  if (instance.status === 'draft') {
    // Re-render in place — same instance, new artifact
    return regenerateDraft(supabase, instance as DocumentInstanceRow, params)
  }

  // Non-draft: create new instance, supersede old
  return regenerateAsNewInstance(supabase, instance as DocumentInstanceRow, params)
}

async function regenerateDraft(
  supabase: SupabaseClient<Database>,
  instance: DocumentInstanceRow,
  params: { tenantId: string; customValues?: Record<string, string>; regeneratedBy: string }
): Promise<ServiceResult<DocumentInstanceRow>> {
  // Generate with same template
  const result = await generateInstance(supabase, {
    tenantId: params.tenantId,
    templateId: instance.template_id,
    matterId: instance.matter_id ?? '',
    contactId: instance.contact_id ?? undefined,
    customValues: params.customValues,
    generatedBy: params.regeneratedBy,
  })

  if (!result.success) {
    return result
  }

  // Delete the old draft instance (it's been replaced)
  await supabase
    .from('document_instances')
    .update({ is_active: false } as never)
    .eq('id', instance.id)

  await logInstanceEvent(supabase, {
    tenantId: params.tenantId,
    instanceId: instance.id,
    eventType: 'regenerated_draft',
    eventPayload: { new_instance_id: result.data?.id },
    performedBy: params.regeneratedBy,
  })

  return result
}

async function regenerateAsNewInstance(
  supabase: SupabaseClient<Database>,
  instance: DocumentInstanceRow,
  params: { tenantId: string; customValues?: Record<string, string>; regeneratedBy: string }
): Promise<ServiceResult<DocumentInstanceRow>> {
  // Generate new instance
  const result = await generateInstance(supabase, {
    tenantId: params.tenantId,
    templateId: instance.template_id,
    matterId: instance.matter_id ?? '',
    contactId: instance.contact_id ?? undefined,
    customValues: params.customValues,
    generatedBy: params.regeneratedBy,
  })

  if (!result.success || !result.data) {
    return result
  }

  // Set supersession link
  await supabase
    .from('document_instances')
    .update({ supersedes_instance_id: instance.id } as never)
    .eq('id', result.data.id)

  // Transition old instance to superseded
  await transitionStatus(supabase, {
    tenantId: params.tenantId,
    instanceId: instance.id,
    newStatus: 'superseded',
    performedBy: params.regeneratedBy,
    eventPayload: { superseded_by: result.data.id },
  })

  return result
}

// ─── Status Transitions ──────────────────────────────────────────────────────

export async function transitionStatus(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    instanceId: string
    newStatus: string
    performedBy: string
    eventPayload?: Record<string, unknown>
  }
): Promise<ServiceResult> {
  const { data: instance } = await supabase
    .from('document_instances')
    .select('id, status')
    .eq('id', params.instanceId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!instance) {
    return { success: false, error: 'Instance not found' }
  }

  const allowed = VALID_INSTANCE_TRANSITIONS[instance.status]
  if (!allowed || !allowed.includes(params.newStatus)) {
    return {
      success: false,
      error: `Invalid transition: "${instance.status}" → "${params.newStatus}"`,
    }
  }

  const { error } = await supabase
    .from('document_instances')
    .update({ status: params.newStatus } as never)
    .eq('id', params.instanceId)

  if (error) {
    return { success: false, error: error.message }
  }

  await logInstanceEvent(supabase, {
    tenantId: params.tenantId,
    instanceId: params.instanceId,
    eventType: 'status_changed',
    fromStatus: instance.status,
    toStatus: params.newStatus,
    eventPayload: params.eventPayload,
    performedBy: params.performedBy,
  })

  return { success: true }
}

// ─── Approve / Send / Void ───────────────────────────────────────────────────

export async function approveInstance(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; instanceId: string; approvedBy: string }
): Promise<ServiceResult> {
  return transitionStatus(supabase, {
    tenantId: params.tenantId,
    instanceId: params.instanceId,
    newStatus: 'approved',
    performedBy: params.approvedBy,
  })
}

export async function sendInstance(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; instanceId: string; sentBy: string }
): Promise<ServiceResult> {
  return transitionStatus(supabase, {
    tenantId: params.tenantId,
    instanceId: params.instanceId,
    newStatus: 'sent',
    performedBy: params.sentBy,
  })
}

export async function voidInstance(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; instanceId: string; reason: string; voidedBy: string }
): Promise<ServiceResult> {
  return transitionStatus(supabase, {
    tenantId: params.tenantId,
    instanceId: params.instanceId,
    newStatus: 'voided',
    performedBy: params.voidedBy,
    eventPayload: { reason: params.reason },
  })
}

// ─── Get Instance With Details ───────────────────────────────────────────────

export async function getInstanceWithDetails(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; instanceId: string }
): Promise<ServiceResult<InstanceWithDetails>> {
  const [instanceResult, artifactsResult, fieldsResult, eventsResult, sigRequestResult, supersededByResult, supersedesResult] = await Promise.all([
    supabase.from('document_instances').select('*').eq('id', params.instanceId).eq('tenant_id', params.tenantId).single(),
    supabase.from('document_artifacts').select('*').eq('instance_id', params.instanceId).order('created_at', { ascending: false }),
    supabase.from('document_instance_fields').select('*').eq('document_instance_id', params.instanceId),
    supabase.from('document_status_events').select('*').eq('document_instance_id', params.instanceId).order('performed_at', { ascending: false }),
    supabase.from('document_signature_requests').select('*').eq('document_instance_id', params.instanceId).order('created_at', { ascending: false }).limit(1),
    supabase.from('document_instances').select('*').eq('supersedes_instance_id', params.instanceId).limit(1),
    supabase.from('document_instances').select('id, supersedes_instance_id').eq('id', params.instanceId).single(),
  ])

  if (!instanceResult.data) {
    return { success: false, error: 'Instance not found' }
  }

  // Fetch signers if signature request exists
  const sigRequest = sigRequestResult.data?.[0] ?? null
  let signers: InstanceWithDetails['signers'] = []
  if (sigRequest) {
    const { data: signerData } = await supabase
      .from('document_signers')
      .select('*')
      .eq('signature_request_id', sigRequest.id)
      .order('signing_order')
    signers = (signerData ?? []) as InstanceWithDetails['signers']
  }

  // Fetch supersedes instance if link exists
  let supersedesInstance = null
  if (supersedesResult.data?.supersedes_instance_id) {
    const { data } = await supabase
      .from('document_instances')
      .select('*')
      .eq('id', supersedesResult.data.supersedes_instance_id)
      .single()
    supersedesInstance = data
  }

  return {
    success: true,
    data: {
      instance: instanceResult.data,
      artifacts: (artifactsResult.data ?? []),
      fields: (fieldsResult.data ?? []),
      events: (eventsResult.data ?? []),
      signatureRequest: sigRequest,
      signers,
      supersededBy: supersededByResult.data?.[0] ?? null,
      supersedes: supersedesInstance,
    } as InstanceWithDetails,
  }
}

// ─── List Instances ──────────────────────────────────────────────────────────

export async function listInstances(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId?: string
    contactId?: string
    status?: string
    documentFamily?: string
  }
): Promise<ServiceResult<DocumentInstanceRow[]>> {
  let query = supabase
    .from('document_instances')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (params.matterId) query = query.eq('matter_id', params.matterId)
  if (params.contactId) query = query.eq('contact_id', params.contactId)
  if (params.status) query = query.eq('status', params.status)
  if (params.documentFamily) query = query.eq('document_family', params.documentFamily)

  const { data, error } = await query

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: (data ?? []) as DocumentInstanceRow[] }
}

// ─── Download URL ────────────────────────────────────────────────────────────

export async function getDownloadUrl(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; instanceId: string }
): Promise<ServiceResult<{ url: string; fileName: string }>> {
  const { data: instance } = await supabase
    .from('document_instances')
    .select('latest_artifact_id')
    .eq('id', params.instanceId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!instance?.latest_artifact_id) {
    return { success: false, error: 'No artifact found' }
  }

  const { data: artifact } = await supabase
    .from('document_artifacts')
    .select('storage_path, file_name')
    .eq('id', instance.latest_artifact_id)
    .single()

  if (!artifact) {
    return { success: false, error: 'Artifact not found' }
  }

  const { data: signedUrl } = await supabase.storage
    .from('documents')
    .createSignedUrl(artifact.storage_path, 60 * 5) // 5 minutes

  if (!signedUrl?.signedUrl) {
    return { success: false, error: 'Failed to generate download URL' }
  }

  return { success: true, data: { url: signedUrl.signedUrl, fileName: artifact.file_name } }
}

// ─── Field Context Builder ───────────────────────────────────────────────────

async function buildFieldContext(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; matterId: string; contactId?: string }
): Promise<FieldResolutionContext> {
  const [matterResult, tenantResult] = await Promise.all([
    supabase.from('matters').select('*').eq('id', params.matterId).single(),
    supabase.from('tenants').select('*').eq('id', params.tenantId).single(),
  ])

  const matter = matterResult.data ?? {}
  const tenant = tenantResult.data ?? {}

  // Fetch contact (primary from matter or explicit)
  let contact: Record<string, unknown> = {}
  const contactId = params.contactId ?? (matter as Record<string, unknown>).primary_contact_id
  if (contactId) {
    const { data } = await supabase.from('contacts').select('*').eq('id', contactId as string).single()
    contact = (data ?? {}) as Record<string, unknown>
    // Compute full_name from first_name + last_name if not present
    if (!contact.full_name && (contact.first_name || contact.last_name)) {
      contact.full_name = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
    }
  }

  // Fetch billing info for the matter
  let billing: Record<string, unknown> = {}
  const { data: billingData } = await supabase
    .from('matters')
    .select('billing_type, total_billed, total_paid, trust_balance')
    .eq('id', params.matterId)
    .single()
  if (billingData) {
    billing = billingData as Record<string, unknown>
  }

  // Fetch assigned lawyer
  let lawyer: Record<string, unknown> = {}
  const lawyerId = (matter as Record<string, unknown>).assigned_lawyer_id
  if (lawyerId) {
    const { data } = await supabase.from('users').select('*').eq('id', lawyerId as string).single()
    lawyer = data ?? {}
  }

  return {
    matter: matter as Record<string, unknown>,
    contact,
    billing,
    tenant: tenant as Record<string, unknown>,
    lawyer,
    customValues: {},
  }
}
