/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Summary Recalculator — Single Source-of-Truth Boundary
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the ONLY service permitted to UPDATE derived summary fields on the
 * leads table. No controller, route, UI action, or background process may
 * directly update these fields.
 *
 * Source-of-truth hierarchy:
 *   qualification_status       ← lead_qualification_decisions (latest)
 *   conflict_status            ← conflict engine (existing)
 *   consultation_status        ← lead_consultations (latest)
 *   retainer_status            ← lead_retainer_packages (latest)
 *   payment_status             ← lead_retainer_packages.payment_status
 *   overdue_task_count         ← lead_milestone_tasks (pending + overdue)
 *   next_required_action       ← lead_milestone_tasks (earliest pending)
 *   next_required_action_due_at ← lead_milestone_tasks (earliest due)
 *   last_inbound_at            ← lead_communication_events (latest inbound)
 *   last_outbound_at           ← lead_communication_events (latest outbound)
 *   current_stage              ← lead_stage_history (latest to_stage)
 *   last_automated_action_at   ← lead_communication_events (latest system)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Summary Field Enum ──────────────────────────────────────────────────────

export type SummaryField =
  | 'qualification_status'
  | 'conflict_status'
  | 'consultation_status'
  | 'retainer_status'
  | 'payment_status'
  | 'overdue_task_count'
  | 'next_required_action'
  | 'last_inbound_at'
  | 'last_outbound_at'
  | 'current_stage'
  | 'last_automated_action_at'

type LeadUpdate = Database['public']['Tables']['leads']['Update']

// ─── Main Recalculator ───────────────────────────────────────────────────────

/**
 * Recalculate derived summary fields on the leads table.
 * This is the ONLY function permitted to update these fields.
 *
 * @param fields - Optional partial recalc. If omitted, all fields are recalculated.
 */
export async function recalculateLeadSummary(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  options?: { fields?: SummaryField[] }
): Promise<void> {
  const fieldsToRecalc = options?.fields ?? ALL_FIELDS
  const updates: LeadUpdate = {}

  // Execute recalculators in parallel where possible
  const promises: Promise<void>[] = []

  if (fieldsToRecalc.includes('qualification_status')) {
    promises.push(
      recalcQualificationStatus(supabase, leadId).then((v) => { updates.qualification_status = v })
    )
  }

  if (fieldsToRecalc.includes('consultation_status')) {
    promises.push(
      recalcConsultationStatus(supabase, leadId).then((v) => { updates.consultation_status = v })
    )
  }

  if (fieldsToRecalc.includes('retainer_status') || fieldsToRecalc.includes('payment_status')) {
    promises.push(
      recalcRetainerAndPaymentStatus(supabase, leadId).then((v) => {
        if (fieldsToRecalc.includes('retainer_status')) updates.retainer_status = v.retainerStatus
        if (fieldsToRecalc.includes('payment_status')) updates.payment_status = v.paymentStatus
      })
    )
  }

  if (fieldsToRecalc.includes('overdue_task_count') || fieldsToRecalc.includes('next_required_action')) {
    promises.push(
      recalcTaskSummary(supabase, leadId).then((v) => {
        if (fieldsToRecalc.includes('overdue_task_count')) updates.overdue_task_count = v.overdueCount
        if (fieldsToRecalc.includes('next_required_action')) {
          updates.next_required_action = v.nextAction
          updates.next_required_action_due_at = v.nextActionDueAt
        }
      })
    )
  }

  if (fieldsToRecalc.includes('last_inbound_at') || fieldsToRecalc.includes('last_outbound_at') || fieldsToRecalc.includes('last_automated_action_at')) {
    promises.push(
      recalcCommunicationTimestamps(supabase, leadId).then((v) => {
        if (fieldsToRecalc.includes('last_inbound_at')) updates.last_inbound_at = v.lastInbound
        if (fieldsToRecalc.includes('last_outbound_at')) updates.last_outbound_at = v.lastOutbound
        if (fieldsToRecalc.includes('last_automated_action_at')) updates.last_automated_action_at = v.lastAutomated
      })
    )
  }

  if (fieldsToRecalc.includes('current_stage')) {
    promises.push(
      recalcCurrentStage(supabase, leadId).then((v) => { updates.current_stage = v })
    )
  }

  await Promise.all(promises)

  // Only update if there are changes
  if (Object.keys(updates).length === 0) return

  await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
}

const ALL_FIELDS: SummaryField[] = [
  'qualification_status',
  'consultation_status',
  'retainer_status',
  'payment_status',
  'overdue_task_count',
  'next_required_action',
  'last_inbound_at',
  'last_outbound_at',
  'current_stage',
  'last_automated_action_at',
]

// ─── Individual Field Recalculators ──────────────────────────────────────────

async function recalcQualificationStatus(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<string> {
  const { data } = await supabase
    .from('lead_qualification_decisions')
    .select('status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.status ?? 'pending'
}

async function recalcConsultationStatus(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<string> {
  const { data } = await supabase
    .from('lead_consultations')
    .select('status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.status ?? 'not_booked'
}

async function recalcRetainerAndPaymentStatus(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<{ retainerStatus: string; paymentStatus: string }> {
  const { data } = await supabase
    .from('lead_retainer_packages')
    .select('status, payment_status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    retainerStatus: data?.status ?? 'not_sent',
    paymentStatus: data?.payment_status ?? 'not_requested',
  }
}

async function recalcTaskSummary(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<{ overdueCount: number; nextAction: string | null; nextActionDueAt: string | null }> {
  const now = new Date().toISOString()

  // Count overdue tasks
  const { count: overdueCount } = await supabase
    .from('lead_milestone_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .not('status', 'in', '("completed","skipped","closed")')
    .lt('due_at', now)

  // Get next pending task (earliest by due_at, then sort_order)
  const { data: nextTask } = await supabase
    .from('lead_milestone_tasks')
    .select('title, due_at')
    .eq('lead_id', leadId)
    .not('status', 'in', '("completed","skipped","closed")')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    overdueCount: overdueCount ?? 0,
    nextAction: nextTask?.title ?? null,
    nextActionDueAt: nextTask?.due_at ?? null,
  }
}

async function recalcCommunicationTimestamps(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<{ lastInbound: string | null; lastOutbound: string | null; lastAutomated: string | null }> {
  // Fetch last inbound, outbound, and system events in parallel
  const [inbound, outbound, automated] = await Promise.all([
    supabase
      .from('lead_communication_events')
      .select('occurred_at')
      .eq('lead_id', leadId)
      .eq('direction', 'inbound')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('lead_communication_events')
      .select('occurred_at')
      .eq('lead_id', leadId)
      .eq('direction', 'outbound')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('lead_communication_events')
      .select('occurred_at')
      .eq('lead_id', leadId)
      .eq('actor_type', 'system')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    lastInbound: inbound.data?.occurred_at ?? null,
    lastOutbound: outbound.data?.occurred_at ?? null,
    lastAutomated: automated.data?.occurred_at ?? null,
  }
}

async function recalcCurrentStage(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('lead_stage_history')
    .select('to_stage')
    .eq('lead_id', leadId)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.to_stage ?? null
}
