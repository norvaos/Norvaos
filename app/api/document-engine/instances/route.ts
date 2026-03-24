/**
 * GET  /api/document-engine/instances — List instances (filtered by matter/contact/status)
 * POST /api/document-engine/instances — Generate a new document instance
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInstance, listInstances } from '@/lib/services/document-engine'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'document_generation', 'view')

    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId') ?? undefined
    const contactId = searchParams.get('contactId') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const documentFamily = searchParams.get('documentFamily') ?? undefined

    const result = await listInstances(admin, {
      tenantId: auth.tenantId,
      matterId,
      contactId,
      status,
      documentFamily,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, instances: result.data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'document_generation', 'create')

    const body = await request.json()
    const { templateId, matterId, contactId, customValues } = body

    if (!templateId || !matterId) {
      return NextResponse.json(
        { success: false, error: 'templateId and matterId are required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const result = await generateInstance(adminClient, {
      tenantId: auth.tenantId,
      templateId,
      matterId,
      contactId,
      customValues,
      generatedBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, instance: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
