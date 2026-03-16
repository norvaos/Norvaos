/**
 * Health Service
 *
 * Surfaces system health indicators for admin/support use.
 * Always scoped to tenantId — never returns cross-tenant data.
 * Health checks never throw — they return degraded status on error.
 *
 * Team 3 / Module 4 — Support and Implementation Tooling
 */

import { createClient } from '@supabase/supabase-js'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'down'
export type EmailConnectionStatus = 'connected' | 'disconnected' | 'error'

export interface SystemHealthStatus {
  database: HealthStatus
  email: EmailConnectionStatus
  jobQueue: HealthStatus
  lastChecked: string // ISO
  details: Record<string, unknown>
}

export interface JobQueueStatus {
  pendingCount: number
  stalledCount: number // pending > 1 hour
  status: HealthStatus
  lastChecked: string
}

export interface IntegrationStatusMap {
  email: { connected: boolean; provider?: string; lastSyncAt?: string }
  onedrive: { connected: boolean; lastSyncAt?: string }
  [key: string]: { connected: boolean; [k: string]: unknown }
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Database Health ──────────────────────────────────────────────────────────

async function checkDatabaseHealth(tenantId: string): Promise<HealthStatus> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .limit(1)

    if (error) {
      log.warn('health.database.degraded', { tenant_id: tenantId, error_message: error.message })
      return 'degraded'
    }
    return 'healthy'
  } catch (err) {
    log.error('health.database.down', {
      tenant_id: tenantId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return 'down'
  }
}

// ─── Job Queue Health ─────────────────────────────────────────────────────────

export async function getJobQueueStatus(tenantId: string): Promise<JobQueueStatus> {
  const lastChecked = new Date().toISOString()

  try {
    const supabase = getAdminClient()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count: pendingCount, error: pendingErr } = await supabase
      .from('job_runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')

    const { count: stalledCount, error: stalledErr } = await supabase
      .from('job_runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo)

    if (pendingErr || stalledErr) {
      return { pendingCount: 0, stalledCount: 0, status: 'degraded', lastChecked }
    }

    const stalled = stalledCount ?? 0
    const pending = pendingCount ?? 0

    const status: HealthStatus = stalled > 10 ? 'down' : stalled > 0 ? 'degraded' : 'healthy'

    log.debug('health.job_queue', {
      tenant_id: tenantId,
      pending_count: pending,
      stalled_count: stalled,
      status,
    })

    return { pendingCount: pending, stalledCount: stalled, status, lastChecked }
  } catch (err) {
    log.error('health.job_queue.error', {
      tenant_id: tenantId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return { pendingCount: 0, stalledCount: 0, status: 'degraded', lastChecked }
  }
}

// ─── Integration Status ───────────────────────────────────────────────────────

export async function getIntegrationStatus(tenantId: string): Promise<IntegrationStatusMap> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('platform_connections')
      .select('platform, status, synced_at')
      .eq('tenant_id', tenantId)

    if (error || !data) {
      return { email: { connected: false }, onedrive: { connected: false } }
    }

    const result: IntegrationStatusMap = {
      email: { connected: false },
      onedrive: { connected: false },
    }

    for (const conn of data) {
      const platform = conn.platform as string
      if (platform === 'microsoft' || platform === 'microsoft_365') {
        result.email = {
          connected: conn.status === 'connected',
          provider: 'Microsoft 365',
          lastSyncAt: (conn as Record<string, unknown>).synced_at as string | undefined,
        }
      } else if (platform === 'onedrive') {
        result.onedrive = {
          connected: conn.status === 'connected',
          lastSyncAt: (conn as Record<string, unknown>).synced_at as string | undefined,
        }
      }
    }

    return result
  } catch (err) {
    log.error('health.integrations.error', {
      tenant_id: tenantId,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return { email: { connected: false }, onedrive: { connected: false } }
  }
}

// ─── Composite Health ─────────────────────────────────────────────────────────

/**
 * Return full system health for a tenant.
 *
 * Never throws — returns degraded/down status on error.
 * All checks are scoped to tenantId.
 */
export async function getSystemHealth(tenantId: string): Promise<SystemHealthStatus> {
  log.info('health.check_requested', { tenant_id: tenantId })

  const [dbStatus, jobQueue, integrations] = await Promise.all([
    checkDatabaseHealth(tenantId),
    getJobQueueStatus(tenantId),
    getIntegrationStatus(tenantId),
  ])

  const status: SystemHealthStatus = {
    database: dbStatus,
    email: integrations.email.connected ? 'connected' : 'disconnected',
    jobQueue: jobQueue.status,
    lastChecked: new Date().toISOString(),
    details: {
      jobQueue,
      integrations,
    },
  }

  log.info('health.check_complete', {
    tenant_id: tenantId,
    database: dbStatus,
    email: status.email,
    job_queue: jobQueue.status,
  })

  return status
}
