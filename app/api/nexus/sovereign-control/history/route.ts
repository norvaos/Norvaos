/**
 * Global Config History API  -  Directive 078
 *
 * GET /api/nexus/sovereign-control/history
 *   Returns recent global config changes with rollback eligibility.
 */

import { NextResponse } from 'next/server'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const GET = withNexusAdmin(async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/global_config_history?select=id,action,flag,scope,tenants_affected,admin_id,reason,environment,rolled_back_at,rolled_back_by,created_at&order=created_at.desc&limit=50`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    },
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch config history.' }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ data: data ?? [], error: null })
})
