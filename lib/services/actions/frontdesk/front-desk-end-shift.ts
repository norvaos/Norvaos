import type { ActionDefinition } from '../types'
import { frontDeskEndShiftSchema, type FrontDeskEndShiftInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskEndShiftResult {
  shiftId: string
  startedAt: string
  endedAt: string
  durationMinutes: number
}

type ShiftRow = { id: string; started_at: string }

export const frontDeskEndShiftAction: ActionDefinition<FrontDeskEndShiftInput, FrontDeskEndShiftResult> = {
  type: 'front_desk_end_shift',
  label: 'End Shift',
  inputSchema: frontDeskEndShiftSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'shift',

  getEntityId: () => 'shift',

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) {
      throw new Error('User ID required to end a shift')
    }

    // Find the active shift
    const { data: rawShift, error: findErr } = await (supabase
      .from('front_desk_shifts' as any)
      .select('id, started_at') as any)
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findErr) {
      throw new Error(`Failed to find active shift: ${findErr.message}`)
    }

    const activeShift = rawShift as ShiftRow | null

    if (!activeShift) {
      throw new Error('No active shift found to end.')
    }

    const now = new Date().toISOString()
    const durationMs = new Date(now).getTime() - new Date(activeShift.started_at).getTime()
    const durationMinutes = Math.round(durationMs / 60000)

    // End the shift
    const { error: updateErr } = await (supabase
      .from('front_desk_shifts' as any)
      .update({
        ended_at: now,
        ended_reason: input.reason ?? 'manual',
      }) as any)
      .eq('id', activeShift.id)

    if (updateErr) {
      throw new Error(`Failed to end shift: ${updateErr.message}`)
    }

    // Log shift_end event
    await (supabase
      .from('front_desk_events' as any)
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        shift_id: activeShift.id,
        event_type: 'shift_end',
        event_data: {
          ended_at: now,
          reason: input.reason ?? 'manual',
          duration_minutes: durationMinutes,
        },
      }) as any)

    return {
      data: {
        shiftId: activeShift.id,
        startedAt: activeShift.started_at,
        endedAt: now,
        durationMinutes,
      },
      newState: {
        shift_ended: true,
        shift_id: activeShift.id,
        ended_at: now,
        reason: input.reason ?? 'manual',
        duration_minutes: durationMinutes,
      },
      activity: {
        activityType: 'front_desk_shift_ended',
        title: `Shift ended (${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m)`,
        description: `Ended front desk shift. Duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m. Reason: ${input.reason ?? 'manual'}`,
        metadata: {
          shift_id: activeShift.id,
          ended_at: now,
          reason: input.reason ?? 'manual',
          duration_minutes: durationMinutes,
        },
      },
    }
  },
}
