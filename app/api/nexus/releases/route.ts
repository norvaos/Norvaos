/**
 * Directive 079: Atomic Release Architecture  -  Release Management API
 *
 * GET  /api/nexus/releases  -  Current version + deploy history + migration status
 * POST /api/nexus/releases  -  Record a new deploy (called by CI or manually)
 *
 * Protected by withNexusAdmin  -  platform admins only.
 */

import { NextResponse } from 'next/server'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVersionInfo, APP_VERSION, BUILD_SHA, BUILD_TIME } from '@/lib/config/version'

// ── GET: Release Dashboard Data ─────────────────────────────────────────────

export const GET = withNexusAdmin(async () => {
  const admin = createAdminClient()

  // 1. Current version info (from build constants)
  const versionInfo = getVersionInfo()

  // 2. Recent deploys (last 25)
  const { data: releases } = await (admin as any)
    .from('_release_log')
    .select('*')
    .order('deployed_at', { ascending: false })
    .limit(25)

  // 3. Current active release (latest healthy production deploy)
  const { data: activeRelease } = await (admin as any)
    .from('_release_log')
    .select('*')
    .eq('environment', 'production')
    .eq('status', 'healthy')
    .order('deployed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 4. Migration status  -  total applied + last 10
  const { data: migrationStatus } = await (admin as any)
    .from('_migrations')
    .select('name, applied_at')
    .order('applied_at', { ascending: false })
    .limit(10)

  const { count: totalMigrations } = await (admin as any)
    .from('_migrations')
    .select('id', { count: 'exact', head: true })

  // 5. Migration guard log  -  any blocked migrations
  const { data: blockedMigrations } = await (admin as any)
    .from('_migration_guard_log')
    .select('*')
    .eq('allowed', false)
    .order('checked_at', { ascending: false })
    .limit(10)

  // 6. Deploy slot info from env
  const deploySlot = process.env.NEXT_PUBLIC_DEPLOY_SLOT || 'unknown'
  const deployEnv = process.env.NEXT_PUBLIC_DEPLOY_ENV || process.env.NODE_ENV

  return NextResponse.json({
    data: {
      current: {
        ...versionInfo,
        buildSha: BUILD_SHA,
        buildTime: BUILD_TIME,
        deploySlot,
        deployEnv,
      },
      activeRelease: activeRelease || null,
      releases: releases || [],
      migrations: {
        total: totalMigrations || 0,
        recent: migrationStatus || [],
      },
      blockedMigrations: blockedMigrations || [],
    },
  })
})

// ── POST: Record a new deploy ───────────────────────────────────────────────

export const POST = withNexusAdmin(async (request) => {
  const body = await request.json()
  const {
    version,
    buildSha,
    environment = 'production',
    deploySlot = 'blue',
    deploySource = 'manual',
    dockerTag,
    netlifyDeployId,
    migrationsApplied = 0,
    migrationNames = [],
    notes,
  } = body as {
    version: string
    buildSha: string
    environment?: string
    deploySlot?: string
    deploySource?: string
    dockerTag?: string
    netlifyDeployId?: string
    migrationsApplied?: number
    migrationNames?: string[]
    notes?: string
  }

  if (!version || !buildSha) {
    return NextResponse.json(
      { error: 'version and buildSha are required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: release, error } = await (admin as any)
    .from('_release_log')
    .insert({
      version,
      build_sha: buildSha,
      environment,
      deploy_slot: deploySlot,
      deploy_source: deploySource,
      docker_tag: dockerTag || `norva-${version}-${buildSha.slice(0, 7)}`,
      netlify_deploy_id: netlifyDeployId,
      migrations_applied: migrationsApplied,
      migration_names: migrationNames,
      notes,
      triggered_by: 'platform-admin',
      status: 'deploying',
    })
    .select('id, version, build_sha, status')
    .single()

  if (error) {
    console.error('[releases] Insert error:', error)
    return NextResponse.json({ error: 'Failed to record release' }, { status: 500 })
  }

  return NextResponse.json({ data: release })
})
