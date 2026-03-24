import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PUT /api/leads/[id]/milestones
 *
 * Update a milestone task status (complete or skip).
 * Validates task belongs to the lead and tenant.
 *
 * Body: { taskId: string, action: 'complete' | 'skip', skipReason?: string }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'leads', 'update')

    const body = await request.json()
    const { taskId, action, skipReason } = body as {
      taskId: string
      action: 'complete' | 'skip'
      skipReason?: string
    }

    if (!taskId || !action || !['complete', 'skip'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'taskId and action (complete|skip) are required' },
        { status: 400 }
      )
    }

    // Verify lead belongs to tenant
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id, tenant_id, is_closed, current_stage')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    // Verify task belongs to this lead
    const { data: task, error: taskError } = await admin
      .from('lead_milestone_tasks')
      .select('id, lead_id, status, milestone_group_id')
      .eq('id', taskId)
      .eq('lead_id', leadId)
      .single()

    if (taskError || !task) {
      return NextResponse.json(
        { success: false, error: 'Task not found or does not belong to this lead' },
        { status: 404 }
      )
    }

    if (task.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Task is already ${task.status} and cannot be updated` },
        { status: 400 }
      )
    }

    // Update the task
    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = action === 'complete'
      ? {
          status: 'completed',
          completed_at: now,
          completion_source: 'manual',
        }
      : {
          status: 'skipped',
          skip_reason: skipReason || null,
        }

    const { error: updateError } = await admin
      .from('lead_milestone_tasks')
      .update(updateData)
      .eq('id', taskId)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Failed to update task: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Recalculate group completion percentage
    const { data: groupTasks } = await admin
      .from('lead_milestone_tasks')
      .select('id, status')
      .eq('milestone_group_id', task.milestone_group_id)

    if (groupTasks && groupTasks.length > 0) {
      const total = groupTasks.length
      const completed = groupTasks.filter((t) => t.status === 'completed').length
      const percent = Math.round((completed / total) * 100)
      const allDone = groupTasks.every((t) => t.status === 'completed' || t.status === 'skipped')

      await admin
        .from('lead_milestone_groups')
        .update({
          completion_percent: percent,
          status: allDone ? 'completed' : 'active',
        })
        .eq('id', task.milestone_group_id)
    }

    // Log activity
    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      activity_type: action === 'complete' ? 'task_completed' : 'task_skipped',
      title: action === 'complete' ? 'Milestone task completed' : 'Milestone task skipped',
      description: `Task ${taskId} was ${action === 'complete' ? 'completed manually' : 'skipped'}${skipReason ? `: ${skipReason}` : ''}`,
      entity_type: 'lead',
      entity_id: leadId,
      user_id: auth.userId,
      metadata: {
        task_id: taskId,
        action,
        skip_reason: skipReason || null,
        milestone_group_id: task.milestone_group_id,
      },
    })

    return NextResponse.json({
      success: true,
      taskId,
      action,
      updatedAt: now,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[PUT /api/leads/[id]/milestones]', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const admin = createAdminClient()