import type { Json } from '@/lib/types/database'
import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { recordMeetingOutcomeSchema, type RecordMeetingOutcomeInput } from '@/lib/schemas/workflow-actions'

interface RecordMeetingOutcomeResult {
  meetingOutcomeId: string
  matterId: string
  outcomeType: string
  stageAdvanced: boolean
  taskCreated: boolean
}

export const recordMeetingOutcomeAction: ActionDefinition<RecordMeetingOutcomeInput, RecordMeetingOutcomeResult> = {
  type: 'record_meeting_outcome',
  label: 'Record Meeting Outcome',
  inputSchema: recordMeetingOutcomeSchema,
  permission: { entity: 'matters', action: 'edit' },
  allowedSources: ['command_centre', 'dashboard'],
  entityType: 'matter',
  getEntityId: (input) => input.matterId,
  getMatterId: (input) => input.matterId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('matters')
      .select('status, date_closed')
      .eq('id', input.matterId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select('id, title, status, responsible_lawyer_id')
      .eq('id', input.matterId)
      .eq('tenant_id', tenantId)
      .single()

    if (matterErr || !matter) {
      throw new Error('Matter not found')
    }

    // 2. Insert meeting_outcomes record
    const { data: outcome, error: outcomeErr } = await supabase
      .from('meeting_outcomes')
      .insert({
        tenant_id: tenantId,
        matter_id: input.matterId,
        lead_id: input.leadId ?? null,
        contact_id: input.contactId ?? null,
        outcome_type: input.outcomeType,
        outcome_data: input.outcomeData as unknown as Json,
        recorded_by: userId,
        notes: input.notes ?? null,
      })
      .select('id')
      .single()

    if (outcomeErr || !outcome) {
      throw new Error(`Failed to record outcome: ${outcomeErr?.message}`)
    }

    // 3. Handle outcome-specific side effects (Rule #15: outcomes drive everything)
    const stageAdvanced = false
    let taskCreated = false

    switch (input.outcomeType) {
      case 'declined': {
        // Close matter as lost
        assertNoError(
          await supabase
            .from('matters')
            .update({
              status: 'closed_lost',
              date_closed: new Date().toISOString().split('T')[0],
            })
            .eq('id', input.matterId)
            .eq('tenant_id', tenantId),
          'record_meeting_outcome:close_matter'
        )
        break
      }

      case 'follow_up_required': {
        // Create follow-up task
        const followUpDate = (input.outcomeData as Record<string, unknown>).followUpDate as string | undefined
        const reason = (input.outcomeData as Record<string, unknown>).reason as string | undefined
        const assignedTo = (input.outcomeData as Record<string, unknown>).assignedTo as string | undefined

        const dueDate = followUpDate
          ? new Date(followUpDate)
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days default

        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: input.matterId,
            title: `Follow-up: ${matter.title}`,
            description: reason ?? input.notes ?? 'Follow-up required after meeting',
            priority: 'high',
            due_date: dueDate.toISOString().split('T')[0],
            assigned_to: assignedTo ?? matter.responsible_lawyer_id ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'record_meeting_outcome:create_task'
        )
        taskCreated = true
        break
      }

      case 'no_show': {
        // Create follow-up task for no-show
        const noShowDate = new Date()
        noShowDate.setDate(noShowDate.getDate() + 1)

        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: input.matterId,
            title: `No-show follow-up: ${matter.title}`,
            description: 'Client did not attend scheduled meeting. Please follow up.',
            priority: 'high',
            due_date: noShowDate.toISOString().split('T')[0],
            assigned_to: matter.responsible_lawyer_id ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'record_meeting_outcome:create_task'
        )
        taskCreated = true
        break
      }

      case 'consultation_complete': {
        // Create follow-up task
        const consultDate = new Date()
        consultDate.setDate(consultDate.getDate() + 2)

        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: input.matterId,
            title: `Post-consultation: ${matter.title}`,
            description: input.notes ?? 'Consultation complete — review and determine next steps',
            priority: 'medium',
            due_date: consultDate.toISOString().split('T')[0],
            assigned_to: matter.responsible_lawyer_id ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'record_meeting_outcome:create_task'
        )
        taskCreated = true
        break
      }

      // retainer_sent, retainer_signed, additional_docs_needed, referred_out
      // These trigger stage changes via automation rules (not hardcoded here)
      // The automation engine handles the mapping of outcome → stage change
      default:
        break
    }

    // 4. Fetch updated matter for new_state
    const { data: updatedMatter } = await supabase
      .from('matters')
      .select('status, date_closed')
      .eq('id', input.matterId)
      .single()

    return {
      data: {
        meetingOutcomeId: outcome.id,
        matterId: input.matterId,
        outcomeType: input.outcomeType,
        stageAdvanced,
        taskCreated,
      },
      newState: {
        ...(updatedMatter as Record<string, unknown>),
        meeting_outcome_id: outcome.id,
        outcome_type: input.outcomeType,
      },
      activity: {
        activityType: 'meeting_outcome',
        title: `Meeting outcome: ${input.outcomeType.replace(/_/g, ' ')}`,
        description: input.notes ?? `Recorded outcome: ${input.outcomeType.replace(/_/g, ' ')}`,
        metadata: {
          outcome_type: input.outcomeType,
          outcome_data: input.outcomeData,
          meeting_outcome_id: outcome.id,
          task_created: taskCreated,
          stage_advanced: stageAdvanced,
        },
        matterId: input.matterId,
        contactId: input.contactId,
      },
    }
  },

  automationTrigger: 'stage_change',
  buildTriggerContext: (input, result) => ({
    outcome_type: input.outcomeType,
    meeting_outcome_id: result.meetingOutcomeId,
  }),
}
