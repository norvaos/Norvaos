/**
 * Sentinel Pulse — Directive 023
 *
 * Daily scan that detects expiring documents at 180, 90, and 30 day
 * thresholds and creates prospect_triggers for the retention pipeline.
 * The "vault that never sleeps."
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertProspectTrigger } from '@/lib/services/shadow-matter'

export const SENTINEL_THRESHOLDS = [180, 90, 30] as const

export interface SentinelPulseStats {
  tenantId: string
  scanned: number
  triggersCreated: number
  triggersUpdated: number
  errors: number
}

export async function runSentinelPulse(
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<SentinelPulseStats> {
  const stats: SentinelPulseStats = {
    tenantId,
    scanned: 0,
    triggersCreated: 0,
    triggersUpdated: 0,
    errors: 0,
  }

  console.log(`[sentinel-pulse] Starting scan for tenant ${tenantId}`)

  // Fetch all active status records with expiry dates
  const { data: records, error } = await supabase
    .from('contact_status_records')
    .select('id, contact_id, status_type, expiry_date, matter_id')
    .eq('tenant_id', tenantId)
    .not('expiry_date', 'is', null)

  if (error) {
    console.error('[sentinel-pulse] Query error:', error)
    return stats
  }

  if (!records || records.length === 0) {
    console.log('[sentinel-pulse] No records with expiry dates found')
    return stats
  }

  stats.scanned = records.length
  const now = Date.now()

  for (const record of records) {
    const expiryMs = new Date(record.expiry_date).getTime()
    const daysUntilExpiry = Math.ceil((expiryMs - now) / (1000 * 60 * 60 * 24))

    // Check if days until expiry falls within any threshold window (±1 day tolerance)
    const matchedThreshold = SENTINEL_THRESHOLDS.find(
      (t) => Math.abs(daysUntilExpiry - t) <= 1
    )

    if (matchedThreshold && daysUntilExpiry > 0) {
      try {
        const result = await upsertProspectTrigger({
          tenantId,
          contactId: record.contact_id,
          documentType: record.status_type,
          expiryDate: record.expiry_date,
          sourceMatterId: record.matter_id ?? undefined,
        })

        if (result.success) {
          stats.triggersCreated++
        }
      } catch (err) {
        console.error(`[sentinel-pulse] Error creating trigger for ${record.contact_id}:`, err)
        stats.errors++
      }
    }
  }

  console.log(`[sentinel-pulse] Complete: ${stats.scanned} scanned, ${stats.triggersCreated} triggers created/updated`)
  return stats
}
