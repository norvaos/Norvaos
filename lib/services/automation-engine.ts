import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { sendClientEmail } from './email-service'

type AutomationRule = Database['public']['Tables']['automation_rules']['Row']

interface TriggerParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  triggerType: 'stage_change' | 'checklist_item_approved' | 'deadline_approaching' | 'deadline_critical' | 'matter_created'
  triggerContext: Record<string, unknown>
  userId: string
}

/**
 * Process an automation trigger: find matching rules and execute their actions.
 * Called from stage advancement, deadline cron, and checklist updates.
 * All actions are idempotent — safe to call multiple times.
 */
export async function processAutomationTrigger(params: TriggerParams): Promise<void> {
  const { supabase, tenantId, matterId, triggerType, triggerContext, userId } = params

  // 1. Fetch matching active automation rules
  const { data: rules, error: rulesError } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('sort_order')

  if (rulesError || !rules || rules.length === 0) return

  // 2. Filter rules by trigger_config matching
  const matchingRules = rules.filter((rule) =>
    matchesTriggerConfig(rule, triggerContext)
  )

  // 3. Execute each matching rule
  for (const rule of matchingRules) {
    try {
      const actionsExecuted = await executeRuleActions(
        supabase,
        rule,
        tenantId,
        matterId,
        userId
      )

      // 4. Log execution
      await supabase.from('automation_execution_log').insert({
        tenant_id: tenantId,
        automation_rule_id: rule.id,
        matter_id: matterId,
        trigger_event: triggerType,
        trigger_context: triggerContext as unknown as Database['public']['Tables']['automation_execution_log']['Insert']['trigger_context'],
        actions_executed: actionsExecuted as unknown as Database['public']['Tables']['automation_execution_log']['Insert']['actions_executed'],
        executed_by: userId,
      })
    } catch (err) {
      // Log error but don't block the main flow
      console.error(`Automation rule ${rule.id} failed:`, err)
    }
  }
}

/**
 * Check if a rule's trigger_config matches the current trigger context.
 */
function matchesTriggerConfig(
  rule: AutomationRule,
  context: Record<string, unknown>
): boolean {
  const config = (rule.trigger_config ?? {}) as Record<string, unknown>

  // For stage_change: optionally filter by to_stage_id or from_stage_id
  if (rule.trigger_type === 'stage_change') {
    if (config.to_stage_id && config.to_stage_id !== context.to_stage_id) return false
    if (config.from_stage_id && config.from_stage_id !== context.from_stage_id) return false
    if (config.to_stage_name && config.to_stage_name !== context.to_stage_name) return false
  }

  // For deadline_approaching / deadline_critical: filter by days_before
  if (rule.trigger_type === 'deadline_approaching' || rule.trigger_type === 'deadline_critical') {
    if (config.days_before !== undefined && config.days_before !== context.days_before) return false
  }

  // For checklist_item_approved: filter by category
  if (rule.trigger_type === 'checklist_item_approved') {
    if (config.checklist_category && config.checklist_category !== context.category) return false
  }

  // Case type / matter type scoping
  if (rule.case_type_id && rule.case_type_id !== context.case_type_id) return false
  if (rule.matter_type_id && rule.matter_type_id !== context.matter_type_id) return false

  return true
}

/**
 * Execute all actions for a matched automation rule.
 * Returns a list of actions taken for audit logging.
 */
async function executeRuleActions(
  supabase: SupabaseClient<Database>,
  rule: AutomationRule,
  tenantId: string,
  matterId: string,
  userId: string
): Promise<Record<string, unknown>[]> {
  const config = (rule.action_config ?? {}) as Record<string, unknown>
  const actionsExecuted: Record<string, unknown>[] = []

  switch (rule.action_type) {
    case 'create_task': {
      const taskTitle = (config.title as string) || rule.name
      const dueDaysOffset = (config.due_days_offset as number) || 0
      const priority = (config.priority as string) || 'medium'

      // Idempotency check: don't create if same task already exists for this matter+automation
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('matter_id', matterId)
        .eq('title', taskTitle)
        .eq('created_via', 'automation')
        .eq('automation_id', rule.id)
        .limit(1)

      if (existing && existing.length > 0) {
        actionsExecuted.push({ action: 'create_task', skipped: true, reason: 'already_exists' })
        break
      }

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + dueDaysOffset)

      const { error: taskError } = await supabase.from('tasks').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        title: taskTitle,
        description: (config.description as string) || null,
        priority,
        due_date: dueDate.toISOString().split('T')[0],
        assigned_to: (config.assigned_to as string) || null,
        created_by: userId,
        created_via: 'automation',
        automation_id: rule.id,
        status: 'not_started',
      })

      actionsExecuted.push({
        action: 'create_task',
        success: !taskError,
        title: taskTitle,
        error: taskError?.message,
      })
      break
    }

    case 'create_deadline': {
      const title = (config.title as string) || rule.name
      const dueDaysOffset = (config.due_days_offset as number) || 7
      const deadlineType = (config.deadline_type as string) || 'custom'
      const priority = (config.priority as string) || 'medium'

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + dueDaysOffset)

      const { error: dlError } = await supabase.from('matter_deadlines').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        deadline_type: deadlineType,
        title,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'upcoming',
        priority,
        auto_generated: true,
        source_field: `automation:${rule.id}`,
      })

      actionsExecuted.push({
        action: 'create_deadline',
        success: !dlError,
        title,
        error: dlError?.message,
      })
      break
    }

    case 'log_activity': {
      const title = (config.title as string) || `Automation: ${rule.name}`
      const description = (config.description as string) || null

      const { error: actError } = await supabase.from('activities').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        activity_type: 'automation',
        title,
        description,
        entity_type: 'matter',
        entity_id: matterId,
        user_id: userId,
        metadata: { automation_rule_id: rule.id, automation_name: rule.name } as unknown as Database['public']['Tables']['activities']['Insert']['metadata'],
      })

      actionsExecuted.push({
        action: 'log_activity',
        success: !actError,
        title,
        error: actError?.message,
      })
      break
    }

    case 'send_notification': {
      const notifTitle = (config.title as string) || `Automation: ${rule.name}`
      const notifMessage = (config.message as string) || null
      const notifPriority = (config.priority as string) || 'normal'
      const notifyRole = (config.notify_role as string) || 'responsible_lawyer'

      // Fetch matter to find recipient
      const { data: matterData } = await supabase
        .from('matters')
        .select('title, responsible_lawyer_id, originating_lawyer_id')
        .eq('id', matterId)
        .single()

      if (matterData) {
        const recipients: string[] = []

        if (notifyRole === 'responsible_lawyer' || notifyRole === 'all') {
          if (matterData.responsible_lawyer_id) recipients.push(matterData.responsible_lawyer_id)
        }
        if (notifyRole === 'originating_lawyer' || notifyRole === 'all') {
          if (matterData.originating_lawyer_id && !recipients.includes(matterData.originating_lawyer_id)) {
            recipients.push(matterData.originating_lawyer_id)
          }
        }

        const notifInserts = recipients.map((recipientId) => ({
          tenant_id: tenantId,
          user_id: recipientId,
          title: notifTitle.replace('{matter_title}', matterData.title),
          message: notifMessage?.replace('{matter_title}', matterData.title) ?? null,
          notification_type: 'automation',
          entity_type: 'matter' as const,
          entity_id: matterId,
          channels: ['in_app'] as string[],
          priority: notifPriority as 'normal' | 'high' | 'low',
        }))

        if (notifInserts.length > 0) {
          const { error: notifError } = await supabase.from('notifications').insert(notifInserts)
          actionsExecuted.push({
            action: 'send_notification',
            success: !notifError,
            recipients: recipients.length,
            title: notifTitle,
            error: notifError?.message,
          })
        } else {
          actionsExecuted.push({ action: 'send_notification', skipped: true, reason: 'no_recipients' })
        }
      } else {
        actionsExecuted.push({ action: 'send_notification', skipped: true, reason: 'matter_not_found' })
      }
      break
    }

    case 'send_client_email': {
      const emailSubject = (config.subject as string) || 'Update on your case'
      const emailBody = (config.body as string) || null
      const templateType = (config.template as string) || 'general'

      // Find primary contact for the matter
      const { data: primaryClient } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('role', 'client')
        .limit(1)
        .maybeSingle()

      if (primaryClient?.contact_id) {
        try {
          await sendClientEmail({
            supabase,
            tenantId,
            matterId,
            contactId: primaryClient.contact_id,
            notificationType: templateType as 'stage_change' | 'document_request' | 'deadline_alert' | 'general',
            templateData: {
              subject: emailSubject,
              body: emailBody,
              ...config,
            },
          })
          actionsExecuted.push({
            action: 'send_client_email',
            success: true,
            contact_id: primaryClient.contact_id,
          })
        } catch (emailErr) {
          actionsExecuted.push({
            action: 'send_client_email',
            success: false,
            error: emailErr instanceof Error ? emailErr.message : 'Unknown error',
          })
        }
      } else {
        actionsExecuted.push({
          action: 'send_client_email',
          skipped: true,
          reason: 'no_primary_contact',
        })
      }
      break
    }

    default:
      actionsExecuted.push({ action: rule.action_type, skipped: true, reason: 'unsupported_action' })
  }

  return actionsExecuted
}
