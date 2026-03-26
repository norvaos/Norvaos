/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Trust Deposit → Lead Conversion Bridge (Instruction 5.2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When the Norva Ledger records a trust deposit, this service checks if the
 * deposit's matter originated from a lead that hasn't been converted yet, or
 * if a leadId was explicitly provided. If so, it auto-converts the lead to
 * a matter using the same conversion executor.
 *
 * Two trigger paths:
 *   1. Explicit: POST trust deposit with { leadId } → auto-convert
 *   2. Implicit: POST trust deposit for a matter → check originating_lead_id
 *      (covers the case where a matter was created manually but linked to a lead)
 *
 * The conversion skips conflict_cleared and intake_complete gates (the firm
 * has accepted funds — same logic as record-retainer-payment).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { convertLeadToMatter } from './lead-conversion-executor'
import { runAndPersistEnhancedConflictCheck } from './conflict-check-enhanced'
import { log } from '@/lib/utils/logger'

export interface TrustDepositConversionParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  /** The matter that received the trust deposit */
  matterId?: string
  /** Explicit lead ID — if provided, takes priority over matter lookup */
  leadId?: string
  /** Deposit amount in cents (for activity logging) */
  amountCents: number
}

export interface TrustDepositConversionResult {
  converted: boolean
  matterId?: string
  matterNumber?: string
  error?: string
  /** Why conversion was skipped (not an error — just informational) */
  skippedReason?: string
}

/**
 * Attempt to auto-convert a lead to a matter after a trust deposit.
 *
 * This is a best-effort, non-blocking operation. Failures are logged but
 * never propagated to the caller — the deposit itself always succeeds.
 */
export async function convertLeadOnTrustDeposit(
  params: TrustDepositConversionParams,
): Promise<TrustDepositConversionResult> {
  const { supabase, tenantId, userId, amountCents } = params

  try {
    let leadId = params.leadId

    // ── Path 1: Explicit leadId provided ──────────────────────────────────
    // ── Path 2: Look up originating_lead_id from the matter ───────────────
    if (!leadId && params.matterId) {
      const { data: matter } = await supabase
        .from('matters')
        .select('originating_lead_id')
        .eq('id', params.matterId)
        .eq('tenant_id', tenantId)
        .single()

      if (matter?.originating_lead_id) {
        leadId = matter.originating_lead_id
      }
    }

    if (!leadId) {
      return {
        converted: false,
        skippedReason: 'No lead associated with this deposit.',
      }
    }

    // ── Check if the lead is eligible for conversion ──────────────────────
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, converted_matter_id, contact_id, matter_type_id, practice_area_id, responsible_lawyer_id, assigned_to')
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (!lead) {
      return {
        converted: false,
        skippedReason: 'Lead not found.',
      }
    }

    if (lead.status === 'converted' || lead.converted_matter_id) {
      return {
        converted: false,
        matterId: lead.converted_matter_id ?? undefined,
        skippedReason: 'Lead already converted.',
      }
    }

    if (lead.status === 'lost' || lead.status === 'disqualified') {
      return {
        converted: false,
        skippedReason: `Lead status is "${lead.status}" — cannot auto-convert.`,
      }
    }

    // ── 5.5: Run enhanced 3-way conflict check before conversion ────────
    // Name + DOB + Passport against all active and archived matters
    try {
      const conflictResult = await runAndPersistEnhancedConflictCheck(supabase, leadId)

      if (conflictResult.severity === 'block') {
        const matchSummary = conflictResult.matches
          .map((m) => `${m.contact_name} (${m.match_field}${m.has_matters ? ', has matters' : ''})`)
          .join('; ')

        log.warn('trust_deposit_conversion.conflict_blocked', {
          lead_id: leadId,
          match_count: conflictResult.match_count,
          matches: matchSummary,
        })

        return {
          converted: false,
          error: `Conflict detected: ${conflictResult.match_count} match(es) found — ${matchSummary}. A lawyer must review and clear the conflict before this lead can become a matter.`,
        }
      }

      if (conflictResult.severity === 'review') {
        log.info('trust_deposit_conversion.conflict_review', {
          lead_id: leadId,
          match_count: conflictResult.match_count,
        })
        // Name-only matches don't block — proceed with conversion but log for audit
      }
    } catch (conflictErr) {
      // Conflict check failure is non-blocking — log and proceed
      log.warn('trust_deposit_conversion.conflict_check_failed', {
        lead_id: leadId,
        error: conflictErr instanceof Error ? conflictErr.message : 'Unknown',
      })
    }

    // ── Build matter title from contact ───────────────────────────────────
    let matterTitle = 'New Matter'
    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', lead.contact_id)
        .single()
      if (contact) {
        const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
        if (name) matterTitle = name
      }
    }

    // Append matter type
    if (lead.matter_type_id) {
      const { data: mt } = await supabase
        .from('matter_types')
        .select('name')
        .eq('id', lead.matter_type_id)
        .single()
      if (mt?.name) matterTitle = `${matterTitle} — ${mt.name}`
    }

    // ── Execute conversion ────────────────────────────────────────────────
    const conversionResult = await convertLeadToMatter({
      supabase,
      leadId,
      tenantId,
      userId,
      matterData: {
        title: matterTitle,
        matterTypeId: lead.matter_type_id || undefined,
        practiceAreaId: lead.practice_area_id || undefined,
        responsibleLawyerId: lead.responsible_lawyer_id || lead.assigned_to || undefined,
        billingType: 'flat_fee',
      },
      gateOverrides: {
        // Trust deposit received — skip non-essential gates
        conflict_cleared: false,
        intake_complete: false,
      },
    })

    if (conversionResult.success && conversionResult.matterId) {
      // Fetch matter number
      const { data: matter } = await supabase
        .from('matters')
        .select('matter_number')
        .eq('id', conversionResult.matterId)
        .single()

      log.info('trust_deposit_conversion.success', {
        lead_id: leadId,
        matter_id: conversionResult.matterId,
        amount_cents: amountCents,
      })

      return {
        converted: true,
        matterId: conversionResult.matterId,
        matterNumber: matter?.matter_number ?? undefined,
      }
    }

    // Conversion blocked by gates
    const blockedReasons = conversionResult.gateResults?.blockedReasons ?? []
    const error = conversionResult.error ?? blockedReasons.join('\n')

    log.warn('trust_deposit_conversion.blocked', {
      lead_id: leadId,
      error,
    })

    return {
      converted: false,
      error,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('trust_deposit_conversion.failed', { error: message })
    return {
      converted: false,
      error: message,
    }
  }
}
