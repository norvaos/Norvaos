import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailViaProvider } from '@/lib/services/email-send'
import { withTiming } from '@/lib/middleware/request-timing'

// ── Zod Schema ──────────────────────────────────────────────────────────────

const sendMailSchema = z.object({
  to: z
    .array(z.string().email('Each "to" entry must be a valid email'))
    .min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email('Each "cc" entry must be a valid email')).optional().default([]),
  bcc: z.array(z.string().email('Each "bcc" entry must be a valid email')).optional().default([]),
  subject: z.string().min(1, 'Subject is required').max(998, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
  replyToMessageId: z.string().optional(),
  matterId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
})

type SendMailInput = z.infer<typeof sendMailSchema>

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * POST /api/integrations/microsoft/send-mail
 *
 * Send or reply to an email via Microsoft Graph.
 *
 * Body:
 *   to               (string[], required)
 *   cc               (string[], optional)
 *   bcc              (string[], optional)
 *   subject          (string, required)
 *   body             (string -- HTML, required)
 *   replyToMessageId (string, optional -- Graph message id to reply to)
 *   matterId         (string, optional -- associate send event with matter)
 *   contactId        (string, optional -- used to look up matter if matterId absent)
 *   leadId           (string, optional -- used to look up matter if matterId absent)
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    // ── Parse & validate body ─────────────────────────────────────────────
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = sendMailSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const input: SendMailInput = parsed.data
    const admin = createAdminClient()

    // ── Resolve matter ID if not provided ─────────────────────────────────
    let matterId = input.matterId ?? undefined

    if (!matterId && (input.contactId || input.leadId)) {
      // Try to find an associated matter via contact or lead
      if (input.contactId) {
        const { data: matterContact } = await admin
          .from('matter_contacts')
          .select('matter_id')
          .eq('contact_id', input.contactId)
          .eq('tenant_id', auth.tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (matterContact) {
          matterId = matterContact.matter_id
        }
      }

      if (!matterId && input.leadId) {
        const { data: lead } = await admin
          .from('leads')
          .select('matter_id')
          .eq('id', input.leadId)
          .eq('tenant_id', auth.tenantId)
          .single()

        if (lead?.matter_id) {
          matterId = lead.matter_id
        }
      }
    }

    // ── Find the user's email account ─────────────────────────────────────
    const { data: emailAccount } = await admin
      .from('email_accounts')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!emailAccount) {
      return NextResponse.json(
        { error: 'No active email account found. Please connect your Microsoft account first.' },
        { status: 404 }
      )
    }

    // ── Send via provider ─────────────────────────────────────────────────
    const result = await sendEmailViaProvider(
      admin,
      emailAccount.id,
      auth.userId,
      input.to,
      input.subject,
      input.body,
      {
        cc: input.cc,
        bcc: input.bcc,
        replyToMessageId: input.replyToMessageId,
        matterId,
        bodyType: 'html',
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to send email' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      data: {
        success: true,
        messageId: result.messageId,
        matterId: matterId ?? null,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[microsoft/send-mail] Error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/integrations/microsoft/send-mail')
