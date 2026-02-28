import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const admin = createAdminClient()

    // 1. Validate token
    const { data: link, error: linkError } = await admin
      .from('portal_links')
      .select('matter_id, is_active, expires_at')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 404 })
    }

    // 2. Try immigration stage history first
    const { data: immData } = await admin
      .from('matter_immigration')
      .select('stage_history, current_stage_id')
      .eq('matter_id', link.matter_id)
      .maybeSingle()

    if (immData?.stage_history && Array.isArray(immData.stage_history) && immData.stage_history.length > 0) {
      return NextResponse.json({
        timeline: immData.stage_history,
        currentStageId: immData.current_stage_id,
      })
    }

    // 3. Fallback to generic matter stage state
    const { data: genericData } = await admin
      .from('matter_stage_state')
      .select('stage_history, current_stage_id')
      .eq('matter_id', link.matter_id)
      .maybeSingle()

    return NextResponse.json({
      timeline: Array.isArray(genericData?.stage_history)
        ? genericData.stage_history
        : [],
      currentStageId: genericData?.current_stage_id ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
