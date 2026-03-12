/**
 * POST /api/document-engine/seed — Seed default templates for the current tenant
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultTemplates } from '@/lib/services/document-engine/seed-templates'

export async function POST() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'document_templates', 'create')

    const adminClient = createAdminClient()
    const result = await seedDefaultTemplates(adminClient, auth.tenantId, auth.userId)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
