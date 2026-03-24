import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { withTiming } from '@/lib/middleware/request-timing'
import { assembleAutomationPayload } from '@/lib/services/automation-payload'

/**
 * GET /api/matters/[id]/automation-payload
 *
 * Returns a flat JSON payload of all READY intake data and signed URLs
 * for approved documents, designed for the Norva-Bridge Chrome Extension
 * to autofill the IRCC portal.
 *
 * Gating:
 *   - Intake must be locked (intake_status = 'locked')
 *   - Intake must be 100% complete
 *
 * Permission: matters:read
 */
/** Build CORS headers if the request comes from the Chrome extension. */
function extensionCors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  if (origin.startsWith('chrome-extension://')) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    }
  }
  return {}
}

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = extensionCors(request)

  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'read')

    const result = await assembleAutomationPayload(
      auth.supabase,
      matterId,
      auth.tenantId,
    )

    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error, issues: result.issues },
        { status: result.status, headers: cors }
      )
    }

    // Audit log
    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter',
      entityId: matterId,
      action: 'automation_payload_generated',
      metadata: {
        documentCount: result.payload.documents.length,
        formPackCount: result.payload.formPacks.length,
        payloadVersion: result.payload.meta.payloadVersion,
      },
    })

    return NextResponse.json(
      { success: true, payload: result.payload },
      { headers: cors }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status, headers: cors }
      )
    }
    console.error('Automation payload error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: cors }
    )
  }
}

async function handleOptions(request: Request) {
  const origin = request.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
  if (origin.startsWith('chrome-extension://')) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return new Response(null, { status: 204, headers })
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/automation-payload')
export const OPTIONS = handleOptions
