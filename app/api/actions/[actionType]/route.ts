import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAction } from '@/lib/services/actions'
import { executeAction } from '@/lib/services/action-executor'
import type { ActionSource } from '@/lib/services/actions/types'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/actions/[actionType]
 *
 * Generic action endpoint for the controlled workflow system.
 * Rule #1: All state changes go through this endpoint.
 * Rule #3: Server-side validation (auth, permissions, Zod, business rules).
 *
 * Request body:
 *   {
 *     input: { ... },           // Action-specific input
 *     source: "front_desk",     // Which surface is calling
 *     idempotencyKey?: "..."    // Optional dedup key (Rule #15)
 *   }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ actionType: string }> }
) {
  try {
    const { actionType } = await params

    // 1. Look up action definition
    const definition = getAction(actionType)
    if (!definition) {
      return NextResponse.json(
        { error: `Unknown action type: ${actionType}` },
        { status: 404 }
      )
    }

    // 2. Authenticate & authorize
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')

    // 3. Parse request body
    const body = await request.json()
    const { input, source, idempotencyKey } = body as {
      input: unknown
      source?: ActionSource
      idempotencyKey?: string
    }

    if (!input) {
      return NextResponse.json(
        { error: 'Request body must include "input" field' },
        { status: 400 }
      )
    }

    const actionSource = source ?? 'dashboard'

    // Auto-generate idempotency key if not provided (Phase 6C: prevent double-submit)
    const entityId = input && typeof input === 'object' && 'leadId' in input
      ? (input as Record<string, unknown>).leadId
      : input && typeof input === 'object' && 'matterId' in input
        ? (input as Record<string, unknown>).matterId
        : input && typeof input === 'object' && 'sessionId' in input
          ? (input as Record<string, unknown>).sessionId
          : 'unknown'
    const finalIdempotencyKey = idempotencyKey
      ?? `${actionType}:${entityId}:${auth.userId}:${Math.floor(Date.now() / 5000)}`

    // 4. Fetch user's role for permission check
    const admin = createAdminClient()

    const { data: userData } = await admin
      .from('users')
      .select('role_id')
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    let userRole = null
    if (userData?.role_id) {
      const { data: roleData } = await admin
        .from('roles')
        .select('name, permissions, is_system')
        .eq('id', userData.role_id)
        .single()

      if (roleData) {
        userRole = {
          name: roleData.name,
          permissions: (roleData.permissions ?? {}) as Record<string, Record<string, boolean>>,
          is_system: roleData.is_system ?? false,
        }
      }
    }

    // 5. Execute action via the action executor
    const result = await executeAction({
      definition,
      rawInput: input,
      tenantId: auth.tenantId,
      userId: auth.userId,
      supabase: admin,
      source: actionSource,
      idempotencyKey: finalIdempotencyKey,
      userRole,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 }
      )
    }

    return NextResponse.json({
      data: result.data,
      actionId: result.actionId,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    log.error('[actions] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/actions/[actionType]')
