/**
 * Onboarding Tracker
 *
 * Tracks implementation progress per tenant using the `tenant_onboarding` DB table.
 * Replaces the previous file-based storage at /data/onboarding/{tenantId}.json.
 *
 * All functions require a service-role Supabase client  -  the table's RLS policy
 * restricts user-context reads to same-tenant rows; writes are performed via the
 * service-role client which bypasses RLS.
 *
 * Team 3 / Priority 2  -  DB-backed onboarding tracker
 * Migration: scripts/migrations/110-tenant-onboarding.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingPhase =
  | 'account_creation'
  | 'configuration'
  | 'user_setup'
  | 'integration_setup'
  | 'data_migration'
  | 'training'
  | 'go_live_verification'

export type OnboardingStatus = 'pending' | 'in_progress' | 'complete' | 'skipped'

export interface OnboardingPhaseRecord {
  phase: OnboardingPhase
  status: OnboardingStatus
  notes: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface TenantOnboardingStatus {
  tenantId: string
  phases: OnboardingPhaseRecord[]
  overallStatus: 'not_started' | 'in_progress' | 'complete'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDERED_PHASES: OnboardingPhase[] = [
  'account_creation',
  'configuration',
  'user_setup',
  'integration_setup',
  'data_migration',
  'training',
  'go_live_verification',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeOverallStatus(phases: OnboardingPhaseRecord[]): TenantOnboardingStatus['overallStatus'] {
  const active = phases.filter((p) => p.status !== 'skipped')
  if (active.length === 0) return 'not_started'
  if (active.every((p) => p.status === 'complete')) return 'complete'
  if (active.some((p) => p.status === 'in_progress' || p.status === 'complete')) return 'in_progress'
  return 'not_started'
}

function rowToPhaseRecord(row: Database['public']['Tables']['tenant_onboarding']['Row']): OnboardingPhaseRecord {
  return {
    phase: row.phase as OnboardingPhase,
    status: row.status as OnboardingStatus,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

function defaultPhasesForTenant(): OnboardingPhaseRecord[] {
  const now = new Date().toISOString()
  return ORDERED_PHASES.map((phase) => ({
    phase,
    status: 'pending' as OnboardingStatus,
    notes: null,
    updatedAt: now,
    updatedBy: null,
  }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise onboarding rows for a new tenant.
 * Inserts all 7 phases with status 'pending'. Safe to call if rows already exist
 * (upsert with ignoreDuplicates  -  existing rows are not overwritten).
 */
export async function initOnboardingRecord(
  tenantId: string,
  admin: SupabaseClient<Database>,
): Promise<TenantOnboardingStatus> {
  const now = new Date().toISOString()

  const rows = ORDERED_PHASES.map((phase) => ({
    tenant_id: tenantId,
    phase,
    status: 'pending' as const,
    updated_at: now,
  }))

  const { error } = await admin
    .from('tenant_onboarding')
    .upsert(rows, { onConflict: 'tenant_id,phase', ignoreDuplicates: true })

  if (error) {
    log.error('onboarding.init_error', { tenant_id: tenantId, error_message: error.message })
    throw new Error(`Failed to initialise onboarding record: ${error.message}`)
  }

  log.info('onboarding.record_initialised', { tenant_id: tenantId })

  return getOnboardingStatus(tenantId, admin)
}

/**
 * Read onboarding status for a tenant.
 * Returns synthetic 'not_started' record if no rows exist yet.
 */
export async function getOnboardingStatus(
  tenantId: string,
  admin: SupabaseClient<Database>,
): Promise<TenantOnboardingStatus> {
  const { data, error } = await admin
    .from('tenant_onboarding')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('phase')

  if (error) {
    log.error('onboarding.read_error', { tenant_id: tenantId, error_message: error.message })
    throw new Error(`Failed to read onboarding status: ${error.message}`)
  }

  if (!data || data.length === 0) {
    const phases = defaultPhasesForTenant()
    return { tenantId, phases, overallStatus: 'not_started' }
  }

  // Return phases in canonical order regardless of DB row order
  const rowMap = new Map(data.map((r) => [r.phase, r]))
  const phases = ORDERED_PHASES.map((phase) => {
    const row = rowMap.get(phase)
    if (row) return rowToPhaseRecord(row)
    // Phase row missing  -  treat as pending
    return {
      phase,
      status: 'pending' as OnboardingStatus,
      notes: null,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    }
  })

  return { tenantId, phases, overallStatus: computeOverallStatus(phases) }
}

/**
 * Update the status of a single phase for a tenant.
 * Upserts the row and returns the full updated status.
 */
export async function updatePhaseStatus(
  tenantId: string,
  phase: OnboardingPhase,
  status: OnboardingStatus,
  admin: SupabaseClient<Database>,
  options: { notes?: string; updatedBy?: string } = {},
): Promise<TenantOnboardingStatus> {
  const { error } = await admin
    .from('tenant_onboarding')
    .upsert(
      {
        tenant_id: tenantId,
        phase,
        status,
        notes: options.notes ?? null,
        updated_at: new Date().toISOString(),
        updated_by: options.updatedBy ?? null,
      },
      { onConflict: 'tenant_id,phase' },
    )

  if (error) {
    log.error('onboarding.update_error', {
      tenant_id: tenantId,
      phase,
      status,
      error_message: error.message,
    })
    throw new Error(`Failed to update onboarding phase: ${error.message}`)
  }

  const updated = await getOnboardingStatus(tenantId, admin)

  log.info('onboarding.phase_updated', {
    tenant_id: tenantId,
    phase,
    status,
    overall_status: updated.overallStatus,
  })

  return updated
}
