import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type AutomationRule = Database['public']['Tables']['automation_rules']['Row']

interface AppointmentTriggerParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  appointmentId: string
  contactId: string | null
  leadId: string | null
  triggerType: 'appointment_checked_in' | 'appointment_completed' | 'appointment_no_show'
  userId: string
}

/**
 * Process appointment-specific automation triggers.
 * Unlike the matter-focused processAutomationTrigger, this works without a matterId.
 */
export async function processAppointmentAutomationTrigger(params: AppointmentTriggerParams): Promise<void> {
  const { supabase, tenantId, appointmentId, contactId, leadId, triggerType, userId } = params

  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('sort_order')

  if (!rules?.length) return

  for (const rule of rules) {
    try {
      const actionsExecuted = await executeAppointmentActions(
        supabase,
        rule,
        tenantId,
        appointmentId,
        contactId,
        leadId,
        userId
      )

      await supabase.from('automation_execution_log').insert({
        tenant_id: tenantId,
        automation_rule_id: rule.id,
        trigger_event: triggerType,
        trigger_context: {
          appointment_id: appointmentId,
          contact_id: contactId,
          lead_id: leadId,
        } as unknown as Database['public']['Tables']['automation_execution_log']['Insert']['trigger_context'],
        actions_executed: actionsExecuted as unknown as Database['public']['Tables']['automation_execution_log']['Insert']['actions_executed'],
        executed_by: userId,
      })
    } catch (err) {
      console.error(`Appointment automation rule ${rule.id} failed:`, err)
    }
  }
}

async function executeAppointmentActions(
  supabase: SupabaseClient<Database>,
  rule: AutomationRule,
  tenantId: string,
  appointmentId: string,
  contactId: string | null,
  leadId: string | null,
  userId: string
): Promise<Record<string, unknown>[]> {
  const config = (rule.action_config ?? {}) as Record<string, unknown>
  const actionsExecuted: Record<string, unknown>[] = []

  switch (rule.action_type) {
    case 'create_task': {
      const taskTitle = (config.title as string) || rule.name
      const dueDaysOffset = (config.due_days_offset as number) || 0
      const priority = (config.priority as string) || 'medium'

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + dueDaysOffset)

      const { error: taskError } = await supabase.from('tasks').insert({
        tenant_id: tenantId,
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

    case 'send_notification': {
      const { data: appointment } = await supabase
        .from('appointments')
        .select('user_id, guest_name')
        .eq('id', appointmentId)
        .single()

      if (appointment?.user_id) {
        const notifTitle = (config.title as string) || rule.name
        const notifMessage = (config.message as string)?.replace('{guest_name}', appointment.guest_name ?? 'Client') ?? null

        const { error: notifError } = await supabase.from('notifications').insert({
          tenant_id: tenantId,
          user_id: appointment.user_id,
          title: notifTitle,
          message: notifMessage,
          notification_type: 'automation',
          entity_type: 'appointment' as const,
          entity_id: appointmentId,
          channels: ['in_app'],
          priority: ((config.priority as string) || 'normal') as 'normal' | 'high' | 'low',
        })

        actionsExecuted.push({
          action: 'send_notification',
          success: !notifError,
          title: notifTitle,
          error: notifError?.message,
        })
      } else {
        actionsExecuted.push({ action: 'send_notification', skipped: true, reason: 'no_recipient' })
      }
      break
    }

    case 'log_activity': {
      const title = (config.title as string) || `Automation: ${rule.name}`

      const { error: actError } = await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'automation',
        title,
        description: (config.description as string) || null,
        entity_type: 'appointment' as const,
        entity_id: appointmentId,
        contact_id: contactId,
        user_id: userId,
        metadata: {
          automation_rule_id: rule.id,
          automation_name: rule.name,
        } as unknown as Database['public']['Tables']['activities']['Insert']['metadata'],
      })

      actionsExecuted.push({
        action: 'log_activity',
        success: !actError,
        title,
        error: actError?.message,
      })
      break
    }

    default:
      actionsExecuted.push({ action: rule.action_type, skipped: true, reason: 'unsupported_action' })
  }

  return actionsExecuted
}
