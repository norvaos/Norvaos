// ============================================================================
// Document Reminder Engine — Automated follow-up for outstanding documents
// ============================================================================
// Called by /api/cron/document-reminders daily. For each tenant:
//   1. Finds matters with outstanding required document slots
//   2. Checks if a document_request was sent (clock start)
//   3. Determines if a reminder is due based on schedule (day 2, 5, 10 etc.)
//   4. Sends client reminders or escalates to staff
//   5. Logs every action to document_reminders audit table
//
// Reminders only fire AFTER an explicit document request (manual or auto).
// Matters with all required slots accepted are excluded.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { sendClientEmail } from './email-service'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReminderConfig {
  scheduleDays: number[]
  maxReminders: number
  escalationAfterDays: number
  quietHoursStart: number
  quietHoursEnd: number
}

const DEFAULT_CONFIG: ReminderConfig = {
  scheduleDays: [2, 5, 10],
  maxReminders: 5,
  escalationAfterDays: 14,
  quietHoursStart: 21,
  quietHoursEnd: 8,
}

export interface ReminderStats {
  tenantsProcessed: number
  mattersEvaluated: number
  clientRemindersSent: number
  staffEscalations: number
  skippedMaxReminders: number
  skippedNoRequest: number
  skippedQuietHours: number
  errors: number
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Process document reminders across all tenants.
 * Returns stats for observability.
 */
export async function processDocumentReminders(
  supabase: SupabaseClient<Database>
): Promise<ReminderStats> {
  const stats: ReminderStats = {
    tenantsProcessed: 0,
    mattersEvaluated: 0,
    clientRemindersSent: 0,
    staffEscalations: 0,
    skippedMaxReminders: 0,
    skippedNoRequest: 0,
    skippedQuietHours: 0,
    errors: 0,
  }

  try {
    // Fetch all tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')

    if (tenantErr || !tenants) {
      console.error('[document-reminders] Failed to fetch tenants:', tenantErr)
      return stats
    }

    for (const tenant of tenants) {
      try {
        await processTenanReminders(supabase, tenant.id, stats)
        stats.tenantsProcessed++
      } catch (err) {
        console.error(`[document-reminders] Error processing tenant ${tenant.id}:`, err)
        stats.errors++
      }
    }
  } catch (err) {
    console.error('[document-reminders] Fatal error:', err)
    stats.errors++
  }

  return stats
}

// ─── Per-Tenant Processing ──────────────────────────────────────────────────

async function processTenanReminders(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  stats: ReminderStats
): Promise<void> {
  // 1. Load reminder configs for this tenant (may have per-matter-type overrides)
  const { data: configs } = await supabase
    .from('document_reminder_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  const configMap = new Map<string | null, ReminderConfig>()
  for (const c of configs ?? []) {
    configMap.set(c.matter_type_id, {
      scheduleDays: c.schedule_days ?? DEFAULT_CONFIG.scheduleDays,
      maxReminders: c.max_reminders ?? DEFAULT_CONFIG.maxReminders,
      escalationAfterDays: c.escalation_after_days ?? DEFAULT_CONFIG.escalationAfterDays,
      quietHoursStart: c.quiet_hours_start ?? DEFAULT_CONFIG.quietHoursStart,
      quietHoursEnd: c.quiet_hours_end ?? DEFAULT_CONFIG.quietHoursEnd,
    })
  }

  // 2. Find matters with outstanding required document slots
  //    Outstanding = active, required, status NOT 'accepted'
  const { data: outstandingSlots } = await supabase
    .from('document_slots')
    .select('id, matter_id, slot_name, status')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('is_required', true)
    .not('status', 'eq', 'accepted')

  if (!outstandingSlots || outstandingSlots.length === 0) return

  // Group by matter
  const matterSlots = new Map<string, { ids: string[]; names: string[] }>()
  for (const slot of outstandingSlots) {
    const existing = matterSlots.get(slot.matter_id) ?? { ids: [], names: [] }
    existing.ids.push(slot.id)
    existing.names.push(slot.slot_name)
    matterSlots.set(slot.matter_id, existing)
  }

  const now = new Date()

  for (const [matterId, slotInfo] of matterSlots) {
    stats.mattersEvaluated++

    try {
      await processMatterReminder(
        supabase,
        tenantId,
        matterId,
        slotInfo,
        configMap,
        now,
        stats
      )
    } catch (err) {
      console.error(`[document-reminders] Error processing matter ${matterId}:`, err)
      stats.errors++
    }
  }
}

// ─── Per-Matter Processing ──────────────────────────────────────────────────

async function processMatterReminder(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  slotInfo: { ids: string[]; names: string[] },
  configMap: Map<string | null, ReminderConfig>,
  now: Date,
  stats: ReminderStats
): Promise<void> {
  // 1. Find most recent document_request for this matter (clock start)
  const { data: latestRequest } = await supabase
    .from('document_requests')
    .select('id, created_at')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestRequest) {
    stats.skippedNoRequest++
    return // Reminders only fire after explicit request
  }

  // 2. Resolve config (matter_type_id → specific config, fallback to tenant default, fallback to hardcoded)
  const { data: matter } = await supabase
    .from('matters')
    .select('matter_type_id, responsible_lawyer_id')
    .eq('id', matterId)
    .single()

  const config =
    configMap.get(matter?.matter_type_id ?? null) ??
    configMap.get(null) ??
    DEFAULT_CONFIG

  // 3. Count existing reminders for this matter (after the latest request)
  const { count: reminderCount } = await supabase
    .from('document_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', matterId)
    .gte('created_at', latestRequest.created_at)

  const existingReminders = reminderCount ?? 0

  if (existingReminders >= config.maxReminders) {
    stats.skippedMaxReminders++
    return
  }

  // 4. Calculate days since request
  const requestDate = new Date(latestRequest.created_at ?? '')
  const daysSinceRequest = Math.floor(
    (now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // 5. Determine which reminder number this would be
  //    Sort schedule, find the next day threshold that applies
  const sortedSchedule = [...config.scheduleDays].sort((a, b) => a - b)
  const reminderNumber = existingReminders + 1

  // Find the schedule day for this reminder number
  const targetDay = sortedSchedule[existingReminders] ?? null
  if (targetDay === null || daysSinceRequest < targetDay) {
    return // Not yet time for this reminder
  }

  // Check we haven't already sent this specific reminder number after the latest request
  const { data: existingForNumber } = await supabase
    .from('document_reminders')
    .select('id')
    .eq('matter_id', matterId)
    .eq('reminder_number', reminderNumber)
    .gte('created_at', latestRequest.created_at)
    .limit(1)
    .maybeSingle()

  if (existingForNumber) {
    return // Already sent this reminder
  }

  // 6. Quiet hours check (use UTC for simplicity; in production this would use tenant timezone)
  const currentHour = now.getUTCHours()
  if (config.quietHoursStart < config.quietHoursEnd) {
    // e.g., 21-08 doesn't apply here (this branch: 8-21)
    if (currentHour >= config.quietHoursStart && currentHour < config.quietHoursEnd) {
      stats.skippedQuietHours++
      return
    }
  } else {
    // Wraps midnight: e.g., quiet from 21:00 to 08:00
    if (currentHour >= config.quietHoursStart || currentHour < config.quietHoursEnd) {
      stats.skippedQuietHours++
      return
    }
  }

  // 7. Check if this should be a staff escalation instead
  const isEscalation = daysSinceRequest >= config.escalationAfterDays

  if (isEscalation) {
    await sendStaffEscalation(supabase, tenantId, matterId, slotInfo, matter?.responsible_lawyer_id ?? null, reminderNumber, latestRequest.created_at ?? '')
    stats.staffEscalations++
    return
  }

  // 8. Send client reminder
  const { data: primaryContact } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('role', 'client')
    .limit(1)
    .maybeSingle()

  if (!primaryContact?.contact_id) return

  // Check email opt-out
  const { data: contact } = await supabase
    .from('contacts')
    .select('email_notifications_enabled')
    .eq('id', primaryContact.contact_id)
    .single()

  const emailEnabled = contact?.email_notifications_enabled !== false

  // Send email (respect opt-out but still log the reminder)
  const notificationId: string | null = null
  if (emailEnabled) {
    try {
      await sendClientEmail({
        supabase,
        tenantId,
        matterId,
        contactId: primaryContact.contact_id,
        notificationType: 'document_request',
        templateData: {
          document_names: slotInfo.names,
          message: `This is a friendly reminder to upload the following outstanding documents. (Reminder ${reminderNumber} of ${config.maxReminders})`,
        },
      })
    } catch (err) {
      console.error(`[document-reminders] Failed to send email for matter ${matterId}:`, err)
    }
  }

  // 9. Log reminder to audit table
  await supabase.from('document_reminders').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    contact_id: primaryContact.contact_id,
    reminder_number: reminderNumber,
    reminder_type: 'client',
    outstanding_slot_ids: slotInfo.ids,
    outstanding_slot_names: slotInfo.names,
    notification_id: notificationId,
  })

  // Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'document_reminder_sent',
    title: `Document reminder #${reminderNumber} sent`,
    description: `Reminder for ${slotInfo.names.length} outstanding document${slotInfo.names.length === 1 ? '' : 's'}: ${slotInfo.names.join(', ')}`,
    entity_type: 'matter',
    entity_id: matterId,
    metadata: {
      reminder_number: reminderNumber,
      days_since_request: daysSinceRequest,
      outstanding_slot_ids: slotInfo.ids,
      email_sent: emailEnabled,
    } as unknown as Json,
  })

  stats.clientRemindersSent++
}

// ─── Staff Escalation ───────────────────────────────────────────────────────

async function sendStaffEscalation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  slotInfo: { ids: string[]; names: string[] },
  responsibleLawyerId: string | null,
  reminderNumber: number,
  requestCreatedAt: string
): Promise<void> {
  // Find who to notify (responsible lawyer, or fallback to any admin)
  let recipientId = responsibleLawyerId

  if (!recipientId) {
    const { data: admin } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    recipientId = admin?.id ?? null
  }

  if (!recipientId) return

  // Fetch matter title for notification context
  const { data: matterInfo } = await supabase
    .from('matters')
    .select('title, matter_number')
    .eq('id', matterId)
    .single()

  const matterRef = matterInfo?.matter_number || matterInfo?.title || matterId.slice(0, 8)

  // Create in-app notification for staff
  await supabase.from('notifications').insert({
    tenant_id: tenantId,
    user_id: recipientId,
    title: `Document follow-up needed: ${matterRef}`,
    message: `Client has not uploaded ${slotInfo.names.length} required document${slotInfo.names.length === 1 ? '' : 's'} after multiple reminders. Outstanding: ${slotInfo.names.join(', ')}`,
    notification_type: 'document_escalation',
    entity_type: 'matter',
    entity_id: matterId,
    channels: ['in_app'],
    priority: 'high',
  })

  // Find primary contact for audit
  const { data: primaryContact } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('role', 'client')
    .limit(1)
    .maybeSingle()

  // Log to reminders table
  await supabase.from('document_reminders').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    contact_id: primaryContact?.contact_id ?? '00000000-0000-0000-0000-000000000000',
    reminder_number: reminderNumber,
    reminder_type: 'staff_escalation',
    outstanding_slot_ids: slotInfo.ids,
    outstanding_slot_names: slotInfo.names,
  })

  // Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'document_escalation',
    title: `Document escalation: ${slotInfo.names.length} documents still outstanding`,
    description: `Escalated to staff after ${Math.floor((Date.now() - new Date(requestCreatedAt).getTime()) / (1000 * 60 * 60 * 24))} days. Outstanding: ${slotInfo.names.join(', ')}`,
    entity_type: 'matter',
    entity_id: matterId,
    metadata: {
      reminder_number: reminderNumber,
      outstanding_slot_ids: slotInfo.ids,
      escalated_to: recipientId,
    } as unknown as Json,
  })
}
