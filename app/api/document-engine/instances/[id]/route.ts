/**
 * GET   /api/document-engine/instances/[id]  -  Get instance with full details
 * PATCH /api/document-engine/instances/[id]  -  Status transitions & actions
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getInstanceWithDetails,
  regenerateInstance,
  approveInstance,
  sendInstance,
  voidInstance,
  getDownloadUrl,
  createSignatureRequest,
} from '@/lib/services/document-engine'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'document_generation', 'view')
    const { id } = await params

    const { searchParams } = new URL(request.url)

    // Download URL endpoint
    if (searchParams.get('download') === 'true') {
      const result = await getDownloadUrl(admin, {
        tenantId: auth.tenantId,
        instanceId: id,
      })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 404 })
      }
      return NextResponse.json({ success: true, ...result.data })
    }

    const result = await getInstanceWithDetails(admin, {
      tenantId: auth.tenantId,
      instanceId: id,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 404 })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { id } = await params
    const body = await request.json()
    const adminClient = createAdminClient()

    switch (body.action) {
      case 'regenerate': {
        requirePermission(auth, 'document_generation', 'create')
        const result = await regenerateInstance(adminClient, {
          tenantId: auth.tenantId,
          instanceId: id,
          customValues: body.customValues,
          regeneratedBy: auth.userId,
        })
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true, instance: result.data })
      }

      case 'approve': {
        requirePermission(auth, 'document_generation', 'approve')
        const result = await approveInstance(adminClient, {
          tenantId: auth.tenantId,
          instanceId: id,
          approvedBy: auth.userId,
        })
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      case 'send': {
        requirePermission(auth, 'document_generation', 'edit')
        const result = await sendInstance(adminClient, {
          tenantId: auth.tenantId,
          instanceId: id,
          sentBy: auth.userId,
        })
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      case 'void': {
        requirePermission(auth, 'document_generation', 'edit')
        if (!body.reason) {
          return NextResponse.json({ success: false, error: 'reason is required for voiding' }, { status: 400 })
        }
        const result = await voidInstance(adminClient, {
          tenantId: auth.tenantId,
          instanceId: id,
          reason: body.reason,
          voidedBy: auth.userId,
        })
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      case 'create_signature_request': {
        requirePermission(auth, 'document_generation', 'edit')
        if (!body.signers || !Array.isArray(body.signers)) {
          return NextResponse.json({ success: false, error: 'signers array is required' }, { status: 400 })
        }
        const result = await createSignatureRequest(adminClient, {
          tenantId: auth.tenantId,
          instanceId: id,
          signers: body.signers,
          createdBy: auth.userId,
        })
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true, ...result.data }, { status: 201 })
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
