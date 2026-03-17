import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBreaches } from '@/lib/services/sla-engine'

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
    results[tenant.id] = await checkBreaches(supabase, tenant.id)
  }

  return NextResponse.json({ success: true, results })
}
