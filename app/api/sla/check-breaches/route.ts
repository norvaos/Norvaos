import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBreaches } from '@/lib/services/sla-engine'
import { computeNextAction } from '@/lib/services/next-action-engine'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function POST(request: Request) {
  // Validate shared secret
  const authHeader = request.headers.get('x-cron-secret')
  if (!authHeader || authHeader !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all tenants
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')
    .eq('is_active', true)

  const results: Record<string, unknown> = {}
  for (const tenant of (tenants ?? [])) {
    const breachResult = await checkBreaches(supabase, tenant.id)
    results[tenant.id] = breachResult

    // For each newly-breached matter, recompute its next action so Zone C
    // immediately surfaces the SLA breach escalation.
    const breachedSlaIds: string[] = breachResult.breached ?? []
    if (breachedSlaIds.length > 0) {
      // Fetch distinct matter_ids for the breached SLA rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: slaRows } = await (supabase as any)
        .from('matter_sla_tracking')
        .select('matter_id')
        .in('id', breachedSlaIds)

      const distinctMatterIds = [...new Set(
        ((slaRows ?? []) as { matter_id: string }[]).map((r) => r.matter_id)
      )]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseForEngine = supabase as any
      await Promise.allSettled(
        distinctMatterIds.map((mid) =>
          computeNextAction(mid, tenant.id, supabaseForEngine).catch((e: unknown) =>
            console.error(`[check-breaches] Next action recompute failed for matter ${mid}:`, e)
          )
        )
      )
    }
  }

  return NextResponse.json({ success: true, results })
}
