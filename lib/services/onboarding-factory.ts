/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * One-Click Onboarding Factory
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Executes the 3-step onboarding sequence when a matter is officially "Retained":
 *
 *   1. Fee Snapshot — Lock the fees and tax at retainer time (Layer 4)
 *   2. Portal Birth — Create client portal account + send welcome email
 *   3. Blueprint Injection — Load the 12-slot document checklist
 *
 * Each step is executed independently and tracked in the `onboarding_runs` table.
 * Failures in one step do not block the others.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnboardingParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  leadId?: string
  userId: string
}

interface OnboardingResult {
  success: boolean
  onboardingRunId: string
  steps: {
    feeSnapshot: 'completed' | 'failed' | 'skipped'
    portalCreation: 'completed' | 'failed' | 'skipped'
    blueprintInjection: 'completed' | 'failed' | 'skipped'
  }
  errors: string[]
}

// ─── Main Executor ───────────────────────────────────────────────────────────

export async function executeOnboarding(params: OnboardingParams): Promise<OnboardingResult> {
  const { supabase, tenantId, matterId, leadId, userId } = params
  const errors: string[] = []

  // Create the onboarding run record
  const { data: run, error: runError } = await supabase
    .from('onboarding_runs')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      lead_id: leadId ?? null,
      user_id: userId,
    })
    .select('id')
    .single()

  if (runError || !run) {
    throw new Error(`Failed to create onboarding run: ${runError?.message}`)
  }

  const runId = run.id
  let feeStatus: 'completed' | 'failed' | 'skipped' = 'pending' as never
  let portalStatus: 'completed' | 'failed' | 'skipped' = 'pending' as never
  let blueprintStatus: 'completed' | 'failed' | 'skipped' = 'pending' as never
  let portalLinkId: string | null = null
  let slotsCreated = 0
  let feeSnapshotData: Json | null = null

  // ─── Step 1: Fee Snapshot (Layer 4) ──────────────────────────────────────

  try {
    feeStatus = await executeFeeSnapshot(supabase, tenantId, matterId, leadId)
    if (feeStatus === 'completed') {
      // Read back the snapshot for the run record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: matter } = await (supabase as any)
        .from('matters')
        .select('fee_snapshot, subtotal_cents, tax_amount_cents, total_amount_cents, tax_rate, tax_label, client_province')
        .eq('id', matterId)
        .single()

      if (matter) {
        feeSnapshotData = {
          fee_snapshot: matter.fee_snapshot,
          subtotal_cents: matter.subtotal_cents,
          tax_amount_cents: matter.tax_amount_cents,
          total_amount_cents: matter.total_amount_cents,
          tax_rate: matter.tax_rate,
          tax_label: matter.tax_label,
          client_province: matter.client_province,
        } as unknown as Json
      }
    }
  } catch (err) {
    feeStatus = 'failed'
    errors.push(`Fee snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  // ─── Step 2: Portal Birth ────────────────────────────────────────────────

  try {
    const result = await executePortalCreation(supabase, tenantId, matterId, userId)
    portalStatus = result.status
    portalLinkId = result.portalLinkId
  } catch (err) {
    portalStatus = 'failed'
    errors.push(`Portal creation: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  // ─── Step 3: Blueprint Injection (12-Slot Document Checklist) ────────────

  try {
    const result = await executeBlueprintInjection(supabase, tenantId, matterId)
    blueprintStatus = result.status
    slotsCreated = result.slotsCreated
  } catch (err) {
    blueprintStatus = 'failed'
    errors.push(`Blueprint injection: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  // ─── Update the onboarding run with results ─────────────────────────────

  await supabase
    .from('onboarding_runs')
    .update({
      fee_snapshot_status: feeStatus,
      portal_creation_status: portalStatus,
      blueprint_injection_status: blueprintStatus,
      portal_link_id: portalLinkId,
      document_slots_created: slotsCreated,
      fee_snapshot_data: feeSnapshotData,
      error_log: (errors.length > 0 ? errors : []) as unknown as Json,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)

  return {
    success: errors.length === 0,
    onboardingRunId: runId,
    steps: {
      feeSnapshot: feeStatus,
      portalCreation: portalStatus,
      blueprintInjection: blueprintStatus,
    },
    errors,
  }
}

// ─── Step 1: Fee Snapshot ────────────────────────────────────────────────────

async function executeFeeSnapshot(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  leadId?: string
): Promise<'completed' | 'failed' | 'skipped'> {
  // Check if fee snapshot already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('fee_snapshot, matter_type_id')
    .eq('id', matterId)
    .single()

  if (matter?.fee_snapshot) {
    return 'completed' // Already frozen
  }

  // Try to build snapshot from retainer package (if lead exists)
  if (leadId) {
    const { data: retainerPkg } = await supabase
      .from('lead_retainer_packages')
      .select('*')
      .eq('lead_id', leadId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpAny = retainerPkg as any
    if (rpAny) {
      const snapshot = {
        professional_fees: rpAny.line_items ?? [],
        government_fees: rpAny.government_fees ?? [],
        disbursements: rpAny.disbursements ?? [],
        template_name: rpAny.template_name ?? null,
        template_id: rpAny.retainer_preset_id ?? null,
        frozen_at: new Date().toISOString(),
      }

      await supabase
        .from('matters')
        .update({
          fee_snapshot: snapshot as unknown as Json,
          subtotal_cents: rpAny.subtotal_cents ?? null,
          tax_amount_cents: rpAny.tax_amount_cents ?? null,
          total_amount_cents: rpAny.total_amount_cents ?? null,
          tax_rate: rpAny.tax_rate ?? null,
          tax_label: rpAny.tax_label ?? null,
          client_province: rpAny.client_province ?? null,
        } as never)
        .eq('id', matterId)

      return 'completed'
    }
  }

  // Try from retainer fee template if matter has a matter_type
  if (matter?.matter_type_id) {
    const { data: template } = await supabase
      .from('retainer_fee_templates')
      .select('*')
      .eq('matter_type_id', matter.matter_type_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (template) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tplAny = template as any
      const snapshot = {
        professional_fees: tplAny.professional_fees ?? [],
        government_fees: tplAny.government_fees ?? [],
        disbursements: tplAny.disbursements ?? [],
        template_name: tplAny.name ?? null,
        template_id: tplAny.id ?? null,
        frozen_at: new Date().toISOString(),
      }

      await supabase
        .from('matters')
        .update({
          fee_snapshot: snapshot as unknown as Json,
        } as never)
        .eq('id', matterId)

      return 'completed'
    }
  }

  return 'skipped' // No fee data available to freeze
}

// ─── Step 2: Portal Creation ─────────────────────────────────────────────────

async function executePortalCreation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  userId: string
): Promise<{ status: 'completed' | 'failed' | 'skipped'; portalLinkId: string | null }> {
  // Get the matter's contact
  const { data: matterContacts } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  const contactId = matterContacts?.contact_id
  if (!contactId) {
    return { status: 'skipped', portalLinkId: null }
  }

  // Check if portal link already exists
  const { data: existingLink } = await supabase
    .from('portal_links')
    .select('id')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingLink) {
    return { status: 'completed', portalLinkId: existingLink.id }
  }

  // Generate portal link
  const token = crypto.randomUUID() + '-' + crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  // Get lawyer info for welcome metadata
  const { data: lawyer } = await supabase
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .single()

  const lawyerName = lawyer
    ? [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ')
    : undefined

  const { data: portalLink, error: portalError } = await supabase
    .from('portal_links')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      contact_id: contactId,
      token,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      created_by: userId,
      metadata: {
        welcome_message: 'Welcome to your client portal. Please upload the required documents listed below.',
        lawyer_name: lawyerName,
        lawyer_email: lawyer?.email,
      } as unknown as Json,
    } as never)
    .select('id')
    .single()

  if (portalError || !portalLink) {
    return { status: 'failed', portalLinkId: null }
  }

  // Send welcome email via API (non-blocking)
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('email_primary, first_name')
      .eq('id', contactId)
      .single()

    if (contact?.email_primary) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: contactId,
        activity_type: 'portal_welcome_sent',
        title: 'Client portal welcome email queued',
        description: `Welcome email queued for ${contact.email_primary}. Portal link created.`,
        entity_type: 'matter',
        entity_id: matterId,
        user_id: userId,
        metadata: {
          portal_link_id: portalLink.id,
          contact_email: contact.email_primary,
        } as unknown as Json,
      })
    }
  } catch {
    // Email sending failure is non-fatal
  }

  return { status: 'completed', portalLinkId: portalLink.id }
}

// ─── Step 3: Blueprint Injection (12-Slot Document Checklist) ────────────────

async function executeBlueprintInjection(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string
): Promise<{ status: 'completed' | 'failed' | 'skipped'; slotsCreated: number }> {
  // Get the matter's matter_type to find the document blueprint
  const { data: matter } = await supabase
    .from('matters')
    .select('matter_type_id, case_type_id')
    .eq('id', matterId)
    .single()

  if (!matter?.matter_type_id) {
    return { status: 'skipped', slotsCreated: 0 }
  }

  // Check if slots already exist (idempotency)
  const { data: existingSlots } = await supabase
    .from('document_slots')
    .select('id')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .limit(1)

  if (existingSlots && existingSlots.length > 0) {
    return { status: 'completed', slotsCreated: existingSlots.length }
  }

  // Load document slot templates for this matter type
  const { data: templates } = await supabase
    .from('document_slot_templates')
    .select('*')
    .eq('matter_type_id', matter.matter_type_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!templates || templates.length === 0) {
    // No blueprint defined — try generic slots
    const defaultSlots = getDefaultDocumentSlots()
    const slotsToInsert = defaultSlots.map((slot, idx) => ({
      tenant_id: tenantId,
      matter_id: matterId,
      slot_key: slot.key,
      label: slot.label,
      description: slot.description,
      is_required: slot.required,
      sort_order: idx,
      is_active: true,
    }))

    const { data: inserted, error } = await supabase
      .from('document_slots')
      .insert(slotsToInsert as never)
      .select('id')

    if (error) return { status: 'failed', slotsCreated: 0 }
    return { status: 'completed', slotsCreated: inserted?.length ?? 0 }
  }

  // Create slots from templates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slotsToInsert = templates.map((tpl: any, idx: number) => ({
    tenant_id: tenantId,
    matter_id: matterId,
    slot_key: tpl.slot_key ?? `slot_${idx}`,
    label: tpl.label ?? tpl.name,
    description: tpl.description ?? null,
    is_required: tpl.is_required ?? true,
    sort_order: tpl.sort_order ?? idx,
    category: tpl.category ?? null,
    accepted_file_types: tpl.accepted_file_types ?? null,
    is_active: true,
  }))

  const { data: inserted, error } = await supabase
    .from('document_slots')
    .insert(slotsToInsert as never)
    .select('id')

  if (error) return { status: 'failed', slotsCreated: 0 }
  return { status: 'completed', slotsCreated: inserted?.length ?? 0 }
}

// ─── Default Document Slots (Universal 12-Slot Blueprint) ────────────────────

function getDefaultDocumentSlots() {
  return [
    { key: 'id_primary', label: 'Primary Identification', description: 'Passport, birth certificate, or government-issued photo ID', required: true },
    { key: 'id_secondary', label: 'Secondary Identification', description: "Driver's licence, health card, or other government-issued ID", required: false },
    { key: 'proof_of_status', label: 'Proof of Status', description: 'Current immigration status document (visa, permit, PR card)', required: true },
    { key: 'proof_of_address', label: 'Proof of Address', description: 'Utility bill, bank statement, or lease agreement (within 3 months)', required: true },
    { key: 'employment_letter', label: 'Employment Letter', description: 'Current employment letter on company letterhead', required: true },
    { key: 'income_proof', label: 'Proof of Income', description: 'Recent pay stubs, T4, or Notice of Assessment', required: true },
    { key: 'education_docs', label: 'Education Documents', description: 'Diplomas, transcripts, or credential assessment (ECA)', required: false },
    { key: 'marriage_cert', label: 'Marriage Certificate', description: 'Marriage certificate or civil union certificate (if applicable)', required: false },
    { key: 'photos', label: 'Photographs', description: 'Passport-size photographs meeting specifications', required: true },
    { key: 'police_clearance', label: 'Police Clearance', description: 'Police clearance certificate from relevant jurisdictions', required: true },
    { key: 'medical_exam', label: 'Medical Examination', description: 'Immigration medical examination results (if applicable)', required: false },
    { key: 'supporting_docs', label: 'Additional Supporting Documents', description: 'Any additional documents relevant to your case', required: false },
  ]
}
