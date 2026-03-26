// Deadline Shield Service  -  Directive 004, Pillar 4
// AI-powered deadline scanning, immutable alert enforcement, and IRCC compliance

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Table Accessors ──────────────────────────────────────────────────────────

const from = {
  irccDeadlineRules: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('ircc_deadline_rules'),
  matterDeadlines: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('matter_deadlines'),
  notifications: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('notifications'),
  matters: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('matters'),
  users: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('users'),
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface ScanResult {
  deadlines_created: number
  deadlines_skipped: number
  rules_matched: number
}

export interface IRCCRule {
  id: string
  rule_code: string
  name: string
  description: string | null
  practice_area_code: string
  matter_type_codes: string[]
  trigger_event: string
  days_from_trigger: number
  deadline_priority: string
  is_shielded: boolean
  is_active: boolean
}

export interface ShieldedDeadline {
  id: string
  matter_id: string
  title: string
  description: string | null
  due_date: string
  status: string
  priority: string
  is_shielded: boolean
  shield_reason: string | null
  auto_generated: boolean
  source_rule_id: string | null
  alert_24h_sent: boolean
  alert_1w_sent: boolean
  alert_1m_sent: boolean
}

export interface MultiLayerAlertStats {
  alerts_24h: number
  alerts_1w: number
  alerts_1m: number
  escalations: number
}

// ── 1. scanMatterDeadlines ───────────────────────────────────────────────────
/**
 * Invoke the rpc_scan_matter_deadlines database function to auto-generate
 * shielded IRCC deadlines for a given matter. Idempotent  -  duplicate rules
 * are skipped.
 */
export async function scanMatterDeadlines(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
  userId: string,
): Promise<ServiceResult<ScanResult>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await (admin as SupabaseClient<any>).rpc(
      'rpc_scan_matter_deadlines',
      {
        p_matter_id: matterId,
        p_tenant_id: tenantId,
        p_user_id: userId,
      },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    const result = data as ScanResult
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during scan',
    }
  }
}

// ── 2. getIRCCRules ──────────────────────────────────────────────────────────
/**
 * List IRCC deadline rules, optionally filtered by practice area and active status.
 */
export async function getIRCCRules(
  supabase: SupabaseClient<Database>,
  filters?: { practiceArea?: string; isActive?: boolean },
): Promise<ServiceResult<IRCCRule[]>> {
  try {
    let query = from.irccDeadlineRules(supabase).select('*')

    if (filters?.practiceArea) {
      query = query.eq('practice_area_code', filters.practiceArea.toLowerCase())
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    query = query.order('rule_code', { ascending: true })

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as IRCCRule[] }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching rules',
    }
  }
}

// ── 3. getShieldedDeadlines ──────────────────────────────────────────────────
/**
 * List all shielded deadlines for a tenant, optionally scoped to a specific matter.
 */
export async function getShieldedDeadlines(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId?: string,
): Promise<ServiceResult<ShieldedDeadline[]>> {
  try {
    let query = from
      .matterDeadlines(supabase)
      .select(
        'id, matter_id, title, description, due_date, status, priority, is_shielded, shield_reason, auto_generated, source_rule_id, alert_24h_sent, alert_1w_sent, alert_1m_sent',
      )
      .eq('tenant_id', tenantId)
      .eq('is_shielded', true)
      .order('due_date', { ascending: true })

    if (matterId) {
      query = query.eq('matter_id', matterId)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as ShieldedDeadline[] }
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Unknown error fetching shielded deadlines',
    }
  }
}

// ── 4. processMultiLayerAlerts ───────────────────────────────────────────────
/**
 * Multi-layer alert enforcement for shielded deadlines.
 *
 * For each shielded, non-terminal deadline:
 *   - 24-hour alert  (due within 24h, alert_24h_sent = false)
 *   - 1-week alert   (due within 7d, alert_1w_sent = false)
 *   - 1-month alert  (due within 30d, alert_1m_sent = false)
 *   - Escalation     (overdue + escalation_sent = false)
 *
 * Uses admin client for all writes. Returns stats.
 */
export async function processMultiLayerAlerts(
  tenantId: string,
): Promise<ServiceResult<MultiLayerAlertStats>> {
  const admin = createAdminClient()
  const now = new Date()
  const stats: MultiLayerAlertStats = {
    alerts_24h: 0,
    alerts_1w: 0,
    alerts_1m: 0,
    escalations: 0,
  }

  try {
    // Fetch all shielded, non-terminal deadlines for this tenant
    const { data: deadlines, error: dlErr } = await from
      .matterDeadlines(admin)
      .select(
        'id, matter_id, title, description, due_date, status, priority, is_shielded, shield_reason, auto_generated, source_rule_id, alert_24h_sent, alert_1w_sent, alert_1m_sent, escalation_sent, tenant_id',
      )
      .eq('tenant_id', tenantId)
      .eq('is_shielded', true)
      .not('status', 'in', '("completed","dismissed")')

    if (dlErr || !deadlines) {
      return {
        success: false,
        error: dlErr?.message ?? 'Failed to fetch shielded deadlines',
      }
    }

    // Look up users assigned to matters so we can target notifications.
    // We need the responsible_user_id from each matter.
    const matterIds = [
      ...new Set((deadlines as any[]).map((d: any) => d.matter_id)),
    ] as string[]

    if (matterIds.length === 0) {
      return { success: true, data: stats }
    }

    const { data: matters } = await from
      .matters(admin)
      .select('id, responsible_user_id')
      .in('id', matterIds)

    const matterUserMap: Record<string, string> = {}
    for (const m of (matters ?? []) as any[]) {
      if (m.responsible_user_id) {
        matterUserMap[m.id] = m.responsible_user_id
      }
    }

    // If no responsible users found, try to get first user for the tenant as fallback
    let fallbackUserId: string | null = null
    if (Object.keys(matterUserMap).length === 0) {
      const { data: tenantUsers } = await from
        .users(admin)
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)

      if (tenantUsers && (tenantUsers as any[]).length > 0) {
        fallbackUserId = (tenantUsers as any[])[0].id
      }
    }

    for (const deadline of deadlines as any[]) {
      const dueDate = new Date(deadline.due_date)
      const msUntilDue = dueDate.getTime() - now.getTime()
      const hoursUntilDue = msUntilDue / (1000 * 60 * 60)
      const daysUntilDue = msUntilDue / (1000 * 60 * 60 * 24)

      const targetUserId =
        matterUserMap[deadline.matter_id] ?? fallbackUserId
      if (!targetUserId) continue

      const deadlineLabel = deadline.title || deadline.description || 'Shielded deadline'

      // ── 24-hour alert ──
      if (
        hoursUntilDue >= 0 &&
        hoursUntilDue <= 24 &&
        !deadline.alert_24h_sent
      ) {
        await createNotification(admin, {
          tenant_id: tenantId,
          user_id: targetUserId,
          title: `URGENT: Deadline due in less than 24 hours`,
          message: `"${deadlineLabel}" is due ${dueDate.toISOString().split('T')[0]}. Immediate action required.`,
          notification_type: 'deadline_alert',
          priority: 'critical',
          entity_type: 'matter_deadline',
          entity_id: deadline.id,
        })

        await from
          .matterDeadlines(admin)
          .update({ alert_24h_sent: true })
          .eq('id', deadline.id)

        stats.alerts_24h++
      }

      // ── 1-week alert ──
      if (
        daysUntilDue >= 0 &&
        daysUntilDue <= 7 &&
        !deadline.alert_1w_sent
      ) {
        await createNotification(admin, {
          tenant_id: tenantId,
          user_id: targetUserId,
          title: `Deadline approaching: 1 week remaining`,
          message: `"${deadlineLabel}" is due ${dueDate.toISOString().split('T')[0]}. Please ensure all required actions are taken.`,
          notification_type: 'deadline_alert',
          priority: 'high',
          entity_type: 'matter_deadline',
          entity_id: deadline.id,
        })

        await from
          .matterDeadlines(admin)
          .update({ alert_1w_sent: true })
          .eq('id', deadline.id)

        stats.alerts_1w++
      }

      // ── 1-month alert ──
      if (
        daysUntilDue >= 0 &&
        daysUntilDue <= 30 &&
        !deadline.alert_1m_sent
      ) {
        await createNotification(admin, {
          tenant_id: tenantId,
          user_id: targetUserId,
          title: `Deadline reminder: 1 month remaining`,
          message: `"${deadlineLabel}" is due ${dueDate.toISOString().split('T')[0]}. Plan ahead to meet this deadline.`,
          notification_type: 'deadline_alert',
          priority: 'medium',
          entity_type: 'matter_deadline',
          entity_id: deadline.id,
        })

        await from
          .matterDeadlines(admin)
          .update({ alert_1m_sent: true })
          .eq('id', deadline.id)

        stats.alerts_1m++
      }

      // ── Escalation: overdue shielded deadlines ──
      if (daysUntilDue < 0 && !deadline.escalation_sent) {
        await createNotification(admin, {
          tenant_id: tenantId,
          user_id: targetUserId,
          title: `ESCALATION: Shielded deadline is overdue`,
          message: `"${deadlineLabel}" was due ${dueDate.toISOString().split('T')[0]} and is now overdue. This is a compliance-shielded deadline requiring immediate attention.`,
          notification_type: 'deadline_alert',
          priority: 'critical',
          entity_type: 'matter_deadline',
          entity_id: deadline.id,
        })

        await from
          .matterDeadlines(admin)
          .update({ escalation_sent: true })
          .eq('id', deadline.id)

        stats.escalations++
      }
    }

    return { success: true, data: stats }
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Unknown error processing alerts',
    }
  }
}

// ── 5. createNotification (helper) ───────────────────────────────────────────
/**
 * Insert a notification record into the notifications table.
 */
async function createNotification(
  admin: SupabaseClient<Database>,
  params: {
    tenant_id: string
    user_id: string
    title: string
    message: string
    notification_type: string
    priority?: string
    entity_type: string
    entity_id: string
  },
): Promise<void> {
  const { error } = await from.notifications(admin).insert({
    tenant_id: params.tenant_id,
    user_id: params.user_id,
    title: params.title,
    message: params.message,
    notification_type: params.notification_type,
    priority: params.priority ?? 'medium',
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    is_read: false,
  })

  if (error) {
    console.error(
      `[DeadlineShield] Failed to create notification for ${params.entity_id}:`,
      error.message,
    )
  }
}
