import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'

const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Token Validation ──────────────────────────────────────────────────────

async function validateToken(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, contact_id, expires_at, is_active')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 404 }) }
  }

  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Link expired' }, { status: 410 }) }
  }

  return { link }
}

// ── GET /api/portal/[token]/tasks ─────────────────────────────────────────

/**
 * Fetch client-visible tasks for the matter associated with this portal link.
 * Read-only — clients cannot modify tasks.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params
    const admin = createAdminClient()
    const result = await validateToken(admin, token)
    if (result.error) return result.error

    const { link } = result

    // Fetch tasks visible to client for this matter
    const { data: tasks, error } = await admin
      .from('tasks')
      .select('id, title, description, status, priority, due_date, category, task_type, created_at')
      .eq('matter_id', link.matter_id)
      .eq('is_deleted', false)
      .in('category', ['client_facing'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ tasks: tasks ?? [] })
  } catch (err) {
    console.error('[Portal Tasks] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/portal/[token]/tasks ──────────────────────────────────────

/**
 * Update a client-facing task status.
 * Allowed transitions: todo → in_progress, in_progress → completed, todo → completed.
 */
async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params
    const admin = createAdminClient()
    const result = await validateToken(admin, token)
    if (result.error) return result.error

    const { link } = result

    const body = await request.json()
    const { task_id, status } = body as { task_id?: string; status?: string }

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status are required' }, { status: 400 })
    }

    const VALID_STATUSES = ['todo', 'in_progress', 'completed']
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Verify task belongs to this matter and is client_facing
    const { data: task, error: taskError } = await admin
      .from('tasks')
      .select('id, status, matter_id, category')
      .eq('id', task_id)
      .eq('matter_id', link.matter_id)
      .eq('is_deleted', false)
      .in('category', ['client_facing'])
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Update task status
    const updateData: Record<string, unknown> = { status }
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error: updateError } = await admin
      .from('tasks')
      .update(updateData)
      .eq('id', task_id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, task_id, status })
  } catch (err) {
    console.error('[Portal Tasks PATCH] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export { handleGet as GET, handlePatch as PATCH }
