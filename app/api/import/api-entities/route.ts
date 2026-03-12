import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { getApiEntities } from '@/lib/services/import/api-import-engine'
import { getAdapter } from '@/lib/services/import/adapters'
import type { SourcePlatform } from '@/lib/services/import/types'

/**
 * GET /api/import/api-entities?platform=ghl|clio
 *
 * Lists available entity types for API import from a connected platform.
 * Returns entity info + whether the platform is connected.
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')

    if (!platform || !['ghl', 'clio'].includes(platform)) {
      return NextResponse.json({ error: 'Platform must be "ghl" or "clio".' }, { status: 400 })
    }

    // Check connection
    const { data: connection } = await admin
      .from('platform_connections')
      .select('id, is_active, platform_user_name')
      .eq('tenant_id', auth.tenantId)
      .eq('platform', platform)
      .single()

    const isConnected = !!connection?.is_active

    // Get available entities
    const entityTypes = getApiEntities(platform as SourcePlatform)
    const adapter = getAdapter(platform as SourcePlatform)

    const entities = entityTypes.map((et) => {
      const entityAdapter = adapter.getEntityAdapter(et)
      return {
        entityType: et,
        displayName: entityAdapter?.displayName ?? et,
        sourceDisplayName: entityAdapter?.sourceDisplayName ?? et,
        description: entityAdapter?.description ?? '',
        dependsOn: entityAdapter?.dependsOn ?? [],
        targetTable: entityAdapter?.targetTable ?? '',
      }
    })

    return NextResponse.json({
      platform,
      isConnected,
      connectionUser: connection?.platform_user_name ?? null,
      entities,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/import/api-entities')
