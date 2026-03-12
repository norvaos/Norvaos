import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'

// ── GET /api/esign/requests/[id] ─────────────────────────────────────────────

async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let auth: Awaited<ReturnType<typeof authenticateRequest>>

  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { supabase, tenantId } = auth

  try {
    const [reqRes, eventsRes] = await Promise.all([
      supabase
        .from('signing_requests' as never)
        .select('*, signing_documents(*)' as never)
        .eq('id' as never, id)
        .eq('tenant_id' as never, tenantId)
        .single(),
      supabase
        .from('signing_events' as never)
        .select('*' as never)
        .eq('signing_request_id' as never, id)
        .eq('tenant_id' as never, tenantId)
        .order('created_at' as never, { ascending: true }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqData = reqRes as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventsData = eventsRes as any

    if (reqData.error || !reqData.data) {
      return NextResponse.json(
        { error: 'Signing request not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      request: reqData.data,
      events: eventsData.data ?? [],
    })
  } catch (error) {
    console.error('E-sign request detail error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = handleGet
