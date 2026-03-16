/**
 * POST /api/support/issue
 *
 * Intake endpoint for internal support issues.
 * Authenticates the user, validates the form, captures to Sentry,
 * and returns a reference ID.
 *
 * Requires: settings:view permission.
 * Sensitive content is sent to Sentry only — never logged to console.
 *
 * Team 3 / Module 4 — Support and Implementation Tooling
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { log } from '@/lib/utils/logger'

// ─── Schema ───────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  area: z.enum(['email', 'calendar', 'billing', 'matters', 'auth', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
})

type IssuePayload = z.infer<typeof issueSchema>

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')

    const body = await request.json()
    const parsed = issueSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const payload: IssuePayload = parsed.data
    const reference = `ISS-${Date.now()}`

    // Structured log: metadata only — no description content in console logs
    log.info('support.issue.received', {
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      area: payload.area,
      severity: payload.severity,
      reference,
    })

    // Full content captured to Sentry only
    Sentry.withScope((scope) => {
      scope.setTag('tenant_id', auth.tenantId)
      scope.setTag('user_id', auth.userId)
      scope.setTag('area', payload.area)
      scope.setTag('severity', payload.severity)
      scope.setTag('reference', reference)
      scope.setExtra('title', payload.title)
      scope.setExtra('description', payload.description)
      Sentry.captureMessage(
        `Support Issue [${payload.severity.toUpperCase()}] — ${payload.area}: ${payload.title}`,
        payload.severity === 'critical' ? 'fatal' : payload.severity === 'high' ? 'error' : 'warning',
      )
    })

    return NextResponse.json({ received: true, reference }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    log.error('support.issue.unexpected_error', {
      error_message: err instanceof Error ? err.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: 'Could not submit issue — please try again.' },
      { status: 500 },
    )
  }
}
