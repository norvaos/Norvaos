import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { renderBookingConfirmationEmail } from '@/lib/email-templates/booking-confirmation'
import { renderBookingCancellationEmail } from '@/lib/email-templates/booking-cancellation'
import { renderBookingNoShowEmail } from '@/lib/email-templates/booking-no-show'

// ── Helpers ────────────────────────────────────────────────────────────────

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[booking-email] RESEND_API_KEY not configured  -  emails will be skipped')
    return null
  }
  return new Resend(apiKey)
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'

async function fetchTenantBranding(supabase: SupabaseClient<Database>, tenantId: string) {
  const { data } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('id', tenantId)
    .single()
  if (!data) return { name: 'Your Law Firm', logo_url: null, primary_color: '#3b82f6' }
  return { ...data, primary_color: data.primary_color ?? '#3b82f6' }
}

interface AppointmentDetails {
  id: string
  guest_name: string
  guest_email: string
  appointment_date: string
  start_time: string
  duration_minutes: number
  user_id: string
  contact_id: string | null
  booking_page_id: string
}

async function fetchAppointmentDetails(
  supabase: SupabaseClient<Database>,
  appointmentId: string,
  tenantId: string
): Promise<AppointmentDetails | null> {
  const { data } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId)
    .single()
  return data as AppointmentDetails | null
}

async function fetchLawyerName(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('id', userId)
    .single()
  if (!data) return 'Your Lawyer'
  return [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Your Lawyer'
}

function formatAppointmentDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatAppointmentTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function getContactFirstName(guestName: string): string | null {
  const parts = guestName.trim().split(' ')
  return parts[0] || null
}

// ── Email Senders ──────────────────────────────────────────────────────────

export async function sendBookingConfirmationEmail(params: {
  supabase: SupabaseClient<Database>
  tenantId: string
  appointmentId: string
}): Promise<void> {
  try {
    const { supabase, tenantId, appointmentId } = params
    const [appointment, tenant] = await Promise.all([
      fetchAppointmentDetails(supabase, appointmentId, tenantId),
      fetchTenantBranding(supabase, tenantId),
    ])

    if (!appointment?.guest_email) {
      console.warn('[booking-email] No guest email for appointment', appointmentId)
      return
    }

    const resend = getResend()
    if (!resend) return

    const lawyerName = await fetchLawyerName(supabase, appointment.user_id)

    const { html, text, subject } = await renderBookingConfirmationEmail({
      firmName: tenant.name,
      firmLogoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      clientFirstName: getContactFirstName(appointment.guest_name),
      lawyerName,
      appointmentDate: formatAppointmentDate(appointment.appointment_date),
      appointmentTime: formatAppointmentTime(appointment.start_time),
      durationMinutes: appointment.duration_minutes,
    })

    await resend.emails.send({
      from: `${tenant.name} <notifications@${FROM_DOMAIN}>`,
      to: [appointment.guest_email],
      subject,
      html,
      text,
    })
  } catch (err) {
    console.error('[booking-email] Failed to send confirmation:', err)
  }
}

export async function sendBookingCancellationEmail(params: {
  supabase: SupabaseClient<Database>
  tenantId: string
  appointmentId: string
  cancellationReason?: string
}): Promise<void> {
  try {
    const { supabase, tenantId, appointmentId, cancellationReason } = params
    const [appointment, tenant] = await Promise.all([
      fetchAppointmentDetails(supabase, appointmentId, tenantId),
      fetchTenantBranding(supabase, tenantId),
    ])

    if (!appointment?.guest_email) return
    const resend = getResend()
    if (!resend) return

    const lawyerName = await fetchLawyerName(supabase, appointment.user_id)

    const { html, text, subject } = await renderBookingCancellationEmail({
      firmName: tenant.name,
      firmLogoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      clientFirstName: getContactFirstName(appointment.guest_name),
      lawyerName,
      appointmentDate: formatAppointmentDate(appointment.appointment_date),
      appointmentTime: formatAppointmentTime(appointment.start_time),
      cancellationReason,
    })

    await resend.emails.send({
      from: `${tenant.name} <notifications@${FROM_DOMAIN}>`,
      to: [appointment.guest_email],
      subject,
      html,
      text,
    })
  } catch (err) {
    console.error('[booking-email] Failed to send cancellation:', err)
  }
}

export async function sendBookingNoShowEmail(params: {
  supabase: SupabaseClient<Database>
  tenantId: string
  appointmentId: string
}): Promise<void> {
  try {
    const { supabase, tenantId, appointmentId } = params
    const [appointment, tenant] = await Promise.all([
      fetchAppointmentDetails(supabase, appointmentId, tenantId),
      fetchTenantBranding(supabase, tenantId),
    ])

    if (!appointment?.guest_email) return
    const resend = getResend()
    if (!resend) return

    const lawyerName = await fetchLawyerName(supabase, appointment.user_id)

    const { html, text, subject } = await renderBookingNoShowEmail({
      firmName: tenant.name,
      firmLogoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      clientFirstName: getContactFirstName(appointment.guest_name),
      lawyerName,
      appointmentDate: formatAppointmentDate(appointment.appointment_date),
      appointmentTime: formatAppointmentTime(appointment.start_time),
    })

    await resend.emails.send({
      from: `${tenant.name} <notifications@${FROM_DOMAIN}>`,
      to: [appointment.guest_email],
      subject,
      html,
      text,
    })
  } catch (err) {
    console.error('[booking-email] Failed to send no-show email:', err)
  }
}
