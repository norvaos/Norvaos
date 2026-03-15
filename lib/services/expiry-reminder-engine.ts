import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExpiryReminderStats {
  tenantId: string
  notificationsCreated: number
  tasksCreated: number
  emailsQueued: number
  recordsChecked: number
}

interface UpcomingExpiry {
  id: string
  contact_id: string
  status_type: string
  issue_date: string
  expiry_date: string
  document_reference: string
  matter_id: string | null
  days_until_expiry: number
}

// ─── Check Expiry Reminders ─────────────────────────────────────────────────

/**
 * Check contact_status_records for upcoming expiries and create
 * notifications/tasks/emails per expiry_reminder_rules config.
 *
 * Called by the daily cron job. Processes one tenant at a time.
 * Idempotent: uses idempotency checks to avoid duplicate reminders.
 */
export async function checkExpiryReminders(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<ExpiryReminderStats> {
  const stats: ExpiryReminderStats = {
    tenantId,
    notificationsCreated: 0,
    tasksCreated: 0,
    emailsQueued: 0,
    recordsChecked: 0,
  }

  // 1. Ensure reminder rules are seeded
  await supabase.rpc('seed_expiry_reminder_rules', { p_tenant_id: tenantId })

  // 2. Fetch active reminder rules
  const { data: rules } = await supabase
    .from('expiry_reminder_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('reminder_offset_days', { ascending: true })

  if (!rules || rules.length === 0) return stats

  // 3. Fetch all active status records with future expiry dates
  const today = new Date()
  const maxOffsetDays = Math.abs(Math.min(...rules.map((r) => r.reminder_offset_days)))
  const checkDate = new Date()
  checkDate.setDate(checkDate.getDate() + maxOffsetDays)

  const { data: statusRecords } = await supabase
    .from('contact_status_records')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('expiry_date', today.toISOString().split('T')[0])
    .lte('expiry_date', checkDate.toISOString().split('T')[0])

  if (!statusRecords || statusRecords.length === 0) return stats

  stats.recordsChecked = statusRecords.length

  // 4. For each status record, check each rule
  for (const record of statusRecords) {
    const expiryDate = new Date(record.expiry_date)
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000)

    for (const rule of rules) {
      const reminderDay = Math.abs(rule.reminder_offset_days)

      // Check if today is the day to fire this reminder
      if (daysUntilExpiry !== reminderDay) continue

      // Idempotency key
      const idempotencyKey = `expiry_reminder:${record.id}:${rule.id}:${today.toISOString().split('T')[0]}`

      switch (rule.reminder_type) {
        case 'notification': {
          // Find the responsible lawyer for the contact
          const recipientId = await findResponsibleUser(supabase, tenantId, record.contact_id, record.matter_id)
          if (!recipientId) break

          // Check for existing notification (idempotency)
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('entity_id', record.id)
            .eq('notification_type', 'expiry_reminder')
            .eq('title', `Expiry in ${reminderDay} days`)
            .limit(1)

          if (existingNotif && existingNotif.length > 0) break

          await supabase.from('notifications').insert({
            tenant_id: tenantId,
            user_id: recipientId,
            title: `Expiry in ${reminderDay} days`,
            message: `${formatStatusType(record.status_type)} for contact expires on ${record.expiry_date}. Document: ${record.document_reference || 'N/A'}`,
            notification_type: 'expiry_reminder',
            entity_type: 'contact',
            entity_id: record.id,
            channels: ['in_app'],
            priority: reminderDay <= 14 ? 'high' : 'normal',
          })
          stats.notificationsCreated++
          break
        }

        case 'task': {
          // Create a follow-up task
          const taskTitle = `Expiry reminder: ${formatStatusType(record.status_type)} expires in ${reminderDay} days`

          // Idempotency check
          const { data: existingTask } = await supabase
            .from('tasks')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('title', taskTitle)
            .eq('created_via', 'automation')
            .limit(1)

          if (existingTask && existingTask.length > 0) break

          const responsibleUser = await findResponsibleUser(supabase, tenantId, record.contact_id, record.matter_id)

          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: record.matter_id,
            title: taskTitle,
            description: `${formatStatusType(record.status_type)} expires on ${record.expiry_date}. Contact the client to discuss renewal options.`,
            priority: reminderDay <= 14 ? 'high' : 'medium',
            due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
            assigned_to: responsibleUser,
            created_by: responsibleUser ?? tenantId, // fallback
            created_via: 'automation',
            status: 'not_started',
          })
          stats.tasksCreated++
          break
        }

        case 'email': {
          // Log email intent — actual sending handled by the email service
          if (record.matter_id) {
            await supabase.from('activities').insert({
              tenant_id: tenantId,
              matter_id: record.matter_id,
              activity_type: 'expiry_email_queued',
              title: `Expiry email queued: ${reminderDay} days`,
              description: `Email reminder queued for ${formatStatusType(record.status_type)} expiring on ${record.expiry_date}`,
              entity_type: 'contact',
              entity_id: record.contact_id,
              user_id: tenantId, // system action
              metadata: {
                status_record_id: record.id,
                days_until_expiry: reminderDay,
                idempotency_key: idempotencyKey,
              } as Json,
            })
          }
          stats.emailsQueued++
          break
        }
      }
    }
  }

  return stats
}

// ─── Get Upcoming Expiries ──────────────────────────────────────────────────

/**
 * Returns contact_status_records expiring within N days.
 * Used for the expiry tracker dashboard widget.
 */
export async function getUpcomingExpiries(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  days: number = 90
): Promise<UpcomingExpiry[]> {
  const today = new Date()
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + days)

  const { data: records } = await supabase
    .from('contact_status_records')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('expiry_date', today.toISOString().split('T')[0])
    .lte('expiry_date', futureDate.toISOString().split('T')[0])
    .order('expiry_date', { ascending: true })

  if (!records) return []

  return records.map((r) => ({
    id: r.id,
    contact_id: r.contact_id,
    status_type: r.status_type,
    issue_date: r.issue_date,
    expiry_date: r.expiry_date,
    document_reference: r.document_reference,
    matter_id: r.matter_id,
    days_until_expiry: Math.ceil(
      (new Date(r.expiry_date).getTime() - today.getTime()) / 86400000
    ),
  }))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findResponsibleUser(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  contactId: string,
  matterId: string | null
): Promise<string | null> {
  // Try to find responsible lawyer from the matter
  if (matterId) {
    const { data: matter } = await supabase
      .from('matters')
      .select('responsible_lawyer_id')
      .eq('id', matterId)
      .single()

    if (matter?.responsible_lawyer_id) return matter.responsible_lawyer_id
  }

  // Fall back to contact's responsible lawyer
  const { data: contact } = await supabase
    .from('contacts')
    .select('responsible_lawyer_id')
    .eq('id', contactId)
    .maybeSingle()

  if (contact?.responsible_lawyer_id) return contact.responsible_lawyer_id

  // Fall back to first active user in tenant
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return user?.id ?? null
}

function formatStatusType(statusType: string): string {
  const labels: Record<string, string> = {
    work_permit: 'Work Permit',
    study_permit: 'Study Permit',
    pr: 'Permanent Residence',
    citizenship: 'Citizenship',
    visa: 'Visa',
  }
  return labels[statusType] ?? statusType
}
