/**
 * GET    /api/document-engine/templates/[id]  -  Get template with version details
 * PATCH  /api/document-engine/templates/[id]  -  Update template metadata
 * DELETE /api/document-engine/templates/[id]  -  Soft-delete template (empty drafts only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getTemplateWithVersion,
  deleteTemplate,
  createTemplateVersion,
  publishVersion,
  cloneTemplate,
  archiveTemplate,
} from '@/lib/services/document-engine'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'document_templates', 'view')
    const { id } = await params

    const adminRead = createAdminClient()
    const result = await getTemplateWithVersion(adminRead, {
      tenantId: auth.tenantId,
      templateId: id,
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
    requirePermission(auth, 'document_templates', 'edit')
    const { id } = await params
    const body = await request.json()

    const adminClient = createAdminClient()

    // Handle action-based PATCH operations
    if (body.action) {
      switch (body.action) {
        case 'create_version': {
          const result = await createTemplateVersion(adminClient, {
            tenantId: auth.tenantId,
            templateId: id,
            templateBody: body.templateBody,
            versionLabel: body.versionLabel,
            changeSummary: body.changeSummary,
            mappings: body.mappings ?? [],
            conditions: body.conditions ?? [],
            clauseAssignments: body.clauseAssignments ?? [],
            createdBy: auth.userId,
          })
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 })
          }
          return NextResponse.json({ success: true, version: result.data })
        }

        case 'publish': {
          if (!body.versionId) {
            return NextResponse.json({ success: false, error: 'versionId is required' }, { status: 400 })
          }
          const result = await publishVersion(adminClient, {
            tenantId: auth.tenantId,
            templateId: id,
            versionId: body.versionId,
            publishedBy: auth.userId,
          })
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 })
          }
          return NextResponse.json({ success: true })
        }

        case 'clone': {
          if (!body.newTemplateKey || !body.newName) {
            return NextResponse.json({ success: false, error: 'newTemplateKey and newName are required' }, { status: 400 })
          }
          const result = await cloneTemplate(adminClient, {
            tenantId: auth.tenantId,
            sourceTemplateId: id,
            newTemplateKey: body.newTemplateKey,
            newName: body.newName,
            clonedBy: auth.userId,
          })
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 })
          }
          return NextResponse.json({ success: true, template: result.data }, { status: 201 })
        }

        case 'archive': {
          const result = await archiveTemplate(adminClient, {
            tenantId: auth.tenantId,
            templateId: id,
            archivedBy: auth.userId,
          })
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 })
          }
          return NextResponse.json({ success: true })
        }

        default:
          return NextResponse.json({ success: false, error: `Unknown action: ${body.action}` }, { status: 400 })
      }
    }

    // Standard metadata update
    const { name, description, requiresReview } = body
    const updateData: Partial<{
      name: string
      description: string | null
      requires_review: boolean
      updated_by: string
    }> = { updated_by: auth.userId }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (requiresReview !== undefined) updateData.requires_review = requiresReview

    const { error } = await adminClient
      .from('docgen_templates')
      .update(updateData as never)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'document_templates', 'delete')
    const { id } = await params

    const adminClient = createAdminClient()
    const result = await deleteTemplate(adminClient, {
      tenantId: auth.tenantId,
      templateId: id,
      deletedBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
