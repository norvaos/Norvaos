/**
 * next-action-engine.ts
 *
 * Computes the single most urgent "next action" for a matter by evaluating
 * eight priority tiers in descending urgency. The result is persisted back to
 * matters.next_action_* columns and returned to the caller.
 *
 * Priority order (highest → lowest):
 *   1. Critical blocker (open matter_risk_flags with severity = 'critical')
 *   2. SLA breach       (matter_sla_tracking with status = 'breached')
 *   3. Overdue task     (tasks past due_date, not complete/cancelled)
 *   4. Upcoming deadline (matter_deadlines due within 48 h)
 *   5. Missing mandatory document (document_slots unfilled)
 *   6. Pending lawyer review (matter_intake.lawyer_review_status = 'pending')
 *   7. Unsigned retainer (retainer_agreements with status = 'draft')
 *   8. No action        (all caught up)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ── Public types ─────────────────────────────────────────────────────────────

export type EscalationLevel = 'none' | 'amber' | 'red' | 'critical'

export type ActionType =
  | 'critical_blocker'
  | 'sla_breach'
  | 'overdue_task'
  | 'upcoming_deadline'
  | 'missing_document'
  | 'pending_review'
  | 'retainer_unsigned'
  | 'readiness_gap'
  | 'no_action'

export interface NextAction {
  action_type: ActionType
  description: string
  due_at: string | null           // ISO timestamp or null
  owner_role: string              // 'lawyer' | 'legal_assistant' | 'client' | 'billing'
  escalation_level: EscalationLevel
}

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Evaluate the next action for a matter and persist it to the matters row.
 *
 * Uses `(supabase as any).from(...)` for tables that may not yet appear in the
 * generated Database type (e.g. matter_sla_tracking, document_slots,
 * matter_intake)  -  same pattern as sla-engine.ts.
 *
 * @param matterId   - UUID of the matter
 * @param tenantId   - UUID of the owning tenant
 * @param supabase   - Authenticated Supabase client (server-side or admin)
 * @returns          The computed NextAction
 */
export async function computeNextAction(
  matterId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tenantId: string,
  supabase: SupabaseClient<Database>,
): Promise<NextAction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const now = new Date()
  const nowIso = now.toISOString()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()

  // ── Priority 1: Critical risk flags ──────────────────────────────────────
  {
    const { data: flags } = await db
      .from('matter_risk_flags')
      .select('id, flag_type, created_at')
      .eq('matter_id', matterId)
      .eq('status', 'open')
      .eq('severity', 'critical')
      .order('created_at', { ascending: true })
      .limit(1)

    if (flags && flags.length > 0) {
      const flag = flags[0] as { id: string; flag_type: string; created_at: string }
      const action: NextAction = {
        action_type: 'critical_blocker',
        description: `Critical risk flag: ${flag.flag_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
        due_at: null,
        owner_role: 'lawyer',
        escalation_level: 'critical',
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 2: SLA breach ────────────────────────────────────────────────
  {
    const { data: breaches } = await db
      .from('matter_sla_tracking')
      .select('id, sla_class, due_at')
      .eq('matter_id', matterId)
      .eq('status', 'breached')
      .order('due_at', { ascending: true })
      .limit(1)

    if (breaches && breaches.length > 0) {
      const breach = breaches[0] as { id: string; sla_class: string; due_at: string }
      const action: NextAction = {
        action_type: 'sla_breach',
        description: `SLA breached: ${breach.sla_class.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
        due_at: breach.due_at,
        owner_role: 'lawyer',
        escalation_level: 'critical',
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 3: Overdue tasks ─────────────────────────────────────────────
  {
    const today = now.toISOString().split('T')[0]
    const { data: tasks } = await db
      .from('tasks')
      .select('id, title, due_date, assigned_to')
      .eq('matter_id', matterId)
      .not('status', 'eq', 'done')
      .not('status', 'eq', 'cancelled')
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(1)

    if (tasks && tasks.length > 0) {
      const task = tasks[0] as { id: string; title: string; due_date: string; assigned_to: string | null }
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24),
      )
      const escalation: EscalationLevel = daysOverdue > 7 ? 'critical' : 'red'
      const action: NextAction = {
        action_type: 'overdue_task',
        description: `Overdue task: ${task.title} (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue)`,
        due_at: task.due_date,
        owner_role: 'lawyer',
        escalation_level: escalation,
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 4: Upcoming deadlines (within 48 h) ─────────────────────────
  {
    const { data: deadlines } = await db
      .from('matter_deadlines')
      .select('id, title, due_date')
      .eq('matter_id', matterId)
      .is('completed_at', null)
      .gte('due_date', nowIso)
      .lte('due_date', in48h)
      .order('due_date', { ascending: true })
      .limit(1)

    if (deadlines && deadlines.length > 0) {
      const dl = deadlines[0] as { id: string; title: string; due_date: string }
      const action: NextAction = {
        action_type: 'upcoming_deadline',
        description: `Deadline due soon: ${dl.title}`,
        due_at: dl.due_date,
        owner_role: 'lawyer',
        escalation_level: 'amber',
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 5: Missing mandatory documents ───────────────────────────────
  {
    const { data: matter } = await db
      .from('matters')
      .select('matter_type_id')
      .eq('id', matterId)
      .single()

    const matterTypeId = (matter as { matter_type_id: string | null } | null)?.matter_type_id
    if (matterTypeId) {
      const { data: slots } = await db
        .from('document_slots')
        .select('id, slot_name, document_type')
        .eq('matter_type_id', matterTypeId)
        .eq('is_mandatory', true)

      if (slots && slots.length > 0) {
        const slotIds = (slots as { id: string }[]).map((s) => s.id)
        const { data: submitted } = await db
          .from('documents')
          .select('document_slot_id')
          .eq('matter_id', matterId)
          .in('document_slot_id', slotIds)
          .not('status', 'eq', 'rejected')

        const submittedSlotIds = new Set(
          ((submitted ?? []) as { document_slot_id: string | null }[]).map((d) => d.document_slot_id),
        )
        const missingSlots = (slots as { id: string; slot_name: string; document_type: string }[]).filter(
          (s) => !submittedSlotIds.has(s.id),
        )

        if (missingSlots.length > 0) {
          const action: NextAction = {
            action_type: 'missing_document',
            description: `Missing ${missingSlots.length} mandatory document${missingSlots.length === 1 ? '' : 's'}: ${missingSlots[0].slot_name}${missingSlots.length > 1 ? ` + ${missingSlots.length - 1} more` : ''}`,
            due_at: null,
            owner_role: 'legal_assistant',
            escalation_level: 'amber',
          }
          await persistNextAction(db, matterId, action)
          return action
        }
      }
    }
  }

  // ── Priority 6: Pending lawyer review ────────────────────────────────────
  {
    const { data: intake } = await db
      .from('matter_intake')
      .select('id, lawyer_review_status')
      .eq('matter_id', matterId)
      .eq('lawyer_review_status', 'pending')
      .limit(1)

    if (intake && intake.length > 0) {
      const action: NextAction = {
        action_type: 'pending_review',
        description: 'Lawyer review pending on intake form',
        due_at: null,
        owner_role: 'lawyer',
        escalation_level: 'amber',
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 7: Unsigned retainer ─────────────────────────────────────────
  {
    const { data: retainers } = await db
      .from('retainer_agreements')
      .select('id, created_at')
      .eq('matter_id', matterId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)

    if (retainers && retainers.length > 0) {
      const action: NextAction = {
        action_type: 'retainer_unsigned',
        description: 'Retainer agreement awaiting client signature',
        due_at: null,
        owner_role: 'client',
        escalation_level: 'amber',
      }
      await persistNextAction(db, matterId, action)
      return action
    }
  }

  // ── Priority 8: No action ─────────────────────────────────────────────────
  const noAction: NextAction = {
    action_type: 'no_action',
    description: 'All caught up!',
    due_at: null,
    owner_role: 'lawyer',
    escalation_level: 'none',
  }
  await persistNextAction(db, matterId, noAction)
  return noAction
}

// ── Internal helper ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistNextAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  matterId: string,
  action: NextAction,
): Promise<void> {
  const { error } = await db
    .from('matters')
    .update({
      next_action_type:        action.action_type,
      next_action_description: action.description,
      next_action_due_at:      action.due_at,
      next_action_escalation:  action.escalation_level,
      updated_at:              new Date().toISOString(),
    })
    .eq('id', matterId)

  if (error) {
    console.error('[next-action-engine] Failed to persist next action:', error.message)
  }
}
