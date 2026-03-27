/**
 * POST /api/leads/[id]/golden-thread-override
 * Log a Golden Thread gate bypass override.
 *
 * Body: { gateKey, justification, partnerPin }
 *
 * Constraints:
 *   - justification >= 50 characters
 *   - partnerPin >= 4 characters
 *   - User must be partner or admin role
 *   - Generates RED_FLAG audit event with SHA-256 hash
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const VALID_GATE_KEYS = ['conflict_check', 'strategy_meeting', 'id_capture'] as const

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: leadId } = await params

    const body = await request.json().catch(() => ({})) as {
      gateKey?: string
      justification?: string
      partnerPin?: string
    }

    // ── Validation ─────────────────────────────────────────────────────
    if (!body.gateKey || !body.justification || !body.partnerPin) {
      return NextResponse.json(
        { error: 'gateKey, justification, and partnerPin are required' },
        { status: 400 },
      )
    }

    if (!VALID_GATE_KEYS.includes(body.gateKey as typeof VALID_GATE_KEYS[number])) {
      return NextResponse.json(
        { error: `Invalid gateKey. Must be one of: ${VALID_GATE_KEYS.join(', ')}` },
        { status: 400 },
      )
    }

    const justification = body.justification.trim()
    if (justification.length < 50) {
      return NextResponse.json(
        { error: 'Justification must be at least 50 characters' },
        { status: 400 },
      )
    }

    const partnerPin = body.partnerPin.trim()
    if (partnerPin.length < 4) {
      return NextResponse.json(
        { error: 'Partner PIN must be at least 4 characters' },
        { status: 400 },
      )
    }

    // ── Role check (uses pre-fetched auth.role from authenticateRequest) ─
    const admin = createAdminClient()
    const roleName = auth.role?.name?.toLowerCase() ?? ''
    const authorizedRoles = ['partner', 'admin', 'owner']

    if (!authorizedRoles.includes(roleName)) {
      return NextResponse.json(
        { error: 'Only Partner or Admin can perform Golden Thread overrides' },
        { status: 403 },
      )
    }

    // ── Compute hashes ─────────────────────────────────────────────────
    const justificationHash = createHash('sha256')
      .update(justification)
      .digest('hex')
    const pinHash = createHash('sha256')
      .update(partnerPin)
      .digest('hex')

    // ── Insert compliance override ─────────────────────────────────────
    const blockedNode = `golden_thread.${body.gateKey}`

    const { data: override, error: insertErr } = await admin
      .from('compliance_overrides')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: leadId, // Re-use matter_id column for lead_id
        override_type: 'golden_thread_gate_bypass' as string,
        blocked_node: blockedNode,
        original_status: 'locked',
        justification,
        justification_hash: justificationHash,
        authorized_by: auth.userId,
        authorized_role: roleName,
        partner_pin_hash: pinHash,
        is_active: true,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[golden-thread-override] Insert error:', insertErr)
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 },
      )
    }

    // ── RED_FLAG audit event ───────────────────────────────────────────
    await admin.from('audit_logs').insert({
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      entity_type: 'lead',
      entity_id: leadId,
      action: 'RED_FLAG',
      severity: 'critical',
      changes: {
        override_type: 'golden_thread_gate_bypass',
        gate_key: body.gateKey,
        blocked_node: blockedNode,
        justification_hash: justificationHash,
        override_id: override.id,
      },
      metadata: {
        protocol: 'ZIA-GOLDEN-001',
        authorized_role: roleName,
        pin_hash: pinHash,
        timestamp: new Date().toISOString(),
        immutable: true,
      },
    })

    return NextResponse.json({
      success: true,
      override_id: override.id,
      justification_hash: justificationHash,
      message: `Golden Thread gate "${body.gateKey}" overridden — RED_FLAG audit logged`,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[golden-thread-override] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/golden-thread-override')
