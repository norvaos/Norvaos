/**
 * GET  /api/document-engine/templates  -  List templates
 * POST /api/document-engine/templates  -  Create template
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { listTemplates, createTemplate } from '@/lib/services/document-engine'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'document_templates', 'view')

    const { searchParams } = new URL(request.url)
    const documentFamily = searchParams.get('documentFamily') ?? undefined
    const status = searchParams.get('status') ?? undefined

    const result = await listTemplates(admin, {
      tenantId: auth.tenantId,
      documentFamily,
      status,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, templates: result.data })
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
    requirePermission(auth, 'document_templates', 'create')

    const body = await request.json()
    const { templateKey, name, description, documentFamily, practiceArea, matterTypeId, jurisdictionCode, languageCode, requiresReview } = body

    if (!templateKey || !name || !documentFamily) {
      return NextResponse.json(
        { success: false, error: 'templateKey, name, and documentFamily are required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const result = await createTemplate(adminClient, {
      tenantId: auth.tenantId,
      templateKey,
      name,
      description,
      documentFamily,
      practiceArea,
      matterTypeId,
      jurisdictionCode,
      languageCode,
      requiresReview,
      createdBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, template: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
