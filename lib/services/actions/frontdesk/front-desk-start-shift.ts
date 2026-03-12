import type { ActionDefinition } from '../types'
import { frontDeskStartShiftSchema, type FrontDeskStartShiftInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskStartShiftResult {
  shiftId: string
  startedAt: string
}

type ShiftRow = { id: string; started_at: string }

export const frontDeskStartShiftAction: ActionDefinition<FrontDeskStartShiftInput, FrontDeskStartShiftResult> = {
  type: 'front_desk_start_shift',
  label: 'Start Shift',
  inputSchema: frontDeskStartShiftSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'shift',

  // Placeholder — real shift ID extracted from result.data.shiftId by action executor
  getEntityId: () => 'shift',

  async execute({ tenantId, userId, supabase }) {
    if (!userId) {
      throw new Error('User ID required to start a shift')
    }

    // Check no active shift exists for this user
    const { data: rawExisting } = await (supabase
      .from('front_desk_shifts' as any)
      .select('id, started_at') as any)
      .eq('user_id', userId)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle()

    const existingShift = rawExisting as ShiftRow | null

    if (existingShift) {
      throw new Error(`Active shift already exists (started at ${existingShift.started_at}). End the current shift first.`)
    }

    // Create the new shift
    const now = new Date().toISOString()
    const today = now.split('T')[0]

    const { data: rawNew, error: insertErr } = await (supabase
      .from('front_desk_shifts' as any)
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        started_at: now,
        shift_date: today,
      }) as any)
      .select('id, started_at')
      .single()

    const newShift = rawNew as ShiftRow | null

    if (insertErr || !newShift) {
      throw new Error(`Failed to create shift: ${insertErr?.message ?? 'Unknown error'}`)
    }

    // Log shift_start event
    await (supabase
      .from('front_desk_events' as any)
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        shift_id: newShift.id,
        event_type: 'shift_start',
        event_data: { started_at: now },
      }) as any)

    return {
      data: {
        shiftId: newShift.id,
        startedAt: newShift.started_at,
      },
      newState: {
        shift_started: true,
        shift_id: newShift.id,
        started_at: now,
      },
      activity: {
        activityType: 'front_desk_shift_started',
        title: 'Shift started',
        description: `Started front desk shift at ${new Date(now).toLocaleTimeString()}`,
        metadata: {
          shift_id: newShift.id,
          started_at: now,
        },
      },
    }
  },
}
