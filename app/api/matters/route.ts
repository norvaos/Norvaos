import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { activateWorkflowKit, activateImmigrationKit } from '@/lib/services/kit-activation'
import { revalidateIntake } from '@/lib/services/intake-revalidate'
import { invalidateMattersList } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureRuleSnapshots } from '@/lib/services/rule-snapshot-engine'
import { z } from 'zod'

const createMatterSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  practice_area_id: z.string().uuid().optional().nullable(),
  matter_type_id: z.string().uuid().optional().nullable(),
  case_type_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  responsible_lawyer_id: z.string().uuid().optional().nullable(),
  originating_lawyer_id: z.string().uuid().optional().nullable(),
  followup_lawyer_id: z.string().uuid().optional().nullable(),
  billing_type: z.enum(['hourly', 'flat_fee', 'contingency', 'retainer', 'hybrid']).default('flat_fee'),
  hourly_rate: z.number().min(0).optional().nullable(),
  estimated_value: z.number().min(0).optional().nullable(),
  fee_template_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  description: z.string().optional().nullable(),
  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  // Matter-type pipeline (sourced from matter_stage_pipelines, not legacy pipelines table)
  matter_stage_pipeline_id: z.string().uuid().optional().nullable(),
  // Initial stage the user selected from the matter type pipeline
  initial_matter_stage_id: z.string().uuid().optional().nullable(),
})

/**
 * POST /api/matters
 *
 * Server-side matter creation with automatic kit activation.
 * If matter_type_id is provided → activates workflow kit (pipeline + tasks).
 * If case_type_id is provided → activates immigration kit (checklist + stages).
 *
 * Body: {
 *   title: string
 *   practice_area_id?: string
 *   matter_type_id?: string
 *   case_type_id?: string
 *   contact_id?: string
 *   responsible_lawyer_id?: string
 *   originating_lawyer_id?: string
 *   billing_type?: string
 *   hourly_rate?: number
 *   estimated_value?: number
 *   priority?: string
 *   description?: string
 *   pipeline_id?: string
 *   stage_id?: string
 * }
 */
async function handlePost(request: Request) {
  try {
    // 1. Authenticate & authorize
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'create')

    // 2. Parse & validate body
    const body = await request.json()
    const parsed = createMatterSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: `Invalid input: ${parsed.error.issues[0]?.message ?? parsed.error.message}` },
        { status: 400 }
      )
    }

    const {
      title,
      practice_area_id,
      matter_type_id,
      case_type_id,
      contact_id,
      responsible_lawyer_id,
      originating_lawyer_id,
      followup_lawyer_id,
      billing_type,
      hourly_rate,
      estimated_value,
      fee_template_id,
      priority,
      description,
      pipeline_id,
      stage_id,
      matter_stage_pipeline_id,
      initial_matter_stage_id,
    } = parsed.data

    // 3. Insert the matter
    const { data: matter, error: insertError } = await auth.supabase
      .from('matters')
      .insert({
        tenant_id: auth.tenantId,
        title: title.trim(),
        description: description || null,
        practice_area_id: practice_area_id || null,
        matter_type_id: matter_type_id || null,
        case_type_id: case_type_id || null,
        responsible_lawyer_id: responsible_lawyer_id || auth.userId,
        originating_lawyer_id: originating_lawyer_id || null,
        followup_lawyer_id: followup_lawyer_id || null,
        billing_type: billing_type || 'flat_fee',
        hourly_rate: hourly_rate ?? null,
        estimated_value: estimated_value ?? null,
        fee_template_id: fee_template_id || null,
        priority: priority || 'medium',
        status: 'active',
        date_opened: new Date().toISOString().split('T')[0],
        pipeline_id: pipeline_id || null,
        stage_id: stage_id || null,
        matter_stage_pipeline_id: matter_stage_pipeline_id || null,
      })
      .select()
      .single()

    if (insertError || !matter) {
      console.error('Matter insert error:', insertError)
      return NextResponse.json(
        { success: false, error: insertError?.message || 'Failed to create matter' },
        { status: 500 }
      )
    }

    // 4. Activate kit based on matter type
    try {
      if (matter_type_id && !case_type_id) {
        // Generic workflow kit (Real Estate, etc.)
        await activateWorkflowKit({
          supabase: auth.supabase,
          tenantId: auth.tenantId,
          matterId: matter.id,
          matterTypeId: matter_type_id,
          userId: auth.userId,
          initialStageId: initial_matter_stage_id ?? undefined,
          initialPipelineId: matter_stage_pipeline_id ?? undefined,
        })
      }

      if (case_type_id) {
        // Immigration kit
        await activateImmigrationKit({
          supabase: auth.supabase,
          tenantId: auth.tenantId,
          matterId: matter.id,
          caseTypeId: case_type_id,
          userId: auth.userId,
        })
      }
    } catch (kitError) {
      // Kit activation failure is non-fatal — matter already created
      console.error('Kit activation error (non-fatal):', kitError)
    }

    // 5. Initialize UEE intake + seed principal applicant
    try {
      // Fetch tenant jurisdiction
      const { data: tenantRow } = await auth.supabase
        .from('tenants')
        .select('jurisdiction_code')
        .eq('id', auth.tenantId)
        .single()

      // Always create matter_intake record
      await auth.supabase.from('matter_intake').insert({
        tenant_id: auth.tenantId,
        matter_id: matter.id,
        intake_status: 'incomplete',
        jurisdiction: tenantRow?.jurisdiction_code ?? 'CA',
      })

      // If a primary contact was selected, seed them as principal applicant (idempotent)
      if (contact_id) {
        // Guard: check if a PA already exists for this matter (prevents duplicates on retry)
        const { data: existingPA } = await auth.supabase
          .from('matter_people')
          .select('id')
          .eq('matter_id', matter.id)
          .eq('person_role', 'principal_applicant')
          .eq('is_active', true)
          .maybeSingle()

        if (!existingPA) {
          const { data: contact } = await auth.supabase
            .from('contacts')
            .select('first_name, last_name, email_primary, phone_primary')
            .eq('id', contact_id)
            .single()

          if (contact) {
            const { data: newPerson } = await auth.supabase
              .from('matter_people')
              .insert({
                tenant_id: auth.tenantId,
                matter_id: matter.id,
                contact_id: contact_id,
                person_role: 'principal_applicant',
                first_name: contact.first_name || '',
                last_name: contact.last_name || '',
                email: contact.email_primary || null,
                phone: contact.phone_primary || null,
              })
              .select('id')
              .single()

            // Carry-forward: snapshot contacts.immigration_data → matter_people.profile_data
            // Non-fatal — if contact has no immigration_data, profile_data starts as {}
            // and staff can populate it in the workbench.
            if (newPerson?.id) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (auth.supabase as any).rpc('snapshot_contact_profile_to_matter', {
                p_matter_person_id: newPerson.id,
                p_contact_id:       contact_id,
                p_tenant_id:        auth.tenantId,
                p_synced_by:        auth.userId,
              }).catch((snapshotErr: unknown) => {
                console.error('Profile carry-forward error (non-fatal):', snapshotErr)
              })
            }
          }
        }
      }

      // Revalidate intake to compute initial completion %, risk, and status
      await revalidateIntake(auth.supabase, matter.id)
    } catch (intakeError) {
      // Intake initialization failure is non-fatal — matter already created
      console.error('Intake initialization error (non-fatal):', intakeError)
    }

    // 6. Log activity
    await auth.supabase.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matter.id,
      activity_type: 'matter_created',
      title: 'Matter created',
      description: `"${matter.title}" was created`,
      entity_type: 'matter',
      entity_id: matter.id,
      user_id: auth.userId,
      metadata: {
        matter_type_id: matter_type_id || null,
        case_type_id: case_type_id || null,
        practice_area_id: practice_area_id || null,
      } as any,
    })

    await invalidateMattersList(auth.tenantId)

    // 7. Fire-and-forget rule snapshot capture — non-blocking
    captureRuleSnapshots(matter.id, auth.tenantId, auth.supabase).catch(
      (e) => console.error('[matters] Rule snapshot capture failed (non-fatal):', e)
    )

    return NextResponse.json({ success: true, matter }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Matter creation error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters')

/**
 * DELETE /api/matters
 * Bulk soft-delete matters by setting is_active = false.
 * Body: { ids: string[] }
 */
async function handleDelete(req: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'delete')

    const body = await req.json()
    const ids: string[] = body?.ids ?? []

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No matter IDs provided' }, { status: 400 })
    }
    if (ids.length > 200) {
      return NextResponse.json({ success: false, error: 'Cannot delete more than 200 matters at once' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('matters')
      .update({ status: 'archived' })
      .in('id', ids)
      .eq('tenant_id', auth.tenantId)

    if (error) throw error

    await invalidateMattersList(auth.tenantId)

    return NextResponse.json({ success: true, deleted: ids.length })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('Matter bulk delete error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const DELETE = withTiming(handleDelete, 'DELETE /api/matters')
