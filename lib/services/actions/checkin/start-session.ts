import type { ActionDefinition } from '../types'
import { startCheckInSchema, type StartCheckInInput } from '@/lib/schemas/workflow-actions'

interface StartCheckInResult {
  sessionId: string
  appointmentsFound: number
  appointments: Array<{
    id: string
    startTime: string
    bookerName: string | null
    status: string
  }>
}

/**
 * Start a kiosk check-in session and search for appointments.
 * Rule #7: Kiosk token validated before this action is called.
 * Rule #8: No confidential details revealed until identity is verified.
 */
export const startCheckInAction: ActionDefinition<StartCheckInInput, StartCheckInResult> = {
  type: 'start_check_in',
  label: 'Start Kiosk Check-In',
  inputSchema: startCheckInSchema,
  permission: null, // Kiosk uses token auth, not role-based
  allowedSources: ['kiosk'],
  entityType: 'check_in',
  getEntityId: () => '00000000-0000-0000-0000-000000000000', // Placeholder until session is created

  async execute({ input, tenantId, supabase }) {
    // 1. Create check_in_sessions record
    const { data: session, error: sessionErr } = await supabase
      .from('check_in_sessions')
      .insert({
        tenant_id: tenantId,
        kiosk_token: input.kioskToken,
        status: 'started',
        current_step: input.searchQuery ? 'appointment_lookup' : 'appointment_lookup',
      })
      .select('id')
      .single()

    if (sessionErr || !session) {
      throw new Error('Failed to create check-in session')
    }

    // 2. Search for appointments (Rule #8: limited info before verification)
    let appointments: StartCheckInResult['appointments'] = []

    if (input.searchQuery && input.searchType) {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

      let query = supabase
        .from('booking_appointments')
        .select('id, start_time, booker_name, status')
        .eq('tenant_id', tenantId)
        .gte('start_time', startOfDay)
        .lt('start_time', endOfDay)
        .in('status', ['confirmed'])

      switch (input.searchType) {
        case 'name':
          query = query.ilike('booker_name', `%${input.searchQuery}%`)
          break
        case 'email':
          query = query.ilike('booker_email', `%${input.searchQuery}%`)
          break
        case 'phone':
          query = query.ilike('booker_phone', `%${input.searchQuery}%`)
          break
      }

      const { data: appts } = await query.order('start_time').limit(10)

      appointments = (appts ?? []).map((a) => ({
        id: a.id,
        startTime: a.start_time,
        // Rule #8: Only show name (no matter details, no lawyer name) before verification
        bookerName: a.booker_name,
        status: a.status,
      }))
    }

    return {
      data: {
        sessionId: session.id,
        appointmentsFound: appointments.length,
        appointments,
      },
      newState: {
        session_id: session.id,
        status: 'started',
        appointments_found: appointments.length,
      },
      activity: {
        activityType: 'kiosk_check_in_started',
        title: 'Kiosk check-in started',
        description: input.searchQuery
          ? `Client searching by ${input.searchType}: "${input.searchQuery}"`
          : 'Client initiated check-in at kiosk',
        metadata: {
          session_id: session.id,
          search_type: input.searchType,
          appointments_found: appointments.length,
        },
      },
    }
  },
}
