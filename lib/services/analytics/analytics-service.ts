import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { AuthContext } from '@/lib/services/auth'

// ── Types ────────────────────────────────────────────────────────────────────

/** Standard service return envelope. */
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
}

// ── Aged Receivables ─────────────────────────────────────────────────────────

export type AgingBucket = 'current' | '31_60' | '61_90' | '91_120' | '120_plus'

export interface InvoiceDetail {
  id: string
  invoice_number: string
  matter_title: string
  contact_name: string
  total_cents: number
  balance_due_cents: number
  due_date: string
  aging_bucket: AgingBucket
  days_overdue: number
}

export interface AgedReceivablesData {
  buckets: { bucket: AgingBucket; count: number; total_cents: number }[]
  invoices: InvoiceDetail[]
}

export interface AgedReceivablesFilters {
  practice_area_id?: string
  responsible_lawyer_id?: string
  matter_type_id?: string
  contact_id?: string
}

// ── Matter Profitability ─────────────────────────────────────────────────────

export interface MatterProfitabilityRow {
  matter_id: string
  title: string
  practice_area: string
  revenue_cents: number
  cost_cents: number
  margin_cents: number
  margin_pct: number
  realization_rate: number
  collection_rate: number
}

export interface MatterProfitabilityData {
  matters: MatterProfitabilityRow[]
  totals: {
    revenue_cents: number
    cost_cents: number
    margin_cents: number
    margin_pct: number
  }
}

export interface MatterProfitabilityFilters {
  matter_id?: string
  practice_area_id?: string
  responsible_lawyer_id?: string
  matter_type_id?: string
}

// ── Lawyer Utilisation ───────────────────────────────────────────────────────

export interface PracticeAreaBreakdown {
  practice_area_id: string
  practice_area_name: string
  billable_minutes: number
  non_billable_minutes: number
}

export interface LawyerUtilisationRow {
  user_id: string
  name: string
  billable_minutes: number
  non_billable_minutes: number
  target_minutes: number
  utilisation_pct: number
  by_practice_area: PracticeAreaBreakdown[]
}

export interface LawyerUtilisationFilters {
  user_id?: string
  practice_area_id?: string
  start_date?: string
  end_date?: string
}

// ── Revenue Analytics ────────────────────────────────────────────────────────

export interface RevenuePeriod {
  label: string
  billed_cents: number
  collected_cents: number
  wip_cents: number
}

export interface RevenueAnalyticsData {
  periods: RevenuePeriod[]
  yoy: {
    current_period_cents: number
    prior_period_cents: number
    change_pct: number
  }
}

export interface RevenueAnalyticsFilters {
  practice_area_id?: string
  responsible_lawyer_id?: string
  period_type?: 'monthly' | 'quarterly' | 'annual'
  start_date?: string
  end_date?: string
}

// ── Trust Compliance Dashboard ───────────────────────────────────────────────

export interface TrustComplianceDashboardData {
  approaching_reconciliation_deadline: {
    account_id: string
    account_name: string
    last_reconciliation_date: string | null
    days_since_reconciliation: number
  }[]
  stale_trust_balances: {
    matter_id: string
    matter_title: string
    trust_account_id: string
    balance_cents: number
    last_transaction_date: string
    days_since_transaction: number
  }[]
  holds_past_release: {
    hold_id: string
    matter_id: string
    amount_cents: number
    release_date: string
    days_past_release: number
  }[]
  pending_disbursements_over_48h: {
    request_id: string
    matter_id: string
    amount_cents: number
    requested_at: string
    hours_pending: number
  }[]
  trust_balance_anomalies: {
    account_id: string
    account_name: string
    anomaly: string
  }[]
}

// ── KPI Scorecard ────────────────────────────────────────────────────────────

export interface KpiScorecardData {
  revenue: {
    mtd_cents: number
    qtd_cents: number
    ytd_cents: number
    prior_period_cents: number
    change_pct: number
  }
  receivables: {
    total_outstanding_cents: number
    aging_summary: { bucket: AgingBucket; total_cents: number }[]
  }
  utilisation_rate: number
  trust_compliance: {
    accounts_needing_reconciliation: number
    active_holds_count: number
  }
  matter_pipeline: {
    new_matters: number
    closed_matters: number
    avg_days_to_close: number
  }
  collection_rate: number
  wip_value_cents: number
}

export interface KpiPeriodParams {
  start_date: string
  end_date: string
  prior_start_date: string
  prior_end_date: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getReadClient(): Promise<SupabaseClient<Database>> {
  return (await createServerSupabaseClient()) as SupabaseClient<Database>
}

/** Compute the aging bucket for an overdue invoice. */
function computeAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30) return 'current'
  if (daysOverdue <= 60) return '31_60'
  if (daysOverdue <= 90) return '61_90'
  if (daysOverdue <= 120) return '91_120'
  return '120_plus'
}

/** Compute the number of days between two dates. */
function daysBetween(from: string | Date, to: Date): number {
  const fromDate = typeof from === 'string' ? new Date(from) : from
  return Math.floor((to.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * Get aged receivables grouped by aging bucket with invoice details.
 *
 * Queries outstanding invoices (not paid, cancelled, or draft) and computes
 * aging buckets based on days since the due date.
 */
export async function getAgedReceivables(
  auth: AuthContext,
  filters: AgedReceivablesFilters = {},
): Promise<ServiceResult<AgedReceivablesData>> {
  try {
    const client = auth.supabase

    // FIXED: was querying 'balance_due'/'total'  -  corrected to compute from total_amount - amount_paid
    // Build the query for outstanding invoices
    let query = client
      .from('invoices')
      .select(`
        id,
        invoice_number,
        total_amount,
        amount_paid,
        due_date,
        matter_id,
        contact_id,
        matters!inner (id, title, practice_area_id, responsible_lawyer_id, matter_type_id),
        contacts!inner (id, first_name, last_name)
      `)
      .eq('tenant_id', auth.tenantId)
      .not('status', 'in', '("paid","cancelled","draft")')

    // Apply filters via the joined matters table
    if (filters.practice_area_id) {
      query = query.eq('matters.practice_area_id', filters.practice_area_id)
    }
    if (filters.responsible_lawyer_id) {
      query = query.eq('matters.responsible_lawyer_id', filters.responsible_lawyer_id)
    }
    if (filters.matter_type_id) {
      query = query.eq('matters.matter_type_id', filters.matter_type_id)
    }
    if (filters.contact_id) {
      query = query.eq('contact_id', filters.contact_id)
    }

    const { data: rows, error } = await query

    if (error) {
      return { success: false, error: `Failed to fetch receivables: ${error.message}` }
    }

    const now = new Date()
    const invoices: InvoiceDetail[] = (rows ?? []).map((row: any) => {
      const daysOverdue = row.due_date ? Math.max(0, daysBetween(row.due_date, now)) : 0
      const bucket = computeAgingBucket(daysOverdue)
      return {
        id: row.id,
        invoice_number: row.invoice_number,
        matter_title: row.matters?.title ?? '',
        contact_name: `${row.contacts?.first_name ?? ''} ${row.contacts?.last_name ?? ''}`.trim(),
        total_cents: Math.round((Number(row.total_amount) || 0) * 100),
        balance_due_cents: Math.round(Math.max(0, (Number(row.total_amount) || 0) - (Number(row.amount_paid) || 0)) * 100),
        due_date: row.due_date,
        aging_bucket: bucket,
        days_overdue: daysOverdue,
      }
    })

    // Aggregate into buckets
    const bucketMap = new Map<AgingBucket, { count: number; total_cents: number }>()
    const allBuckets: AgingBucket[] = ['current', '31_60', '61_90', '91_120', '120_plus']
    for (const b of allBuckets) {
      bucketMap.set(b, { count: 0, total_cents: 0 })
    }
    for (const inv of invoices) {
      const entry = bucketMap.get(inv.aging_bucket)!
      entry.count += 1
      entry.total_cents += inv.balance_due_cents
    }

    const buckets = allBuckets.map((b) => ({
      bucket: b,
      count: bucketMap.get(b)!.count,
      total_cents: bucketMap.get(b)!.total_cents,
    }))

    return { success: true, data: { buckets, invoices } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getAgedReceivables'
    return { success: false, error: message }
  }
}

/**
 * Get per-matter profitability: revenue vs cost with margin and rate metrics.
 *
 * Revenue = sum of amount_paid from invoices.
 * Cost = sum of (duration_minutes * cost_rate_cents / 60) from time_entries + users.
 */
export async function getMatterProfitability(
  auth: AuthContext,
  filters: MatterProfitabilityFilters = {},
): Promise<ServiceResult<MatterProfitabilityData>> {
  try {
    const client = auth.supabase

    // Fetch matters with their practice area names
    // Exclude import_reverted matters  -  they are not business matters and must not appear in profitability reports
    let matterQuery = client
      .from('matters')
      .select('id, title, practice_area_id, practice_areas (name)')
      .eq('tenant_id', auth.tenantId)
      .neq('status', 'import_reverted')

    if (filters.matter_id) {
      matterQuery = matterQuery.eq('id', filters.matter_id)
    }
    if (filters.practice_area_id) {
      matterQuery = matterQuery.eq('practice_area_id', filters.practice_area_id)
    }
    if (filters.responsible_lawyer_id) {
      matterQuery = matterQuery.eq('responsible_lawyer_id', filters.responsible_lawyer_id)
    }
    if (filters.matter_type_id) {
      matterQuery = matterQuery.eq('matter_type_id', filters.matter_type_id)
    }

    const { data: matters, error: mattersError } = await matterQuery

    if (mattersError) {
      return { success: false, error: `Failed to fetch matters: ${mattersError.message}` }
    }

    if (!matters || matters.length === 0) {
      return {
        success: true,
        data: {
          matters: [],
          totals: { revenue_cents: 0, cost_cents: 0, margin_cents: 0, margin_pct: 0 },
        },
      }
    }

    const matterIds = matters.map((m: any) => m.id)

    // FIXED: was querying 'balance_due'/'total'  -  corrected to compute from total_amount - amount_paid
    // Fetch invoices for revenue (amount_paid), billed (total_amount), and worked (from time_entries)
    const [invoicesResult, timeEntriesResult] = await Promise.all([
      client
        .from('invoices')
        .select('matter_id, total_amount, amount_paid, status')
        .eq('tenant_id', auth.tenantId)
        .in('matter_id', matterIds),
      client
        .from('time_entries')
        .select('matter_id, duration_minutes, hourly_rate, is_billable, is_invoiced, user_id')
        .eq('tenant_id', auth.tenantId)
        .in('matter_id', matterIds),
    ])

    if (invoicesResult.error) {
      return { success: false, error: `Failed to fetch invoices: ${invoicesResult.error.message}` }
    }
    if (timeEntriesResult.error) {
      return { success: false, error: `Failed to fetch time entries: ${timeEntriesResult.error.message}` }
    }

    // Fetch cost rates for users involved in time entries
    const userIds = Array.from(new Set<string>((timeEntriesResult.data ?? []).map((te: any) => te.user_id)))
    const userCostRates = new Map<string, number>()
    if (userIds.length > 0) {
      const { data: usersData } = await client
        .from('users')
        .select('id, cost_rate_cents')
        .in('id', userIds)

      for (const u of usersData ?? []) {
        userCostRates.set(u.id, Number((u as any).cost_rate_cents) || 0)
      }
    }

    // Aggregate per matter
    const revenueByMatter = new Map<string, { collected: number; billed: number }>()
    for (const inv of invoicesResult.data ?? []) {
      const matterId = (inv as any).matter_id
      const entry = revenueByMatter.get(matterId) ?? { collected: 0, billed: 0 }
      entry.collected += Math.round((Number((inv as any).amount_paid) || 0) * 100)
      if (['sent', 'paid', 'overdue'].includes((inv as any).status)) {
        entry.billed += Math.round((Number((inv as any).total_amount) || 0) * 100)
      }
      revenueByMatter.set(matterId, entry)
    }

    const costByMatter = new Map<string, { cost: number; worked_cents: number }>()
    for (const te of timeEntriesResult.data ?? []) {
      const matterId = (te as any).matter_id
      const entry = costByMatter.get(matterId) ?? { cost: 0, worked_cents: 0 }
      const minutes = Number((te as any).duration_minutes) || 0
      const costRate = userCostRates.get((te as any).user_id) || 0
      entry.cost += Math.round((minutes * costRate) / 60)
      if ((te as any).is_billable) {
        const hourlyRate = Number((te as any).hourly_rate) || 0
        // hourly_rate is dollars, duration is minutes
        entry.worked_cents += Math.round((minutes / 60) * hourlyRate * 100)
      }
      costByMatter.set(matterId, entry)
    }

    const profitRows: MatterProfitabilityRow[] = matters.map((m: any) => {
      const rev = revenueByMatter.get(m.id) ?? { collected: 0, billed: 0 }
      const cost = costByMatter.get(m.id) ?? { cost: 0, worked_cents: 0 }
      const marginCents = rev.collected - cost.cost
      const marginPct = rev.collected > 0 ? (marginCents / rev.collected) * 100 : 0
      const realizationRate = cost.worked_cents > 0 ? (rev.billed / cost.worked_cents) * 100 : 0
      const collectionRate = rev.billed > 0 ? (rev.collected / rev.billed) * 100 : 0

      return {
        matter_id: m.id,
        title: m.title,
        practice_area: m.practice_areas?.name ?? '',
        revenue_cents: rev.collected,
        cost_cents: cost.cost,
        margin_cents: marginCents,
        margin_pct: Math.round(marginPct * 100) / 100,
        realization_rate: Math.round(realizationRate * 100) / 100,
        collection_rate: Math.round(collectionRate * 100) / 100,
      }
    })

    const totalRevenue = profitRows.reduce((s, r) => s + r.revenue_cents, 0)
    const totalCost = profitRows.reduce((s, r) => s + r.cost_cents, 0)
    const totalMargin = totalRevenue - totalCost
    const totalMarginPct = totalRevenue > 0 ? Math.round(((totalMargin / totalRevenue) * 100) * 100) / 100 : 0

    return {
      success: true,
      data: {
        matters: profitRows,
        totals: {
          revenue_cents: totalRevenue,
          cost_cents: totalCost,
          margin_cents: totalMargin,
          margin_pct: totalMarginPct,
        },
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getMatterProfitability'
    return { success: false, error: message }
  }
}

/**
 * Get per-lawyer utilisation: billable vs non-billable hours against target.
 *
 * Source: time_entries joined with users for utilisation target hours.
 */
export async function getLawyerUtilization(
  auth: AuthContext,
  filters: LawyerUtilisationFilters = {},
): Promise<ServiceResult<LawyerUtilisationRow[]>> {
  try {
    const client = auth.supabase

    // Build time entries query with period filter
    let teQuery = client
      .from('time_entries')
      .select('user_id, duration_minutes, is_billable, matter_id, matters (practice_area_id, practice_areas (id, name))')
      .eq('tenant_id', auth.tenantId)

    if (filters.user_id) {
      teQuery = teQuery.eq('user_id', filters.user_id)
    }
    if (filters.start_date) {
      teQuery = teQuery.gte('date', filters.start_date)
    }
    if (filters.end_date) {
      teQuery = teQuery.lte('date', filters.end_date)
    }
    if (filters.practice_area_id) {
      teQuery = teQuery.eq('matters.practice_area_id', filters.practice_area_id)
    }

    const { data: timeEntries, error: teError } = await teQuery

    if (teError) {
      return { success: false, error: `Failed to fetch time entries: ${teError.message}` }
    }

    // Get unique user IDs from entries
    const userIds = Array.from(new Set<string>((timeEntries ?? []).map((te: any) => te.user_id)))
    if (userIds.length === 0) {
      return { success: true, data: [] }
    }

    // Fetch users with target hours
    const { data: usersData, error: usersError } = await client
      .from('users')
      .select('id, first_name, last_name, utilization_target_hours')
      .in('id', userIds)

    if (usersError) {
      return { success: false, error: `Failed to fetch users: ${usersError.message}` }
    }

    const usersMap = new Map<string, { name: string; target_minutes: number }>()
    for (const u of usersData ?? []) {
      usersMap.set(u.id, {
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
        target_minutes: (Number((u as any).utilization_target_hours) || 0) * 60,
      })
    }

    // Aggregate per lawyer
    const lawyerData = new Map<
      string,
      {
        billable_minutes: number
        non_billable_minutes: number
        by_practice_area: Map<string, { id: string; name: string; billable: number; non_billable: number }>
      }
    >()

    for (const te of timeEntries ?? []) {
      const entry = te as any
      const userId = entry.user_id
      const minutes = Number(entry.duration_minutes) || 0

      if (!lawyerData.has(userId)) {
        lawyerData.set(userId, {
          billable_minutes: 0,
          non_billable_minutes: 0,
          by_practice_area: new Map(),
        })
      }

      const lawyer = lawyerData.get(userId)!
      if (entry.is_billable) {
        lawyer.billable_minutes += minutes
      } else {
        lawyer.non_billable_minutes += minutes
      }

      // Practice area breakdown
      const paId = entry.matters?.practice_area_id ?? 'unknown'
      const paName = entry.matters?.practice_areas?.name ?? 'Unknown'
      if (!lawyer.by_practice_area.has(paId)) {
        lawyer.by_practice_area.set(paId, { id: paId, name: paName, billable: 0, non_billable: 0 })
      }
      const pa = lawyer.by_practice_area.get(paId)!
      if (entry.is_billable) {
        pa.billable += minutes
      } else {
        pa.non_billable += minutes
      }
    }

    const rows: LawyerUtilisationRow[] = []
    lawyerData.forEach((data, userId) => {
      const user = usersMap.get(userId) ?? { name: userId, target_minutes: 0 }
      const utilisationPct =
        user.target_minutes > 0
          ? Math.round(((data.billable_minutes / user.target_minutes) * 100) * 100) / 100
          : 0

      rows.push({
        user_id: userId,
        name: user.name,
        billable_minutes: data.billable_minutes,
        non_billable_minutes: data.non_billable_minutes,
        target_minutes: user.target_minutes,
        utilisation_pct: utilisationPct,
        by_practice_area: Array.from(data.by_practice_area.values()).map((pa: any) => ({
          practice_area_id: pa.id,
          practice_area_name: pa.name,
          billable_minutes: pa.billable,
          non_billable_minutes: pa.non_billable,
        })),
      })
    })

    return { success: true, data: rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getLawyerUtilization'
    return { success: false, error: message }
  }
}

/**
 * Get revenue analytics by period with year-over-year comparison.
 *
 * Sources: invoices (billed/collected), time_entries (WIP = unbilled billable).
 */
export async function getRevenueAnalytics(
  auth: AuthContext,
  filters: RevenueAnalyticsFilters = {},
): Promise<ServiceResult<RevenueAnalyticsData>> {
  try {
    const client = auth.supabase
    const periodType = filters.period_type ?? 'monthly'
    const endDate = filters.end_date ?? new Date().toISOString().split('T')[0]
    const startDate = filters.start_date ?? new Date(new Date(endDate).getFullYear(), 0, 1).toISOString().split('T')[0]

    // FIXED: was querying 'balance_due'/'total'  -  corrected to compute from total_amount - amount_paid
    // Fetch invoices in the date range
    let invQuery = client
      .from('invoices')
      .select('id, total_amount, amount_paid, status, issue_date, matter_id, matters (practice_area_id, responsible_lawyer_id)')
      .eq('tenant_id', auth.tenantId)
      .gte('issue_date', startDate)
      .lte('issue_date', endDate)

    if (filters.practice_area_id) {
      invQuery = invQuery.eq('matters.practice_area_id', filters.practice_area_id)
    }
    if (filters.responsible_lawyer_id) {
      invQuery = invQuery.eq('matters.responsible_lawyer_id', filters.responsible_lawyer_id)
    }

    // Fetch WIP time entries (billable but not yet invoiced)
    let wipQuery = client
      .from('time_entries')
      .select('date, duration_minutes, hourly_rate, matter_id, matters (practice_area_id, responsible_lawyer_id)')
      .eq('tenant_id', auth.tenantId)
      .eq('is_billable', true)
      .eq('is_invoiced', false)
      .gte('date', startDate)
      .lte('date', endDate)

    if (filters.practice_area_id) {
      wipQuery = wipQuery.eq('matters.practice_area_id', filters.practice_area_id)
    }
    if (filters.responsible_lawyer_id) {
      wipQuery = wipQuery.eq('matters.responsible_lawyer_id', filters.responsible_lawyer_id)
    }

    const [invoicesResult, wipResult] = await Promise.all([invQuery, wipQuery])

    if (invoicesResult.error) {
      return { success: false, error: `Failed to fetch invoices: ${invoicesResult.error.message}` }
    }
    if (wipResult.error) {
      return { success: false, error: `Failed to fetch WIP entries: ${wipResult.error.message}` }
    }

    // Compute period labels
    const getPeriodLabel = (dateStr: string): string => {
      const d = new Date(dateStr)
      if (periodType === 'monthly') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      }
      if (periodType === 'quarterly') {
        const q = Math.ceil((d.getMonth() + 1) / 3)
        return `${d.getFullYear()}-Q${q}`
      }
      return `${d.getFullYear()}`
    }

    // Aggregate invoices by period
    const periodMap = new Map<string, { billed_cents: number; collected_cents: number; wip_cents: number }>()

    for (const inv of invoicesResult.data ?? []) {
      const entry = inv as any
      const label = getPeriodLabel(entry.issue_date)
      if (!periodMap.has(label)) {
        periodMap.set(label, { billed_cents: 0, collected_cents: 0, wip_cents: 0 })
      }
      const period = periodMap.get(label)!
      if (['sent', 'paid', 'overdue'].includes(entry.status)) {
        period.billed_cents += Math.round((Number(entry.total_amount) || 0) * 100)
      }
      period.collected_cents += Math.round((Number(entry.amount_paid) || 0) * 100)
    }

    // Aggregate WIP by period
    for (const te of wipResult.data ?? []) {
      const entry = te as any
      const label = getPeriodLabel(entry.date)
      if (!periodMap.has(label)) {
        periodMap.set(label, { billed_cents: 0, collected_cents: 0, wip_cents: 0 })
      }
      const period = periodMap.get(label)!
      const minutes = Number(entry.duration_minutes) || 0
      const rate = Number(entry.hourly_rate) || 0
      period.wip_cents += Math.round((minutes / 60) * rate * 100)
    }

    // Sort periods chronologically
    const periods: RevenuePeriod[] = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, vals]) => ({ label, ...vals }))

    // YoY comparison: current period total vs prior year same period
    const currentTotal = periods.reduce((s, p) => s + p.collected_cents, 0)

    // Compute prior year date range for YoY
    const priorStart = new Date(startDate)
    priorStart.setFullYear(priorStart.getFullYear() - 1)
    const priorEnd = new Date(endDate)
    priorEnd.setFullYear(priorEnd.getFullYear() - 1)

    let priorQuery = client
      .from('invoices')
      .select('amount_paid')
      .eq('tenant_id', auth.tenantId)
      .gte('issue_date', priorStart.toISOString().split('T')[0])
      .lte('issue_date', priorEnd.toISOString().split('T')[0])

    const { data: priorInvoices } = await priorQuery
    const priorTotal = (priorInvoices ?? []).reduce(
      (s: number, inv: any) => s + Math.round((Number(inv.amount_paid) || 0) * 100),
      0,
    )

    const changePct =
      priorTotal > 0 ? Math.round((((currentTotal - priorTotal) / priorTotal) * 100) * 100) / 100 : 0

    return {
      success: true,
      data: {
        periods,
        yoy: {
          current_period_cents: currentTotal,
          prior_period_cents: priorTotal,
          change_pct: changePct,
        },
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getRevenueAnalytics'
    return { success: false, error: message }
  }
}

/**
 * Get trust compliance dashboard data.
 *
 * Surfaces accounts approaching reconciliation deadlines, stale balances,
 * holds past release, slow disbursement approvals, and balance anomalies.
 */
export async function getTrustComplianceDashboard(
  auth: AuthContext,
): Promise<ServiceResult<TrustComplianceDashboardData>> {
  try {
    const client = auth.supabase
    const now = new Date()

    // 1. Accounts approaching reconciliation deadline (last reconciliation > 25 days ago)
    const { data: trustAccounts, error: taError } = await (client as any)
      .from('trust_bank_accounts')
      .select('id, account_name, tenant_id')
      .eq('tenant_id', auth.tenantId)

    if (taError) {
      return { success: false, error: `Failed to fetch trust accounts: ${taError.message}` }
    }

    // Get latest reconciliation per account
    const { data: reconciliations, error: reconError } = await (client as any)
      .from('trust_reconciliations')
      .select('trust_account_id, reconciliation_date')
      .eq('tenant_id', auth.tenantId)
      .order('reconciliation_date', { ascending: false })

    if (reconError) {
      return { success: false, error: `Failed to fetch reconciliations: ${reconError.message}` }
    }

    const latestReconByAccount = new Map<string, string>()
    for (const r of reconciliations ?? []) {
      if (!latestReconByAccount.has(r.trust_account_id)) {
        latestReconByAccount.set(r.trust_account_id, r.reconciliation_date)
      }
    }

    const approachingDeadline = (trustAccounts ?? [])
      .map((acc: any) => {
        const lastRecon = latestReconByAccount.get(acc.id) ?? null
        const daysSince = lastRecon ? daysBetween(lastRecon, now) : 999
        return {
          account_id: acc.id,
          account_name: acc.account_name,
          last_reconciliation_date: lastRecon,
          days_since_reconciliation: daysSince,
        }
      })
      .filter((a: any) => a.days_since_reconciliation > 25)

    // 2. Stale trust balances (no transaction in 90+ days but balance > 0)
    const { data: transactions, error: txnError } = await (client as any)
      .from('trust_transactions')
      .select('trust_account_id, matter_id, running_balance_cents, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })

    if (txnError) {
      return { success: false, error: `Failed to fetch trust transactions: ${txnError.message}` }
    }

    // Find latest transaction per matter+account
    const latestTxnByMatter = new Map<string, { balance: number; date: string; trust_account_id: string }>()
    for (const txn of transactions ?? []) {
      const key = `${txn.matter_id}:${txn.trust_account_id}`
      if (!latestTxnByMatter.has(key)) {
        latestTxnByMatter.set(key, {
          balance: Number(txn.running_balance_cents),
          date: txn.created_at,
          trust_account_id: txn.trust_account_id,
        })
      }
    }

    // Get matter titles for stale balances
    const staleMatterIds = new Set<string>()
    const staleEntries: { matter_id: string; trust_account_id: string; balance: number; date: string; days: number }[] = []
    latestTxnByMatter.forEach((val, key) => {
      const days = daysBetween(val.date, now)
      if (days >= 90 && val.balance > 0) {
        const matterId = key.split(':')[0]
        staleMatterIds.add(matterId)
        staleEntries.push({
          matter_id: matterId,
          trust_account_id: val.trust_account_id,
          balance: val.balance,
          date: val.date,
          days,
        })
      }
    })

    let matterTitlesMap = new Map<string, string>()
    if (staleMatterIds.size > 0) {
      const { data: mattersData } = await client
        .from('matters')
        .select('id, title')
        .in('id', Array.from(staleMatterIds))
      for (const m of mattersData ?? []) {
        matterTitlesMap.set(m.id, m.title)
      }
    }

    const staleTrustBalances = staleEntries.map((e) => ({
      matter_id: e.matter_id,
      matter_title: matterTitlesMap.get(e.matter_id) ?? '',
      trust_account_id: e.trust_account_id,
      balance_cents: e.balance,
      last_transaction_date: e.date,
      days_since_transaction: e.days,
    }))

    // 3. Holds past release date
    const { data: holds, error: holdsError } = await (client as any)
      .from('trust_holds')
      .select('id, matter_id, amount_cents, release_date')
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'held')
      .lt('release_date', now.toISOString().split('T')[0])

    if (holdsError) {
      return { success: false, error: `Failed to fetch trust holds: ${holdsError.message}` }
    }

    const holdsPastRelease = (holds ?? []).map((h: any) => ({
      hold_id: h.id,
      matter_id: h.matter_id,
      amount_cents: Number(h.amount_cents),
      release_date: h.release_date,
      days_past_release: daysBetween(h.release_date, now),
    }))

    // 4. Disbursement requests pending > 48 hours
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: pendingDisb, error: disbError } = await (client as any)
      .from('trust_disbursement_requests')
      .select('id, matter_id, amount_cents, created_at')
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'pending_approval')
      .lt('created_at', cutoff48h)

    if (disbError) {
      return { success: false, error: `Failed to fetch disbursement requests: ${disbError.message}` }
    }

    const pendingDisbursements = (pendingDisb ?? []).map((d: any) => ({
      request_id: d.id,
      matter_id: d.matter_id,
      amount_cents: Number(d.amount_cents),
      requested_at: d.created_at,
      hours_pending: Math.round((now.getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60)),
    }))

    // 5. Trust balance anomalies: accounts with negative aggregate balances
    const accountBalances = new Map<string, number>()
    for (const [, val] of latestTxnByMatter) {
      const current = accountBalances.get(val.trust_account_id) ?? 0
      accountBalances.set(val.trust_account_id, current + val.balance)
    }

    const accountNameMap = new Map<string, string>()
    for (const acc of trustAccounts ?? []) {
      accountNameMap.set((acc as any).id, (acc as any).account_name)
    }

    const anomalies = Array.from(accountBalances.entries())
      .filter(([, balance]) => balance < 0)
      .map(([accountId, balance]) => ({
        account_id: accountId,
        account_name: accountNameMap.get(accountId) ?? '',
        anomaly: `Negative aggregate balance: ${balance} cents`,
      }))

    return {
      success: true,
      data: {
        approaching_reconciliation_deadline: approachingDeadline,
        stale_trust_balances: staleTrustBalances,
        holds_past_release: holdsPastRelease,
        pending_disbursements_over_48h: pendingDisbursements,
        trust_balance_anomalies: anomalies,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getTrustComplianceDashboard'
    return { success: false, error: message }
  }
}

/**
 * Get firm-wide KPI scorecard for a given period.
 *
 * Aggregates revenue, receivables, utilisation, trust compliance, matter pipeline,
 * collection rate, and WIP value with prior-period comparison.
 */
export async function getKpiScorecard(
  auth: AuthContext,
  period: KpiPeriodParams,
): Promise<ServiceResult<KpiScorecardData>> {
  try {
    const client = auth.supabase

    // Run all queries in parallel for performance
    const [
      currentInvoicesResult,
      priorInvoicesResult,
      outstandingResult,
      timeEntriesResult,
      wipResult,
      mattersResult,
      trustAccountsResult,
      holdsResult,
    ] = await Promise.all([
      // Current-period invoices (collected revenue)
      client
        .from('invoices')
        .select('total_amount, amount_paid, status, issue_date')
        .eq('tenant_id', auth.tenantId)
        .gte('issue_date', period.start_date)
        .lte('issue_date', period.end_date),

      // Prior-period invoices
      client
        .from('invoices')
        .select('amount_paid')
        .eq('tenant_id', auth.tenantId)
        .gte('issue_date', period.prior_start_date)
        .lte('issue_date', period.prior_end_date),

      // FIXED: was querying 'balance_due'/'total'  -  corrected to compute from total_amount - amount_paid
      // Outstanding invoices (for receivables)
      client
        .from('invoices')
        .select('total_amount, amount_paid, due_date')
        .eq('tenant_id', auth.tenantId)
        .not('status', 'in', '("paid","cancelled","draft")'),

      // Time entries for utilisation
      client
        .from('time_entries')
        .select('duration_minutes, is_billable, user_id')
        .eq('tenant_id', auth.tenantId)
        .gte('date', period.start_date)
        .lte('date', period.end_date),

      // WIP: billable but not invoiced
      client
        .from('time_entries')
        .select('duration_minutes, hourly_rate')
        .eq('tenant_id', auth.tenantId)
        .eq('is_billable', true)
        .eq('is_invoiced', false),

      // Matters opened/closed in period  -  exclude import_reverted so pipeline counts are not inflated
      client
        .from('matters')
        .select('id, status, created_at, closed_at')
        .eq('tenant_id', auth.tenantId)
        .neq('status', 'import_reverted'),

      // Trust accounts needing reconciliation
      (client as any)
        .from('trust_bank_accounts')
        .select('id')
        .eq('tenant_id', auth.tenantId),

      // Active holds count
      (client as any)
        .from('trust_holds')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'held'),
    ])

    // ── Revenue ──────────────────────────────────────────────────────────────
    const now = new Date()
    const yearStart = `${now.getFullYear()}-01-01`
    const quarterStart = `${now.getFullYear()}-${String(Math.floor(now.getMonth() / 3) * 3 + 1).padStart(2, '0')}-01`
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    let mtd = 0, qtd = 0, ytd = 0
    for (const inv of currentInvoicesResult.data ?? []) {
      const cents = Math.round((Number((inv as any).amount_paid) || 0) * 100)
      const d = (inv as any).issue_date
      if (d >= monthStart) mtd += cents
      if (d >= quarterStart) qtd += cents
      if (d >= yearStart) ytd += cents
    }

    const priorCents = (priorInvoicesResult.data ?? []).reduce(
      (s: number, inv: any) => s + Math.round((Number(inv.amount_paid) || 0) * 100),
      0,
    )
    const currentCents = (currentInvoicesResult.data ?? []).reduce(
      (s: number, inv: any) => s + Math.round((Number((inv as any).amount_paid) || 0) * 100),
      0,
    )
    const changePct = priorCents > 0 ? Math.round((((currentCents - priorCents) / priorCents) * 100) * 100) / 100 : 0

    // ── Receivables ──────────────────────────────────────────────────────────
    let totalOutstanding = 0
    const agingMap = new Map<AgingBucket, number>()
    for (const b of ['current', '31_60', '61_90', '91_120', '120_plus'] as AgingBucket[]) {
      agingMap.set(b, 0)
    }
    for (const inv of outstandingResult.data ?? []) {
      const balanceCents = Math.round(Math.max(0, (Number((inv as any).total_amount) || 0) - (Number((inv as any).amount_paid) || 0)) * 100)
      totalOutstanding += balanceCents
      const daysOverdue = (inv as any).due_date ? Math.max(0, daysBetween((inv as any).due_date, now)) : 0
      const bucket = computeAgingBucket(daysOverdue)
      agingMap.set(bucket, (agingMap.get(bucket) ?? 0) + balanceCents)
    }

    const agingSummary = (['current', '31_60', '61_90', '91_120', '120_plus'] as AgingBucket[]).map((b) => ({
      bucket: b,
      total_cents: agingMap.get(b) ?? 0,
    }))

    // ── Utilisation ──────────────────────────────────────────────────────────
    let totalBillableMinutes = 0
    let totalMinutes = 0
    for (const te of timeEntriesResult.data ?? []) {
      const minutes = Number((te as any).duration_minutes) || 0
      totalMinutes += minutes
      if ((te as any).is_billable) totalBillableMinutes += minutes
    }
    const utilisationRate = totalMinutes > 0 ? Math.round(((totalBillableMinutes / totalMinutes) * 100) * 100) / 100 : 0

    // ── Trust Compliance ─────────────────────────────────────────────────────
    // Count accounts needing reconciliation (> 25 days since last)
    let accountsNeedingRecon = 0
    const trustAccountIds = (trustAccountsResult.data ?? []).map((a: any) => a.id)
    if (trustAccountIds.length > 0) {
      const { data: recons } = await (client as any)
        .from('trust_reconciliations')
        .select('trust_account_id, reconciliation_date')
        .eq('tenant_id', auth.tenantId)
        .order('reconciliation_date', { ascending: false })

      const latestRecon = new Map<string, string>()
      for (const r of recons ?? []) {
        if (!latestRecon.has(r.trust_account_id)) {
          latestRecon.set(r.trust_account_id, r.reconciliation_date)
        }
      }

      for (const accId of trustAccountIds) {
        const lastDate = latestRecon.get(accId)
        if (!lastDate || daysBetween(lastDate, now) > 25) {
          accountsNeedingRecon++
        }
      }
    }

    const activeHoldsCount = holdsResult.count ?? 0

    // ── Matter Pipeline ──────────────────────────────────────────────────────
    let newMatters = 0
    let closedMatters = 0
    let totalDaysToClose = 0
    let closedWithDates = 0

    for (const m of mattersResult.data ?? []) {
      const entry = m as any
      if (entry.created_at >= period.start_date && entry.created_at <= period.end_date) {
        newMatters++
      }
      if (entry.closed_at && entry.closed_at >= period.start_date && entry.closed_at <= period.end_date) {
        closedMatters++
        const daysOpen = daysBetween(entry.created_at, new Date(entry.closed_at))
        if (daysOpen >= 0) {
          totalDaysToClose += daysOpen
          closedWithDates++
        }
      }
    }

    const avgDaysToClose = closedWithDates > 0 ? Math.round(totalDaysToClose / closedWithDates) : 0

    // FIXED: was querying 'balance_due'/'total'  -  corrected to compute from total_amount - amount_paid
    // ── Collection Rate ──────────────────────────────────────────────────────
    const billedCents = (currentInvoicesResult.data ?? []).reduce((s: number, inv: any) => {
      if (['sent', 'paid', 'overdue'].includes(inv.status)) {
        return s + Math.round((Number(inv.total_amount) || 0) * 100)
      }
      return s
    }, 0)
    const collectionRate = billedCents > 0 ? Math.round(((currentCents / billedCents) * 100) * 100) / 100 : 0

    // ── WIP Value ────────────────────────────────────────────────────────────
    const wipCents = (wipResult.data ?? []).reduce((s: number, te: any) => {
      const minutes = Number(te.duration_minutes) || 0
      const rate = Number(te.hourly_rate) || 0
      return s + Math.round((minutes / 60) * rate * 100)
    }, 0)

    return {
      success: true,
      data: {
        revenue: {
          mtd_cents: mtd,
          qtd_cents: qtd,
          ytd_cents: ytd,
          prior_period_cents: priorCents,
          change_pct: changePct,
        },
        receivables: {
          total_outstanding_cents: totalOutstanding,
          aging_summary: agingSummary,
        },
        utilisation_rate: utilisationRate,
        trust_compliance: {
          accounts_needing_reconciliation: accountsNeedingRecon,
          active_holds_count: activeHoldsCount,
        },
        matter_pipeline: {
          new_matters: newMatters,
          closed_matters: closedMatters,
          avg_days_to_close: avgDaysToClose,
        },
        collection_rate: collectionRate,
        wip_value_cents: wipCents,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getKpiScorecard'
    return { success: false, error: message }
  }
}
