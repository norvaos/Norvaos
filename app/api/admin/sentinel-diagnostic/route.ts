import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { generateDiagnosticSignature } from '@/lib/services/sentinel-diagnostic'

/**
 * GET /api/admin/sentinel-diagnostic
 *
 * Session B: Sentinel Pulse Diagnostic.
 * Generates the Firm Health Matrix JSON signature for support ticket stamping.
 * If the hash chain is broken → breach_status = "SYSTEM_BREACH_DETECTED".
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()

    const diagnostic = await generateDiagnosticSignature(auth.tenantId)

    return NextResponse.json(diagnostic)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[sentinel-diagnostic] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/sentinel-diagnostic')
