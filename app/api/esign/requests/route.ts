import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'

// ── GET /api/esign/requests?matterId=...&leadId=... ──────────────────────────

async function handleGet(request: Request) {
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

  requirePermission(auth, 'documents', 'view')

  const { supabase, tenantId } = auth

  try {
    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId')
    const leadId = searchParams.get('leadId')

    if (!matterId && !leadId) {
      return NextResponse.json(
        { error: 'matterId or leadId query parameter is required' },
        { status: 400 },
      )
    }

    let query = supabase
      .from('signing_requests' as never)
      .select('*, signing_documents(*)' as never)
      .eq('tenant_id' as never, tenantId)

    if (matterId) {
      query = query.eq('matter_id' as never, matterId)
    } else {
      query = query.eq('lead_id' as never, leadId!)
    }

    const { data, error } = await query
      .order('created_at' as never, { ascending: false })

    if (error) {
      console.error('E-sign requests fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch signing requests' },
        { status: 500 },
      )
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('E-sign requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const GET = handleGet
