import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

// 30 requests per minute per IP  -  prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

interface StageHistoryEntry {
  stage_id?: string
  stage_name?: string
  entered_at?: string
  exited_at?: string
  [key: string]: unknown
}

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // 2. Try immigration stage history first
    const { data: immData } = await admin
      .from('matter_immigration')
      .select('stage_history, current_stage_id')
      .eq('matter_id', link.matter_id)
      .maybeSingle()

    if (immData?.stage_history && Array.isArray(immData.stage_history) && immData.stage_history.length > 0) {
      // Resolve client_label for immigration case stages
      const resolved = await resolveClientLabels(
        admin,
        immData.stage_history as StageHistoryEntry[],
        'case_stage_definitions'
      )
      return NextResponse.json({
        timeline: resolved,
        currentStageId: immData.current_stage_id,
      })
    }

    // 3. Fallback to generic matter stage state
    const { data: genericData } = await admin
      .from('matter_stage_state')
      .select('stage_history, current_stage_id')
      .eq('matter_id', link.matter_id)
      .maybeSingle()

    const history = Array.isArray(genericData?.stage_history)
      ? genericData.stage_history as StageHistoryEntry[]
      : []

    // Resolve client_label for generic pipeline stages
    if (history.length > 0) {
      const resolved = await resolveClientLabels(admin, history, 'matter_stages')
      return NextResponse.json({
        timeline: resolved,
        currentStageId: genericData?.current_stage_id ?? null,
      })
    }

    // 4. Final fallback: build synthetic timeline from matter status
    const { data: matterData } = await admin
      .from('matters')
      .select('status, created_at')
      .eq('id', link.matter_id)
      .single()

    if (matterData?.status) {
      // Format status for display: 'active' → 'Active', 'in_progress' → 'In Progress'
      const statusLabel = matterData.status
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())

      return NextResponse.json({
        timeline: [{
          stage_name: statusLabel,
          entered_at: matterData.created_at,
        }],
        currentStageId: null,
      })
    }

    return NextResponse.json({ timeline: [], currentStageId: null })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Resolve stage_name → client_label for each history entry.
 * Uses client_label if set, otherwise falls back to the original stage_name.
 */
async function resolveClientLabels(
  admin: ReturnType<typeof createAdminClient>,
  history: StageHistoryEntry[],
  table: 'matter_stages' | 'case_stage_definitions'
): Promise<StageHistoryEntry[]> {
  if (history.length === 0) return history

  // Collect unique stage IDs to look up
  const stageIds = [...new Set(
    history
      .map((e) => e.stage_id)
      .filter((id): id is string => !!id)
  )]

  if (stageIds.length === 0) return history

  // Fetch client_label + name for these stages
  const { data: stages } = await admin
    .from(table)
    .select('id, name, client_label')
    .in('id', stageIds)

  if (!stages || stages.length === 0) return history

  const labelMap = new Map<string, string>()
  for (const s of stages) {
    labelMap.set(s.id, s.client_label || s.name)
  }

  // Replace stage_name with resolved label
  return history.map((entry) => ({
    ...entry,
    stage_name: entry.stage_id
      ? labelMap.get(entry.stage_id) ?? entry.stage_name
      : entry.stage_name,
  }))
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/timeline')
