/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Reporting Queries  -  Funnel, Attribution, and Operational Reports
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Service layer for report data queries. Uses the source-of-truth tables
 * directly (not derived summary fields) to ensure accuracy.
 *
 * Supported reports:
 *   - Funnel conversion rates (leads per stage)
 *   - Time in stage (average days)
 *   - Lead source attribution (leads + conversions by source)
 *   - Closure reasons (grouped counts)
 *   - Overdue tasks by owner
 *   - No-show rate
 *   - Retained matters by source
 *   - Retained matters by practice area
 *   - Retainers pending signature
 *   - Signed retainers pending payment
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FunnelStageCount {
  stage: string
  count: number
}

export interface StageTimeMetric {
  stage: string
  avgDays: number
  medianDays: number | null
  count: number
}

export interface SourceAttribution {
  source: string
  leadCount: number
  convertedCount: number
  conversionRate: number
}

export interface ClosureReasonCount {
  reasonCode: string
  closedStage: string
  count: number
}

export interface OverdueTaskByOwner {
  ownerUserId: string | null
  overdueCount: number
  oldestDueAt: string | null
}

export interface RetainerPendingInfo {
  leadId: string
  contactName: string | null
  retainerStatus: string
  sentAt: string | null
  daysSinceSent: number
}

export interface DateRange {
  from: string
  to: string
}

// ─── Funnel Conversion Rates ────────────────────────────────────────────────

/**
 * Count leads currently in each stage.
 * For historical funnel analysis, use getStageEntryFunnel.
 */
export async function getCurrentFunnelCounts(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<FunnelStageCount[]> {
  const { data } = await supabase
    .from('leads')
    .select('current_stage')
    .eq('tenant_id', tenantId)
    .not('current_stage', 'is', null)

  if (!data) return []

  const counts = new Map<string, number>()
  for (const lead of data) {
    const stage = lead.current_stage ?? 'unknown'
    counts.set(stage, (counts.get(stage) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Count leads that have entered each stage (from stage history).
 * This gives a true funnel view  -  not just current state.
 */
export async function getStageEntryFunnel(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<FunnelStageCount[]> {
  let query = supabase
    .from('lead_stage_history')
    .select('to_stage, lead_id')
    .eq('tenant_id', tenantId)

  if (dateRange) {
    query = query.gte('changed_at', dateRange.from).lte('changed_at', dateRange.to)
  }

  const { data } = await query

  if (!data) return []

  // Count unique leads per stage (a lead entering a stage multiple times counts once)
  const stageLeads = new Map<string, Set<string>>()
  for (const row of data) {
    if (!stageLeads.has(row.to_stage)) {
      stageLeads.set(row.to_stage, new Set())
    }
    stageLeads.get(row.to_stage)!.add(row.lead_id)
  }

  return Array.from(stageLeads.entries())
    .map(([stage, leads]) => ({ stage, count: leads.size }))
    .sort((a, b) => b.count - a.count)
}

// ─── Time in Stage ──────────────────────────────────────────────────────────

/**
 * Calculate average time spent in each stage.
 * Uses consecutive stage history entries to compute duration.
 */
export async function getTimeInStage(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<StageTimeMetric[]> {
  let query = supabase
    .from('lead_stage_history')
    .select('lead_id, to_stage, changed_at')
    .eq('tenant_id', tenantId)
    .order('lead_id')
    .order('changed_at', { ascending: true })

  if (dateRange) {
    query = query.gte('changed_at', dateRange.from).lte('changed_at', dateRange.to)
  }

  const { data } = await query

  if (!data || data.length === 0) return []

  // Group by lead_id and compute durations
  const stageDurations = new Map<string, number[]>()
  const leadEntries = new Map<string, typeof data>()

  for (const row of data) {
    if (!leadEntries.has(row.lead_id)) {
      leadEntries.set(row.lead_id, [])
    }
    leadEntries.get(row.lead_id)!.push(row)
  }

  for (const entries of leadEntries.values()) {
    for (let i = 0; i < entries.length - 1; i++) {
      const stage = entries[i].to_stage
      const enteredAt = new Date(entries[i].changed_at)
      const leftAt = new Date(entries[i + 1].changed_at)
      const days = (leftAt.getTime() - enteredAt.getTime()) / (1000 * 60 * 60 * 24)

      if (!stageDurations.has(stage)) {
        stageDurations.set(stage, [])
      }
      stageDurations.get(stage)!.push(days)
    }
  }

  return Array.from(stageDurations.entries()).map(([stage, durations]) => {
    const sorted = [...durations].sort((a, b) => a - b)
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
    const median = sorted.length > 0
      ? sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      : null

    return {
      stage,
      avgDays: Math.round(avg * 10) / 10,
      medianDays: median !== null ? Math.round(median * 10) / 10 : null,
      count: durations.length,
    }
  })
}

// ─── Lead Source Attribution ────────────────────────────────────────────────

/**
 * Lead counts and conversion rates grouped by lead source.
 */
export async function getSourceAttribution(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<SourceAttribution[]> {
  let query = supabase
    .from('leads')
    .select('id, lead_source, current_stage, converted_matter_id')
    .eq('tenant_id', tenantId)

  if (dateRange) {
    query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const { data } = await query

  if (!data) return []

  const sources = new Map<string, { total: number; converted: number }>()

  for (const lead of data) {
    const source = lead.lead_source ?? 'unknown'
    if (!sources.has(source)) {
      sources.set(source, { total: 0, converted: 0 })
    }
    const entry = sources.get(source)!
    entry.total++
    if (lead.converted_matter_id) {
      entry.converted++
    }
  }

  return Array.from(sources.entries())
    .map(([source, { total, converted }]) => ({
      source,
      leadCount: total,
      convertedCount: converted,
      conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.leadCount - a.leadCount)
}

// ─── Closure Reasons ────────────────────────────────────────────────────────

/**
 * Closure reason codes grouped by count.
 */
export async function getClosureReasonBreakdown(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<ClosureReasonCount[]> {
  let query = supabase
    .from('lead_closure_records')
    .select('reason_code, closed_stage')
    .eq('tenant_id', tenantId)

  if (dateRange) {
    query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const { data } = await query

  if (!data) return []

  const grouped = new Map<string, { closedStage: string; count: number }>()

  for (const record of data) {
    const key = `${record.reason_code}:${record.closed_stage}`
    if (!grouped.has(key)) {
      grouped.set(key, { closedStage: record.closed_stage, count: 0 })
    }
    grouped.get(key)!.count++
  }

  return Array.from(grouped.entries())
    .map(([key, { closedStage, count }]) => ({
      reasonCode: key.split(':')[0],
      closedStage,
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Overdue Tasks by Owner ─────────────────────────────────────────────────

/**
 * Count overdue tasks grouped by owner user ID.
 */
export async function getOverdueTasksByOwner(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<OverdueTaskByOwner[]> {
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('lead_milestone_tasks')
    .select('owner_user_id, due_at')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","skipped","closed")')
    .lt('due_at', now)

  if (!data) return []

  const grouped = new Map<string, { count: number; oldest: string | null }>()

  for (const task of data) {
    const owner = task.owner_user_id ?? '__unassigned__'
    if (!grouped.has(owner)) {
      grouped.set(owner, { count: 0, oldest: null })
    }
    const entry = grouped.get(owner)!
    entry.count++
    if (task.due_at && (!entry.oldest || task.due_at < entry.oldest)) {
      entry.oldest = task.due_at
    }
  }

  return Array.from(grouped.entries())
    .map(([ownerUserId, { count, oldest }]) => ({
      ownerUserId: ownerUserId === '__unassigned__' ? null : ownerUserId,
      overdueCount: count,
      oldestDueAt: oldest,
    }))
    .sort((a, b) => b.overdueCount - a.overdueCount)
}

// ─── No-Show Rate ───────────────────────────────────────────────────────────

/**
 * Calculate the no-show rate for consultations.
 */
export async function getNoShowRate(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<{ totalConsultations: number; noShows: number; noShowRate: number }> {
  let totalQuery = supabase
    .from('lead_consultations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'booked') // Exclude future booked ones

  let noShowQuery = supabase
    .from('lead_consultations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'no_show')

  if (dateRange) {
    totalQuery = totalQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
    noShowQuery = noShowQuery.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const [totalResult, noShowResult] = await Promise.all([totalQuery, noShowQuery])

  const total = totalResult.count ?? 0
  const noShows = noShowResult.count ?? 0

  return {
    totalConsultations: total,
    noShows,
    noShowRate: total > 0 ? Math.round((noShows / total) * 1000) / 10 : 0,
  }
}

// ─── Retained Matters by Source ─────────────────────────────────────────────

/**
 * Count retained matters grouped by the originating lead's source.
 */
export async function getRetainedMattersBySource(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<Array<{ source: string; count: number }>> {
  let query = supabase
    .from('matters')
    .select('originating_lead_id')
    .eq('tenant_id', tenantId)
    .not('originating_lead_id', 'is', null)

  if (dateRange) {
    query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const { data: matters } = await query

  if (!matters || matters.length === 0) return []

  // Fetch the lead sources for these matters
  const leadIds = matters
    .map((m) => m.originating_lead_id)
    .filter((id): id is string => id !== null)

  if (leadIds.length === 0) return []

  const { data: leads } = await supabase
    .from('leads')
    .select('id, lead_source')
    .in('id', leadIds)

  if (!leads) return []

  const sourceMap = new Map<string, number>()
  for (const lead of leads) {
    const source = lead.lead_source ?? 'unknown'
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1)
  }

  return Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

// ─── Retained Matters by Practice Area ──────────────────────────────────────

/**
 * Count retained matters grouped by practice area.
 */
export async function getRetainedMattersByPracticeArea(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  dateRange?: DateRange
): Promise<Array<{ practiceArea: string; count: number }>> {
  let query = supabase
    .from('matters')
    .select('practice_area_id, originating_lead_id')
    .eq('tenant_id', tenantId)
    .not('originating_lead_id', 'is', null)

  if (dateRange) {
    query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  }

  const { data: matters } = await query

  if (!matters || matters.length === 0) return []

  // Resolve practice area names
  const practiceAreaIds = [...new Set(matters.map((m) => m.practice_area_id).filter(Boolean))]

  let practiceAreaMap = new Map<string, string>()
  if (practiceAreaIds.length > 0) {
    const { data: areas } = await supabase
      .from('practice_areas')
      .select('id, name')
      .in('id', practiceAreaIds as string[])

    if (areas) {
      practiceAreaMap = new Map(areas.map((a) => [a.id, a.name]))
    }
  }

  const counts = new Map<string, number>()
  for (const matter of matters) {
    const areaName = matter.practice_area_id
      ? (practiceAreaMap.get(matter.practice_area_id) ?? 'Unknown')
      : 'Unassigned'
    counts.set(areaName, (counts.get(areaName) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([practiceArea, count]) => ({ practiceArea, count }))
    .sort((a, b) => b.count - a.count)
}

// ─── Retainers Pending Signature ────────────────────────────────────────────

/**
 * List leads with retainers pending signature.
 */
export async function getRetainersPendingSignature(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<RetainerPendingInfo[]> {
  const { data } = await supabase
    .from('lead_retainer_packages')
    .select('lead_id, status, sent_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: true })

  if (!data) return []

  const now = new Date()
  const leadIds = data.map((r) => r.lead_id)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_id')
    .in('id', leadIds)

  const contactIds = leads?.map((l) => l.contact_id).filter(Boolean) ?? []
  let contactNames = new Map<string, string>()
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .in('id', contactIds as string[])

    if (contacts) {
      contactNames = new Map(
        contacts.map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')])
      )
    }
  }

  const leadContactMap = new Map(leads?.map((l) => [l.id, l.contact_id]) ?? [])

  return data.map((r) => {
    const contactId = leadContactMap.get(r.lead_id)
    const daysSinceSent = r.sent_at
      ? Math.floor((now.getTime() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    return {
      leadId: r.lead_id,
      contactName: contactId ? (contactNames.get(contactId) ?? null) : null,
      retainerStatus: r.status,
      sentAt: r.sent_at,
      daysSinceSent,
    }
  })
}

// ─── Signed Retainers Pending Payment ───────────────────────────────────────

/**
 * List leads with signed retainers but pending payment.
 */
export async function getSignedRetainersPendingPayment(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<Array<{ leadId: string; contactName: string | null; signedAt: string | null; paymentStatus: string }>> {
  const { data } = await supabase
    .from('lead_retainer_packages')
    .select('lead_id, signed_at, payment_status')
    .eq('tenant_id', tenantId)
    .eq('status', 'signed')
    .not('payment_status', 'in', '("paid","waived")')
    .order('signed_at', { ascending: true })

  if (!data) return []

  const leadIds = data.map((r) => r.lead_id)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_id')
    .in('id', leadIds)

  const contactIds = leads?.map((l) => l.contact_id).filter(Boolean) ?? []
  let contactNames = new Map<string, string>()
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .in('id', contactIds as string[])

    if (contacts) {
      contactNames = new Map(
        contacts.map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')])
      )
    }
  }

  const leadContactMap = new Map(leads?.map((l) => [l.id, l.contact_id]) ?? [])

  return data.map((r) => ({
    leadId: r.lead_id,
    contactName: leadContactMap.get(r.lead_id)
      ? (contactNames.get(leadContactMap.get(r.lead_id)!) ?? null)
      : null,
    signedAt: r.signed_at,
    paymentStatus: r.payment_status,
  }))
}
