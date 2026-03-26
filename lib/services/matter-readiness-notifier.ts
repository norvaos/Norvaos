/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Matter Readiness Notifier  -  Directive 012 "Zero-Noise" Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Replaces per-document upload notifications with a single "Matter Ready
 * for Review" alert that fires ONLY when 100% of required Identity and
 * Financial document slots are accepted/pending_review.
 *
 * Flow:
 *   1. After each document upload, check slot completion by category
 *   2. If all Identity AND Financial required slots are filled → fire alert
 *   3. Otherwise → suppress notification (zero noise)
 *
 * The lawyer sees ONE notification instead of N per-document pings.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { dispatchNotification } from '@/lib/services/notification-engine'
import { log } from '@/lib/utils/logger'

// Categories that must be 100% satisfied before alerting
const REQUIRED_CATEGORIES = ['identity', 'financial'] as const

interface SlotStatus {
  category: string
  total: number
  filled: number       // pending_review + accepted
  accepted: number     // accepted only
  complete: boolean    // filled === total
}

interface ReadinessResult {
  matterId: string
  isReady: boolean
  categories: SlotStatus[]
  message: string
}

/**
 * Check if a matter's Identity and Financial document requirements
 * are fully met after a document upload. If yes, dispatch a single
 * "Matter Ready for Review" notification to the responsible lawyer.
 *
 * Call this from the document upload route INSTEAD of dispatching
 * individual document_uploaded notifications.
 */
export async function checkAndNotifyReadiness(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    matterId: string
    uploadedByUserId?: string
  },
): Promise<ReadinessResult> {
  const { tenantId, matterId } = params

  try {
    // 1. Fetch all required active slots for this matter, grouped by category
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: slots, error } = await (supabase as any)
      .from('document_slots')
      .select('id, slot_name, category, status, is_required, is_active')
      .eq('matter_id', matterId)
      .eq('is_required', true)
      .eq('is_active', true)

    if (error || !slots) {
      log.warn('[readiness-notifier] Failed to fetch slots', {
        matterId,
        error: error?.message,
      })
      return {
        matterId,
        isReady: false,
        categories: [],
        message: 'Could not check readiness: slot query failed',
      }
    }

    // 2. Group slots by category and compute fill status
    const categoryMap = new Map<string, SlotStatus>()

    for (const slot of slots as Array<{
      id: string
      slot_name: string
      category: string | null
      status: string
      is_required: boolean
      is_active: boolean
    }>) {
      const cat = (slot.category ?? 'general').toLowerCase()
      const existing = categoryMap.get(cat) ?? {
        category: cat,
        total: 0,
        filled: 0,
        accepted: 0,
        complete: false,
      }

      existing.total++
      if (slot.status === 'pending_review' || slot.status === 'accepted') {
        existing.filled++
      }
      if (slot.status === 'accepted') {
        existing.accepted++
      }

      categoryMap.set(cat, existing)
    }

    // Mark complete
    for (const status of categoryMap.values()) {
      status.complete = status.total > 0 && status.filled >= status.total
    }

    const categories = Array.from(categoryMap.values())

    // 3. Check if ALL required categories are complete
    const allRequiredMet = REQUIRED_CATEGORIES.every((cat) => {
      const status = categoryMap.get(cat)
      // If a category has no slots, it's considered met (not applicable)
      return !status || status.complete
    })

    const result: ReadinessResult = {
      matterId,
      isReady: allRequiredMet,
      categories,
      message: allRequiredMet
        ? 'All Identity and Financial requirements met  -  ready for review'
        : buildPendingMessage(categoryMap),
    }

    // 4. If ready, fire the "Matter Ready for Review" notification
    if (allRequiredMet) {
      await notifyMatterReady(supabase, tenantId, matterId, result)
    }

    return result
  } catch (err) {
    log.error('[readiness-notifier] Readiness check failed', {
      matterId,
      error: err instanceof Error ? err.message : 'Unknown',
    })

    return {
      matterId,
      isReady: false,
      categories: [],
      message: 'Readiness check encountered an error',
    }
  }
}

// ─── Internal ──────────────────────────────────────────────────────────────

async function notifyMatterReady(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  result: ReadinessResult,
): Promise<void> {
  // Check if we already sent a readiness notification for this matter recently
  // to prevent duplicate alerts during rapid uploads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentNotif } = await (supabase as any)
    .from('notifications')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'matter')
    .eq('entity_id', matterId)
    .eq('notification_type', 'matter_ready_for_review')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // 1 hour window
    .limit(1)

  if (recentNotif && recentNotif.length > 0) {
    log.debug('[readiness-notifier] Skipping duplicate readiness notification', {
      matterId,
    })
    return
  }

  // Find the responsible lawyer for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('id, title, matter_number, responsible_lawyer_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (!matter?.responsible_lawyer_id) {
    log.debug('[readiness-notifier] No responsible lawyer for matter', { matterId })
    return
  }

  // Build summary
  const identityStatus = result.categories.find((c) => c.category === 'identity')
  const financialStatus = result.categories.find((c) => c.category === 'financial')

  const summary = [
    identityStatus ? `Identity: ${identityStatus.filled}/${identityStatus.total}` : null,
    financialStatus ? `Financial: ${financialStatus.filled}/${financialStatus.total}` : null,
  ]
    .filter(Boolean)
    .join(' | ')

  await dispatchNotification(supabase, {
    tenantId,
    eventType: 'matter_ready_for_review',
    recipientUserIds: [matter.responsible_lawyer_id],
    title: `Matter Ready for Review: ${matter.title || matter.matter_number}`,
    message: `All Identity and Financial documents have been submitted. ${summary}. Ready for lawyer review.`,
    entityType: 'matter',
    entityId: matterId,
    priority: 'high',
    metadata: {
      categories: result.categories,
      trigger: 'document_readiness_complete',
    },
  })

  log.info('[readiness-notifier] Matter ready notification dispatched', {
    matterId,
    lawyerId: matter.responsible_lawyer_id,
  })
}

function buildPendingMessage(categoryMap: Map<string, SlotStatus>): string {
  const pending: string[] = []

  for (const cat of REQUIRED_CATEGORIES) {
    const status = categoryMap.get(cat)
    if (status && !status.complete) {
      pending.push(`${cat}: ${status.filled}/${status.total}`)
    }
  }

  if (pending.length === 0) return 'No required categories to check'
  return `Still pending: ${pending.join(', ')}`
}
