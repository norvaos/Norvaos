import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClioMigrationEngine } from '@/lib/services/clio-migration-engine'
import { log } from '@/lib/utils/logger'

/**
 * POST /api/integrations/clio/migrate
 *
 * Kicks off the Sovereign Extraction Bridge — a full forensic pull
 * from Clio Manage into the Norva schema.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id, role:user_role')
      .eq('auth_user_id', user.id)
      .single() as { data: { tenant_id: string; role: string | null } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Only admins/owners can trigger migration
    if (!['admin', 'owner'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Find active Clio connection
    const admin = createAdminClient()
    const { data: connection } = await (admin as any)
      .from('clio_connections')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .single()

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Clio connection. Connect Clio first.' },
        { status: 404 }
      )
    }

    // Check for in-progress migration
    const { data: existing } = await (admin as any)
      .from('clio_migrations')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'A migration is already in progress.' },
        { status: 409 }
      )
    }

    // Fire-and-forget: start the migration engine
    const engine = new ClioMigrationEngine(connection.id, profile.tenant_id)

    // Don't await — return immediately so the UI can poll for progress
    void engine.run().catch((err) => {
      log.error('[clio-migrate] Migration failed', {
        tenantId: profile.tenant_id,
        error: err instanceof Error ? err.message : 'Unknown',
      })
    })

    return NextResponse.json({ message: 'Migration started', connectionId: connection.id })
  } catch (err) {
    log.error('[clio-migrate] Error starting migration', {
      error: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start migration' },
      { status: 500 }
    )
  }
}
