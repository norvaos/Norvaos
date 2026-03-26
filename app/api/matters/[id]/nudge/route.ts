import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendClientEmail } from '@/lib/services/email-service'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/nudge
 *
 * Directive 050  -  Smart Nudge Endpoint
 *
 * Sends a glass-styled nudge email to the client if:
 *   1. matter.readiness_score < 50
 *   2. matter.created_at > 7 days ago (matter has been open long enough)
 *   3. No nudge sent for this matter in the last 48 hours (rate limit)
 *
 * Returns: { sent: boolean, reason: string }
 */

const NUDGE_SCORE_THRESHOLD = 50
const NUDGE_MATTER_AGE_DAYS = 7
const NUDGE_COOLDOWN_HOURS = 48

async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const supabase = await createClient()

    // ── Auth ──────────────────────────────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: appUser } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // ── Fetch matter ──────────────────────────────────────────────────────
    const { data: matter } = await (supabase as any)
      .from('matters')
      .select('id, title, matter_number, readiness_score, readiness_breakdown, created_at, contact_id')
      .eq('id', matterId)
      .eq('tenant_id', appUser.tenant_id)
      .single() as { data: any }

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // ── Gate 1: Score threshold ───────────────────────────────────────────
    const score = matter.readiness_score ?? 0
    if (score >= NUDGE_SCORE_THRESHOLD) {
      return NextResponse.json({
        sent: false,
        reason: `Sovereign Score is ${score}/100, which meets or exceeds the ${NUDGE_SCORE_THRESHOLD} threshold. No nudge required.`,
      })
    }

    // ── Gate 2: Matter age ────────────────────────────────────────────────
    const matterAgeMs = Date.now() - new Date(matter.created_at).getTime()
    const matterAgeDays = matterAgeMs / (1000 * 60 * 60 * 24)
    if (matterAgeDays < NUDGE_MATTER_AGE_DAYS) {
      return NextResponse.json({
        sent: false,
        reason: `Matter is only ${Math.floor(matterAgeDays)} day(s) old. Nudges are only sent after ${NUDGE_MATTER_AGE_DAYS} days.`,
      })
    }

    // ── Gate 3: Rate limit (48-hour cooldown) ─────────────────────────────
    const cooldownCutoff = new Date(
      Date.now() - NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000,
    ).toISOString()

    const { data: recentNudge } = await supabase
      .from('client_notifications')
      .select('id, created_at')
      .eq('matter_id', matterId)
      .eq('notification_type', 'readiness_nudge')
      .gte('created_at', cooldownCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentNudge) {
      return NextResponse.json({
        sent: false,
        reason: `A nudge was already sent on ${recentNudge.created_at}. Rate limit is one nudge per ${NUDGE_COOLDOWN_HOURS} hours.`,
      })
    }

    // ── Find primary client contact ───────────────────────────────────────
    const { data: primaryClient } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    // Fall back to any client contact
    const contactRow = primaryClient ?? (await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .limit(1)
      .maybeSingle()
    ).data

    if (!contactRow?.contact_id) {
      return NextResponse.json({
        sent: false,
        reason: 'No client contact found for this matter.',
      })
    }

    // ── Determine the most impactful missing document ─────────────────────
    const breakdown = matter.readiness_breakdown as Record<string, unknown> | null
    let missingDocLabel = 'required documents'

    // Try to find the first missing required doc from document_slots
    const { data: missingSlot } = await supabase
      .from('document_slots')
      .select('slot_name')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .eq('is_required', true)
      .not('status', 'in', '("accepted","uploaded","not_applicable")')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (missingSlot?.slot_name) {
      missingDocLabel = missingSlot.slot_name
    }

    // ── Send the nudge email ──────────────────────────────────────────────
    const matterRef = matter.matter_number || matter.title || 'your case'
    const admin = createAdminClient()

    const nudgeSubject = `Action Required: Your Sovereign Score for ${matterRef}`
    const nudgeBody =
      `Your Sovereign Score is currently ${score}/100. ` +
      `To maintain your submission timeline, please upload the '${missingDocLabel}' to your portal.`

    // Use 'general' notification type with readiness_nudge metadata
    // so sendClientEmail renders through the general notification template.
    // We log the notification_type as 'readiness_nudge' for rate-limit tracking.

    // First, log the nudge notification directly for rate-limit tracking
    await admin
      .from('client_notifications')
      .insert({
        tenant_id: appUser.tenant_id,
        matter_id: matterId,
        contact_id: contactRow.contact_id,
        notification_type: 'readiness_nudge',
        subject: nudgeSubject,
        channel: 'email',
        status: 'pending',
        metadata: {
          readiness_score: score,
          readiness_breakdown: breakdown,
          missing_document: missingDocLabel,
        } as never,
      })

    // Send via the standard email service
    await sendClientEmail({
      supabase: admin,
      tenantId: appUser.tenant_id,
      matterId,
      contactId: contactRow.contact_id,
      notificationType: 'general',
      templateData: {
        subject: nudgeSubject,
        body: nudgeBody,
        cta_label: 'Upload Documents',
        nudge_type: 'readiness_nudge',
        readiness_score: score,
      },
    })

    return NextResponse.json({
      sent: true,
      reason: `Nudge sent. Sovereign Score: ${score}/100. Missing: ${missingDocLabel}.`,
    })
  } catch (error) {
    console.error('[nudge] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/nudge')
