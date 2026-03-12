/**
 * POST /api/document-engine/preview-fields — Preview resolved fields without generating
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplateWithVersion, resolveFields, buildFieldMap, findMissingRequiredFields } from '@/lib/services/document-engine'
import { evaluateConditionsDetailed } from '@/lib/services/document-engine/condition-evaluator'

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'document_generation', 'view')

    const body = await request.json()
    const { templateId, matterId, contactId, customValues } = body

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'templateId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Get template
    const templateResult = await getTemplateWithVersion(auth.supabase, {
      tenantId: auth.tenantId,
      templateId,
    })

    if (!templateResult.success || !templateResult.data) {
      return NextResponse.json({ success: false, error: templateResult.error }, { status: 404 })
    }

    const { mappings, conditions } = templateResult.data

    // Build field context (simplified — matter + contact data)
    const matterResult = matterId
      ? await adminClient.from('matters').select('*').eq('id', matterId).single()
      : { data: null }

    const contactResult = contactId
      ? await adminClient.from('contacts').select('*').eq('id', contactId).single()
      : { data: null }

    const tenantResult = await adminClient.from('tenants').select('*').eq('id', auth.tenantId).single()

    const fieldContext = {
      matter: (matterResult.data ?? {}) as Record<string, unknown>,
      contact: (contactResult.data ?? {}) as Record<string, unknown>,
      billing: (matterResult.data ?? {}) as Record<string, unknown>,
      tenant: (tenantResult.data ?? {}) as Record<string, unknown>,
      lawyer: {} as Record<string, unknown>,
      customValues: customValues ?? {},
    }

    // Resolve fields
    const resolved = resolveFields(mappings, fieldContext)
    const fieldMap = buildFieldMap(resolved)
    const missing = findMissingRequiredFields(mappings, resolved)
    const conditionEvaluations = evaluateConditionsDetailed(conditions, fieldMap)

    return NextResponse.json({
      success: true,
      resolvedFields: resolved,
      missingRequired: missing,
      conditionEvaluations,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
