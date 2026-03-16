import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { z } from 'zod'
import type { Database } from '@/lib/types/database'

type PracticeAreaRow = Database['public']['Tables']['practice_areas']['Row']

const createPracticeAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour')
    .optional()
    .default('#6366f1'),
})

/**
 * POST /api/settings/practice-areas
 *
 * Create a new practice area for the authenticated tenant.
 * Requires: settings:edit permission.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const parsed = createPracticeAreaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { name, color } = parsed.data

    const { data, error } = await auth.supabase
      .from('practice_areas')
      .insert({
        tenant_id: auth.tenantId,
        name,
        color,
        is_active: true,
        is_enabled: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A practice area with that name already exists.' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: `Failed to create practice area: ${error.message}` },
        { status: 500 }
      )
    }

    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'practice_area',
      entityId: (data as PracticeAreaRow).id,
      action: 'practice_area_created',
      changes: { name, color },
    })

    return NextResponse.json({ data, error: null }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/practice-areas')
