import type { ActionDefinition } from '../types'
import { assertOk } from '../db-assert'
import { frontDeskBookAppointmentSchema, type FrontDeskBookAppointmentInput } from '@/lib/schemas/workflow-actions'
import { withAppointmentPIIEncrypted } from '@/lib/services/pii-dual-write'

interface FrontDeskBookAppointmentResult {
  appointmentId: string
  date: string
  startTime: string
}

export const frontDeskBookAppointmentAction: ActionDefinition<FrontDeskBookAppointmentInput, FrontDeskBookAppointmentResult> = {
  type: 'front_desk_book_appointment',
  label: 'Book Appointment (Front Desk)',
  inputSchema: frontDeskBookAppointmentSchema,
  permission: { entity: 'front_desk', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'appointment',
  getEntityId: () => 'new', // Appointment doesn't exist yet

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Calculate end_time from startTime + durationMinutes
    const startDate = new Date(`${input.appointmentDate}T${input.startTime}:00`)
    const endDate = new Date(startDate.getTime() + input.durationMinutes * 60 * 1000)
    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

    // 2. Resolve a booking page for this tenant (use provided appointmentTypeId or first active)
    let bookingPageId = input.appointmentTypeId ?? null
    if (!bookingPageId) {
      const { data: pages } = await supabase
        .from('booking_pages')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      bookingPageId = pages?.id ?? null
    }

    // Auto-create a default "Front Desk" booking page if none exists
    if (!bookingPageId) {
      const { data: newPage } = await supabase
        .from('booking_pages')
        .insert({
          tenant_id: tenantId,
          user_id: input.staffUserId,
          slug: `front-desk-${tenantId.slice(0, 8)}`,
          title: 'Front Desk Appointments',
          description: 'Auto-created booking page for front desk appointments',
          duration_minutes: 60,
          is_active: true,
        })
        .select('id')
        .maybeSingle()

      bookingPageId = newPage?.id ?? null
    }

    if (!bookingPageId) {
      throw new Error('Failed to create booking page. Please contact admin.')
    }

    // Now bookingPageId is guaranteed to be a string
    const resolvedPageId: string = bookingPageId

    // 3. Look up contact name for guest_name
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, email_primary, phone_primary')
      .eq('id', input.contactId)
      .single()

    const guestName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Walk-in'
      : 'Walk-in'

    // 4. Insert into appointments table
    // Build insert payload — only include matter_id if provided (column may not exist pre-migration 048)
    const insertPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      booking_page_id: resolvedPageId,
      user_id: input.staffUserId,
      contact_id: input.contactId,
      guest_name: guestName,
      guest_email: contact?.email_primary ?? '',
      guest_phone: contact?.phone_primary ?? '',
      ...withAppointmentPIIEncrypted({
        guest_name: guestName,
        guest_email: contact?.email_primary ?? '',
        guest_phone: contact?.phone_primary ?? '',
      }),
      appointment_date: input.appointmentDate,
      start_time: input.startTime,
      end_time: endTime,
      duration_minutes: input.durationMinutes,
      status: 'confirmed',
    }
    if (input.matterId) {
      insertPayload.matter_id = input.matterId
    }
    if (input.room) {
      insertPayload.room = input.room
    }

    let appointment: { id: string } | null = null
    const { data: apptData, error: apptErr } = await supabase
      .from('appointments')
      .insert(insertPayload as any)
      .select('id')
      .single()

    if (apptErr && (apptErr.message?.includes('matter_id') || apptErr.message?.includes('room') || apptErr.message?.includes('schema cache'))) {
      // Fallback: retry without new columns (not yet added via migration 048)
      delete insertPayload.matter_id
      delete insertPayload.room
      appointment = assertOk(
        await supabase
          .from('appointments')
          .insert(insertPayload as any)
          .select('id')
          .single(),
        'front_desk_book_appointment:insert_appointment'
      )
    } else if (apptErr) {
      throw new Error(`[front_desk_book_appointment:insert_appointment] Database error: ${apptErr.message}`)
    } else {
      appointment = apptData
    }

    // 5. Look up staff name for activity title
    const { data: staff } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', input.staffUserId)
      .single()

    const staffName = staff
      ? [staff.first_name, staff.last_name].filter(Boolean).join(' ')
      : 'staff member'

    return {
      data: {
        appointmentId: appointment!.id,
        date: input.appointmentDate,
        startTime: input.startTime,
      },
      newState: {
        appointment_id: appointment!.id,
        status: 'confirmed',
        appointment_date: input.appointmentDate,
        start_time: input.startTime,
        end_time: endTime,
        user_id: input.staffUserId,
      },
      activity: {
        activityType: 'appointment_booked_front_desk',
        title: `Appointment booked for ${input.appointmentDate} with ${staffName}${input.room ? ` in ${input.room}` : ''}`,
        description: input.notes,
        metadata: {
          appointment_id: appointment!.id,
          contact_id: input.contactId,
          user_id: input.staffUserId,
          appointment_date: input.appointmentDate,
          start_time: input.startTime,
          end_time: endTime,
          duration_minutes: input.durationMinutes,
        },
        contactId: input.contactId,
      },
    }
  },

  notificationEvent: 'appointment_booked',
  buildNotification: (ctx, result) => {
    const input = ctx.input as FrontDeskBookAppointmentInput
    return {
      recipientUserIds: [input.staffUserId],
      title: 'New appointment booked',
      message: `An appointment has been booked for ${result.date} at ${result.startTime}.`,
      priority: 'normal',
    }
  },
}
