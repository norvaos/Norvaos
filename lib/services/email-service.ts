import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { renderStageChangeEmail } from '@/lib/email-templates/stage-change'
import { renderDocumentRequestEmail } from '@/lib/email-templates/document-request'
import { renderGeneralNotificationEmail } from '@/lib/email-templates/general-notification'
import { renderDeadlineAlertEmail } from '@/lib/email-templates/deadline-alert'
import { renderRetainerAgreementEmail } from '@/lib/email-templates/retainer-agreement'
import { renderPortalInviteEmail } from '@/lib/email-templates/portal-invite'
import { renderPaymentReceiptEmail } from '@/lib/email-templates/payment-receipt'
import { resolveEmailLocale } from '@/lib/email-templates/email-locale'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SendStageChangeEmailParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  contactId: string
  stageName: string
  previousStageName?: string
}

interface SendClientEmailParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  contactId: string
  notificationType: 'stage_change' | 'document_request' | 'deadline_alert' | 'general' | 'retainer_agreement' | 'portal_invite' | 'payment_receipt'
  templateData: Record<string, unknown>
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email-service] RESEND_API_KEY not configured — emails will be skipped')
    return null
  }
  return new Resend(apiKey)
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'

/** Build the FROM address. Uses Resend test address when domain is resend.dev */
function getFromAddress(firmName: string): string {
  if (FROM_DOMAIN === 'resend.dev') {
    return 'onboarding@resend.dev'
  }
  return `${firmName} <notifications@${FROM_DOMAIN}>`
}

async function getPortalToken(
  supabase: SupabaseClient<Database>,
  matterId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('portal_links')
    .select('token, expires_at')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null
  return data.token
}

function getPortalUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') || 'http://localhost:3000'
  return `${baseUrl}/portal/${token}`
}

async function fetchTenantBranding(supabase: SupabaseClient<Database>, tenantId: string) {
  const { data } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('id', tenantId)
    .single()
  return data ?? { name: 'Your Law Firm', logo_url: null, primary_color: '#3b82f6' }
}

async function fetchContact(supabase: SupabaseClient<Database>, contactId: string) {
  const { data } = await supabase
    .from('contacts')
    .select('first_name, email_primary, email_notifications_enabled, preferred_language')
    .eq('id', contactId)
    .single()
  return data
}

async function fetchMatterRef(supabase: SupabaseClient<Database>, matterId: string) {
  const { data } = await supabase
    .from('matters')
    .select('title, matter_number')
    .eq('id', matterId)
    .single()
  return data
}

// ─── Core: Send Stage Change Email ──────────────────────────────────────────────

/**
 * Send a stage change notification email to a client contact.
 * Called from `notifyStageChange()` in stage-engine.ts.
 * Non-blocking: all errors caught internally — never throws.
 */
export async function sendStageChangeEmail(params: SendStageChangeEmailParams): Promise<void> {
  const { supabase, tenantId, matterId, contactId, stageName, previousStageName } = params

  try {
    const [contact, tenant, matter] = await Promise.all([
      fetchContact(supabase, contactId),
      fetchTenantBranding(supabase, tenantId),
      fetchMatterRef(supabase, matterId),
    ])

    // Check if contact has email and notifications enabled
    if (!contact?.email_primary) {
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType: 'stage_change',
        subject: `Case Update: ${stageName}`,
        status: 'skipped',
        errorMessage: 'Contact has no email address',
        metadata: { stage_name: stageName },
      })
      return
    }

    if (contact.email_notifications_enabled === false) {
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType: 'stage_change',
        subject: `Case Update: ${stageName}`,
        status: 'skipped',
        recipientEmail: contact.email_primary,
        errorMessage: 'Email notifications disabled for this contact',
        metadata: { stage_name: stageName },
      })
      return
    }

    const resend = getResend()
    if (!resend) {
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType: 'stage_change',
        subject: `Case Update: ${stageName}`,
        status: 'skipped',
        recipientEmail: contact.email_primary,
        errorMessage: 'RESEND_API_KEY not configured',
        metadata: { stage_name: stageName },
      })
      return
    }

    // Build portal URL
    const portalToken = await getPortalToken(supabase, matterId)
    const portalUrl = portalToken ? getPortalUrl(portalToken) : undefined
    const matterRef = matter?.matter_number || matter?.title || 'your case'

    // Render email
    const { html, text, subject } = await renderStageChangeEmail({
      firmName: tenant.name,
      firmLogoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color ?? "",
      clientFirstName: contact.first_name,
      matterReference: matterRef,
      newStageName: stageName,
      previousStageName,
      portalUrl,
    })

    // Insert pending notification
    const { data: notifRow } = await supabase
      .from('client_notifications')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: contactId,
        notification_type: 'stage_change',
        subject,
        body_html: html,
        body_text: text,
        channel: 'email',
        status: 'pending',
        recipient_email: contact.email_primary,
        metadata: {
          stage_name: stageName,
          previous_stage_name: previousStageName,
          portal_url: portalUrl,
        } as unknown as Database['public']['Tables']['client_notifications']['Insert']['metadata'],
      })
      .select('id')
      .single()

    // Send via Resend
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [contact.email_primary],
      subject,
      html,
      text,
    })

    // Update notification status
    if (notifRow) {
      if (resendError) {
        await supabase
          .from('client_notifications')
          .update({
            status: 'failed',
            error_message: resendError.message,
          })
          .eq('id', notifRow.id)
      } else {
        await supabase
          .from('client_notifications')
          .update({
            status: 'sent',
            resend_message_id: resendData?.id ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', notifRow.id)
      }
    }
  } catch (err) {
    // Non-blocking — never throw from email service
    console.error('[email-service] Failed to send stage change email:', err)
    try {
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType: 'stage_change',
        subject: `Case Update: ${stageName}`,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        metadata: { stage_name: stageName },
      })
    } catch {
      // Even logging failed — nothing more to do
    }
  }
}

// ─── Core: Generic Send Client Email ────────────────────────────────────────────

/**
 * Send a generic client notification email.
 * Called from the automation engine `send_client_email` action.
 * Non-blocking: all errors caught internally — never throws.
 */
export async function sendClientEmail(params: SendClientEmailParams): Promise<void> {
  const { supabase, tenantId, matterId, contactId, notificationType, templateData } = params

  try {
    const [contact, tenant, matter] = await Promise.all([
      fetchContact(supabase, contactId),
      fetchTenantBranding(supabase, tenantId),
      fetchMatterRef(supabase, matterId),
    ])

    if (!contact?.email_primary) {
      console.warn(`[email-service] Skipping ${notificationType}: contact ${contactId} has no email address`)
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType,
        subject: `${notificationType} notification`,
        status: 'skipped',
        errorMessage: 'Contact has no email address',
        metadata: templateData as Record<string, unknown>,
      })
      return
    }

    if (contact.email_notifications_enabled === false) {
      console.warn(`[email-service] Skipping ${notificationType}: notifications disabled for ${contact.email_primary}`)
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType,
        subject: `${notificationType} notification`,
        status: 'skipped',
        recipientEmail: contact.email_primary,
        errorMessage: 'Email notifications disabled for this contact',
        metadata: templateData as Record<string, unknown>,
      })
      return
    }

    const resend = getResend()
    if (!resend) {
      console.warn(`[email-service] Skipping ${notificationType}: RESEND_API_KEY not configured`)
      await logNotification(supabase, {
        tenantId, matterId, contactId,
        notificationType,
        subject: `${notificationType} notification`,
        status: 'skipped',
        recipientEmail: contact.email_primary,
        errorMessage: 'RESEND_API_KEY not configured',
        metadata: templateData as Record<string, unknown>,
      })
      return
    }

    const portalToken = await getPortalToken(supabase, matterId)
    const portalUrl = portalToken ? getPortalUrl(portalToken) : undefined
    const matterRef = matter?.matter_number || matter?.title || 'your case'

    let html: string
    let text: string
    let subject: string

    switch (notificationType) {
      case 'stage_change': {
        const rendered = await renderStageChangeEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          newStageName: (templateData.stage_name as string) || 'Updated',
          previousStageName: templateData.previous_stage_name as string | undefined,
          portalUrl,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'document_request': {
        const rendered = await renderDocumentRequestEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          documentNames: (templateData.document_names as string[]) || [],
          portalUrl,
          message: templateData.message as string | undefined,
          language: (templateData.language as 'en' | 'fr') || 'en',
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'deadline_alert': {
        const rendered = await renderDeadlineAlertEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          deadlineTitle: (templateData.deadline_title as string) || 'Upcoming Deadline',
          deadlineType: (templateData.deadline_type as string) || 'Deadline',
          dueDate: (templateData.due_date as string) || '',
          daysRemaining: (templateData.days_remaining as number) ?? 0,
          riskLevel: (templateData.risk_level as string) || 'moderate',
          portalUrl,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'retainer_agreement': {
        const locale = resolveEmailLocale(contact.preferred_language)
        const rendered = await renderRetainerAgreementEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          documentTitle: (templateData.document_title as string) || 'Retainer Agreement',
          signingUrl: (templateData.signing_url as string) || '',
          expiresAt: (templateData.expires_at as string) || new Date(Date.now() + 7 * 86400000).toISOString(),
          totalAmount: templateData.total_amount as string | undefined,
          language: locale,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'portal_invite': {
        const locale = resolveEmailLocale(contact.preferred_language)
        const rendered = await renderPortalInviteEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          portalUrl: portalUrl || (templateData.portal_url as string) || '',
          lawyerName: templateData.lawyer_name as string | undefined,
          language: locale,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'payment_receipt': {
        const locale = resolveEmailLocale(contact.preferred_language)
        const rendered = await renderPaymentReceiptEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          invoiceNumber: (templateData.invoice_number as string) || '',
          amountPaid: (templateData.amount_paid as string) || '',
          paymentDate: (templateData.payment_date as string) || new Date().toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA'),
          paymentMethod: templateData.payment_method as string | undefined,
          trustAccountName: templateData.trust_account_name as string | undefined,
          balanceRemaining: templateData.balance_remaining as string | undefined,
          language: locale,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }

      case 'general':
      default: {
        const rendered = await renderGeneralNotificationEmail({
          firmName: tenant.name,
          firmLogoUrl: tenant.logo_url,
          primaryColor: tenant.primary_color ?? "",
          clientFirstName: contact.first_name,
          matterReference: matterRef,
          subject: (templateData.subject as string) || `Update on your case`,
          bodyText: (templateData.body as string) || 'There is an update regarding your case.',
          portalUrl,
          ctaLabel: templateData.cta_label as string | undefined,
        })
        html = rendered.html
        text = rendered.text
        subject = rendered.subject
        break
      }
    }

    // Insert + send
    const { data: notifRow } = await supabase
      .from('client_notifications')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: contactId,
        notification_type: notificationType,
        subject,
        body_html: html,
        body_text: text,
        channel: 'email',
        status: 'pending',
        recipient_email: contact.email_primary,
        metadata: templateData as unknown as Database['public']['Tables']['client_notifications']['Insert']['metadata'],
      })
      .select('id')
      .single()

    console.log(`[email-service] Sending ${notificationType} to ${contact.email_primary} via Resend (from: notifications@${FROM_DOMAIN})`)

    const { data: resendData, error: resendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [contact.email_primary],
      subject,
      html,
      text,
    })

    if (resendError) {
      console.error(`[email-service] Resend API error for ${notificationType}:`, resendError)
    } else {
      console.log(`[email-service] Email sent successfully: ${notificationType} → ${contact.email_primary} (resend_id: ${resendData?.id})`)
    }

    if (notifRow) {
      if (resendError) {
        await supabase
          .from('client_notifications')
          .update({ status: 'failed', error_message: resendError.message })
          .eq('id', notifRow.id)
      } else {
        await supabase
          .from('client_notifications')
          .update({
            status: 'sent',
            resend_message_id: resendData?.id ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', notifRow.id)
      }
    }
  } catch (err) {
    console.error('[email-service] Failed to send client email:', err)
  }
}

// ─── Core: Internal Staff Notification Email ─────────────────────────────────────

interface SendInternalEmailParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  recipientEmail: string
  recipientName: string
  title: string
  message: string
  entityType?: string
  entityId?: string
  /** Pre-rendered HTML — bypasses internal notification template (Directive 40.0 §3) */
  htmlOverride?: string
  /** Pre-rendered plain text — used with htmlOverride */
  textOverride?: string
}

/**
 * Send a notification email to an internal staff member.
 * Called from the notification dispatch engine.
 * Non-blocking: all errors caught internally — never throws.
 */
export async function sendInternalEmail(params: SendInternalEmailParams): Promise<void> {
  const { supabase, tenantId, recipientEmail, recipientName, title, message, entityType, entityId, htmlOverride, textOverride } = params

  try {
    const resend = getResend()
    if (!resend) return

    const tenant = await fetchTenantBranding(supabase, tenantId)

    let html: string
    let text: string
    let subject: string

    if (htmlOverride) {
      // Directive 40.0 §3: Pre-rendered localised template — skip internal notification rendering
      html = htmlOverride
      text = textOverride ?? message
      subject = title
    } else {
      // Build action URL if entity context is available
      let actionUrl: string | undefined
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      if (entityType && entityId) {
        switch (entityType) {
          case 'matter':
            actionUrl = `${baseUrl}/matters/${entityId}`
            break
          case 'task':
            actionUrl = `${baseUrl}/tasks`
            break
          case 'chat':
            actionUrl = `${baseUrl}/chat`
            break
          case 'document':
            actionUrl = `${baseUrl}/matters`
            break
        }
      }

      const { renderInternalNotificationEmail } = await import('@/lib/email-templates/internal-notification')
      const rendered = await renderInternalNotificationEmail({
        firmName: tenant.name,
        firmLogoUrl: tenant.logo_url,
        primaryColor: tenant.primary_color ?? "",
        recipientName,
        title,
        message,
        actionUrl,
        actionLabel: actionUrl ? 'View Details' : undefined,
      })
      html = rendered.html
      text = rendered.text
      subject = rendered.subject
    }

    await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [recipientEmail],
      subject,
      html,
      text,
    })
  } catch (err) {
    // Non-blocking — never throw from email service
    console.error('[email-service] Failed to send internal email:', err)
  }
}

// ─── Notification Logger ────────────────────────────────────────────────────────

async function logNotification(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    contactId: string
    notificationType: string
    subject: string
    status: string
    recipientEmail?: string
    errorMessage?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await supabase.from('client_notifications').insert({
    tenant_id: params.tenantId,
    matter_id: params.matterId,
    contact_id: params.contactId,
    notification_type: params.notificationType,
    subject: params.subject,
    status: params.status,
    recipient_email: params.recipientEmail ?? null,
    error_message: params.errorMessage ?? null,
    metadata: (params.metadata ?? {}) as unknown as Database['public']['Tables']['client_notifications']['Insert']['metadata'],
  })
}
