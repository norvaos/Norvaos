import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logCommunicationEvent, type LogCommunicationEventParams } from '@/lib/services/lead-communication-engine'
import { resolveTemplate, isAutomationEnabled, buildBaseTemplateContext } from '@/lib/services/lead-template-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/leads/[id]/communication
 *
 * Log a communication event against a lead. Delegates to the communication
 * engine which handles:
 *   - Event creation with thread support
 *   - Contact attempt tracking
 *   - Auto-completion of matching milestone tasks
 *   - Summary recalculation
 *
 * For automated communications, resolves templates via the template engine
 * before logging — no hardcoded message strings in this route.
 *
 * Body: {
 *   channel: string,         // 'call' | 'email' | 'sms' | 'in_app' | 'portal_chat' | etc.
 *   direction: string,       // 'inbound' | 'outbound'
 *   subtype?: string,        // Channel-specific subtype
 *   subject?: string,
 *   bodyPreview?: string,
 *   deliveryStatus?: string,
 *   readStatus?: string,
 *   threadKey?: string,
 *   providerThreadId?: string,
 *   providerMessageId?: string,
 *   inReplyTo?: string,      // UUID of parent communication event
 *   linkedTaskId?: string,
 *   contactId?: string,
 *   metadata?: Record<string, unknown>,
 *   // Optional: use automation template instead of manual subject/body
 *   automationTriggerKey?: string,  // e.g., 'intake_confirmation'
 * }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const {
      channel,
      direction,
      subtype,
      subject,
      bodyPreview,
      deliveryStatus,
      readStatus,
      threadKey,
      providerThreadId,
      providerMessageId,
      inReplyTo,
      linkedTaskId,
      contactId,
      metadata,
      automationTriggerKey,
    } = body as {
      channel?: string
      direction?: string
      subtype?: string
      subject?: string
      bodyPreview?: string
      deliveryStatus?: string
      readStatus?: string
      threadKey?: string
      providerThreadId?: string
      providerMessageId?: string
      inReplyTo?: string
      linkedTaskId?: string
      contactId?: string
      metadata?: Record<string, unknown>
      automationTriggerKey?: string
    }

    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'channel is required' },
        { status: 400 }
      )
    }

    if (!direction || !['inbound', 'outbound', 'system'].includes(direction)) {
      return NextResponse.json(
        { success: false, error: 'direction must be "inbound", "outbound", or "system"' },
        { status: 400 }
      )
    }

    const validChannels = ['call', 'email', 'sms', 'portal_chat', 'system_reminder']
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { success: false, error: `channel must be one of: ${validChannels.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify lead belongs to tenant
    const { data: lead, error: leadErr } = await auth.supabase
      .from('leads')
      .select('id, tenant_id')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    // Resolve template if automation trigger specified
    let resolvedSubject = subject
    let resolvedBody = bodyPreview
    let templateMetadata: Record<string, unknown> = {}

    if (automationTriggerKey) {
      const enabled = await isAutomationEnabled(
        auth.supabase,
        auth.tenantId,
        automationTriggerKey
      )

      if (enabled) {
        const context = await buildBaseTemplateContext(
          auth.supabase,
          auth.tenantId,
          leadId
        )
        const template = await resolveTemplate(
          auth.supabase,
          auth.tenantId,
          automationTriggerKey,
          channel,
          context
        )

        if (template) {
          resolvedSubject = template.subject ?? resolvedSubject
          resolvedBody = template.body ?? resolvedBody
          templateMetadata = {
            trigger_key: automationTriggerKey,
            template_source: template.isWorkspaceOverride ? 'workspace' : 'system_default',
          }
        }
      }
    }

    const result = await logCommunicationEvent({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      leadId,
      contactId: contactId || undefined,
      channel: channel as LogCommunicationEventParams['channel'],
      direction: direction as LogCommunicationEventParams['direction'],
      subtype,
      subject: resolvedSubject,
      bodyPreview: resolvedBody,
      deliveryStatus,
      readStatus,
      threadKey,
      providerThreadId,
      providerMessageId,
      inReplyTo,
      linkedTaskId,
      actorUserId: auth.userId,
      actorType: 'user',
      metadata: { ...metadata, ...templateMetadata },
    })

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      countsAsContactAttempt: result.countsAsContactAttempt,
      tasksAutoCompleted: result.tasksAutoCompleted,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/communication] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/communication')
