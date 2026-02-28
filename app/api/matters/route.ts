import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { activateWorkflowKit, activateImmigrationKit } from '@/lib/services/kit-activation'

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
export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const auth = await authenticateRequest()

    // 2. Parse body
    const body = await request.json()
    const {
      title,
      practice_area_id,
      matter_type_id,
      case_type_id,
      responsible_lawyer_id,
      originating_lawyer_id,
      billing_type,
      hourly_rate,
      estimated_value,
      priority,
      description,
      pipeline_id,
      stage_id,
    } = body as {
      title?: string
      practice_area_id?: string
      matter_type_id?: string
      case_type_id?: string
      responsible_lawyer_id?: string
      originating_lawyer_id?: string
      billing_type?: string
      hourly_rate?: number
      estimated_value?: number
      priority?: string
      description?: string
      pipeline_id?: string
      stage_id?: string
    }

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      )
    }

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
        billing_type: billing_type || 'flat_fee',
        hourly_rate: hourly_rate ?? null,
        estimated_value: estimated_value ?? null,
        priority: priority || 'medium',
        status: 'active',
        date_opened: new Date().toISOString().split('T')[0],
        pipeline_id: pipeline_id || null,
        stage_id: stage_id || null,
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

    // 5. Log activity
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
