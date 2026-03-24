import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteContext = { params: Promise<{ id: string }> }

interface VerifyTarget {
  type: 'field' | 'document'
  profile_path?: string
  verified_value?: unknown
  slot_id?: string
}

interface VerifyBody {
  action: 'verify' | 'reject'
  targets: VerifyTarget[]
  rejection_reason?: string
  notes?: string
}

/**
 * POST /api/matters/[id]/verify
 *
 * Unified verification endpoint for fields and documents.
 * Lawyers can verify (lock) or reject individual fields/document slots.
 *
 * When a field is verified it becomes read-only in the Client Portal.
 * When a field is rejected the portal highlights it for correction.
 *
 * Every action is logged to both audit_logs and activities tables.
 * A Supabase Realtime broadcast is sent on the intake:{matterId} channel
 * so the Client Portal updates in real time.
 *
 * Permission: form_packs:create (Lawyer/Admin only)
 */
async function handlePost(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create') // Lawyer/Admin gate

    const body = (await request.json()) as VerifyBody

    // ── Validate request ─────────────────────────────────────────────────
    if (!body.action || !['verify', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { error: 'action must be "verify" or "reject"' },
        { status: 400 },
      )
    }

    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json(
        { error: 'targets array is required and must not be empty' },
        { status: 400 },
      )
    }

    if (body.action === 'reject' && !body.rejection_reason) {
      return NextResponse.json(
        { error: 'rejection_reason is required when action is "reject"' },
        { status: 400 },
      )
    }

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    const verificationStatus = body.action === 'verify' ? 'verified' : 'rejected'
    const now = new Date().toISOString()
    const results: Array<{ target: VerifyTarget; ok: boolean; error?: string }> = []

    // ── Process each target ──────────────────────────────────────────────

    for (const target of body.targets) {
      try {
        if (target.type === 'field' && target.profile_path) {
          await processFieldTarget(
            auth,
            matterId,
            target,
            verificationStatus,
            body.rejection_reason,
            body.notes,
            now,
          )
          results.push({ target, ok: true })
        } else if (target.type === 'document' && target.slot_id) {
          await processDocumentTarget(
            auth,
            matterId,
            target,
            verificationStatus,
            body.rejection_reason,
            now,
          )
          results.push({ target, ok: true })
        } else {
          results.push({
            target,
            ok: false,
            error: 'Invalid target: field requires profile_path, document requires slot_id',
          })
        }
      } catch (err) {
        results.push({
          target,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    // ── Broadcast realtime update ────────────────────────────────────────

    try {
      const admin = createAdminClient()
      const channel = admin.channel(`intake:${matterId}`)
      await channel.send({
        type: 'broadcast',
        event: 'verification_update',
        payload: {
          action: body.action,
          targets: body.targets.map((t) => ({
            type: t.type,
            id: t.type === 'field' ? t.profile_path : t.slot_id,
          })),
          verification_status: verificationStatus,
          user_id: auth.userId,
          timestamp: now,
        },
      })
      // Unsubscribe immediately — this is a one-shot broadcast
      admin.removeChannel(channel)
    } catch (broadcastErr) {
      // Non-fatal: realtime broadcast failure shouldn't fail the request
      console.warn('[verify] Realtime broadcast failed:', broadcastErr)
    }

    // ── Audit log (summary) ──────────────────────────────────────────────

    const successCount = results.filter((r) => r.ok).length
    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter',
      entityId: matterId,
      action: `verification_${body.action}`,
      changes: {
        targets: body.targets.length,
        succeeded: successCount,
        rejection_reason: body.rejection_reason || null,
      },
      metadata: { verification_status: verificationStatus },
    })

    return NextResponse.json({
      success: true,
      action: body.action,
      processed: results.length,
      succeeded: successCount,
      results,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('[verify] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// ── Field verification ─────────────────────────────────────────────────────

async function processFieldTarget(
  auth: Awaited<ReturnType<typeof authenticateRequest>>,
  matterId: string,
  target: VerifyTarget,
  verificationStatus: string,
  rejectionReason: string | undefined,
  notes: string | undefined,
  now: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any)
    .from('field_verifications')
    .upsert(
      {
        tenant_id: auth.tenantId,
        matter_id: matterId,
        profile_path: target.profile_path,
        verified_value: target.verified_value ?? null,
        verified_by: auth.userId,
        verified_at: now,
        verification_status: verificationStatus,
        rejection_reason: verificationStatus === 'rejected' ? rejectionReason : null,
        notes: notes ?? null,
      },
      { onConflict: 'tenant_id,matter_id,profile_path' },
    )

  if (error) throw new Error(`Field upsert failed: ${error.message}`)

  // Activity log
  const activityType = verificationStatus === 'verified'
    ? 'field_verified'
    : 'field_rejected'

  await auth.supabase.from('activities').insert({
    tenant_id: auth.tenantId,
    matter_id: matterId,
    activity_type: activityType,
    title: verificationStatus === 'verified'
      ? `Field "${target.profile_path}" verified`
      : `Field "${target.profile_path}" rejected`,
    description: verificationStatus === 'rejected'
      ? `Rejection reason: ${rejectionReason}`
      : null,
    entity_type: 'field_verification',
    user_id: auth.userId,
    metadata: {
      profile_path: target.profile_path,
      verification_status: verificationStatus,
      rejection_reason: rejectionReason || null,
    },
  })
}

// ── Document verification ──────────────────────────────────────────────────

async function processDocumentTarget(
  auth: Awaited<ReturnType<typeof authenticateRequest>>,
  matterId: string,
  target: VerifyTarget,
  verificationStatus: string,
  rejectionReason: string | undefined,
  now: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any)
    .from('document_slots')
    .update({
      verification_status: verificationStatus,
      verified_by: auth.userId,
      verified_at: now,
      verification_rejection_reason:
        verificationStatus === 'rejected' ? rejectionReason : null,
    })
    .eq('id', target.slot_id!)
    .eq('matter_id', matterId)

  if (error) throw new Error(`Document slot update failed: ${error.message}`)

  // Activity log
  const activityType = verificationStatus === 'verified'
    ? 'document_verified'
    : 'document_rejected'

  await auth.supabase.from('activities').insert({
    tenant_id: auth.tenantId,
    matter_id: matterId,
    activity_type: activityType,
    title: verificationStatus === 'verified'
      ? `Document slot verified`
      : `Document slot rejected`,
    description: verificationStatus === 'rejected'
      ? `Rejection reason: ${rejectionReason}`
      : null,
    entity_type: 'document_slot',
    entity_id: target.slot_id,
    user_id: auth.userId,
    metadata: {
      slot_id: target.slot_id,
      verification_status: verificationStatus,
      rejection_reason: rejectionReason || null,
    },
  })
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/verify')
