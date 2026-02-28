import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/booking/[slug]/submit
 *
 * Public endpoint — creates an appointment + contact + lead.
 * Follows the same pattern as /api/forms/[slug]/submit.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const admin = createAdminClient()

    // 1. Look up the booking page
    const { data: page, error: pageError } = await admin
      .from('booking_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single()

    if (pageError || !page) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      )
    }

    // 2. Parse request body
    const body = await request.json()
    const {
      name,
      email,
      phone,
      date,
      time,
      notes,
      answers,
    } = body as {
      name: string
      email: string
      phone?: string
      date: string // 'YYYY-MM-DD'
      time: string // 'HH:mm'
      notes?: string
      answers?: Record<string, unknown>
    }

    // Basic validation
    if (!name || !email || !date || !time) {
      return NextResponse.json(
        { success: false, error: 'Name, email, date, and time are required' },
        { status: 400 }
      )
    }

    // 3. Verify the slot is available (prevent double-booking)
    const endTime = addMinutesToTime(time, page.duration_minutes)
    const { data: conflicting } = await admin
      .from('appointments')
      .select('id')
      .eq('booking_page_id', page.id)
      .eq('appointment_date', date)
      .eq('status', 'confirmed')
      .lt('start_time', endTime)
      .gt('end_time', time)
      .limit(1)

    if (conflicting && conflicting.length > 0) {
      return NextResponse.json(
        { success: false, error: 'This time slot is no longer available. Please choose another time.' },
        { status: 409 }
      )
    }

    // 4. Create or update contact (email dedup — same pattern as intake form)
    let contactId: string | null = null
    const nameParts = name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Check for existing contact by email
    const { data: existingContact } = await admin
      .from('contacts')
      .select('id')
      .eq('tenant_id', page.tenant_id)
      .eq('email_primary', email.toLowerCase())
      .limit(1)
      .single()

    if (existingContact) {
      contactId = existingContact.id
      // Update name/phone if missing
      await admin
        .from('contacts')
        .update({
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          phone_primary: phone || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .eq('tenant_id', page.tenant_id)
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await admin
        .from('contacts')
        .insert({
          tenant_id: page.tenant_id,
          contact_type: 'individual',
          first_name: firstName,
          last_name: lastName,
          email_primary: email.toLowerCase(),
          phone_primary: phone ?? null,
          source: 'Booking Page',
          source_detail: page.title,
          is_active: true,
        })
        .select('id')
        .single()

      if (contactError) {
        console.error('Contact creation error:', contactError)
      } else {
        contactId = newContact.id
      }
    }

    // 5. Create lead if pipeline is configured
    let leadId: string | null = null
    if (page.pipeline_id && contactId) {
      // If no stage_id set, get the first stage of the pipeline
      let stageId = page.stage_id
      if (!stageId) {
        const { data: firstStage } = await admin
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', page.pipeline_id)
          .order('order', { ascending: true })
          .limit(1)
          .single()
        stageId = firstStage?.id ?? null
      }

      if (stageId) {
        const { data: newLead, error: leadError } = await admin
          .from('leads')
          .insert({
            tenant_id: page.tenant_id,
            contact_id: contactId,
            pipeline_id: page.pipeline_id,
            stage_id: stageId,
            stage_entered_at: new Date().toISOString(),
            assigned_to: page.user_id,
            source: 'Booking Page',
            source_detail: page.title,
            status: 'open',
            temperature: 'warm',
          })
          .select('id')
          .single()

        if (leadError) {
          console.error('Lead creation error:', leadError)
        } else {
          leadId = newLead.id
        }
      }
    }

    // 6. Create appointment
    const { data: appointment, error: appointmentError } = await admin
      .from('appointments')
      .insert({
        tenant_id: page.tenant_id,
        booking_page_id: page.id,
        user_id: page.user_id,
        contact_id: contactId,
        lead_id: leadId,
        appointment_date: date,
        start_time: time,
        end_time: endTime,
        duration_minutes: page.duration_minutes,
        guest_name: name,
        guest_email: email.toLowerCase(),
        guest_phone: phone ?? null,
        guest_notes: notes ?? null,
        answers: answers ?? {},
        status: 'confirmed',
      })
      .select('id')
      .single()

    if (appointmentError) {
      console.error('Appointment creation error:', appointmentError)
      return NextResponse.json(
        { success: false, error: 'Failed to create appointment' },
        { status: 500 }
      )
    }

    // 7. Log activity
    if (contactId) {
      await admin.from('activities').insert({
        tenant_id: page.tenant_id,
        user_id: page.user_id,
        activity_type: 'booking_created',
        title: `Booking: ${name} — ${page.title}`,
        entity_type: 'contact',
        entity_id: contactId,
        metadata: {
          appointment_id: appointment.id,
          booking_page: page.title,
          date,
          time,
          guest_name: name,
        },
      }).then(() => {}) // fire and forget
    }

    return NextResponse.json(
      {
        success: true,
        appointment_id: appointment.id,
        contact_id: contactId,
        lead_id: leadId,
        confirmation_message: page.confirmation_message,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Booking submission error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const parts = time.split(':')
  const totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + minutes
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}
