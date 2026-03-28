import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'

/**
 * POST /api/cron/snapshot-revenue
 *
 * Daily job that inserts a revenue_snapshots row per practice area per tenant.
 * Includes a firm-wide (practice_area_id = NULL) row for each tenant.
 *
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING. The unique index on
 * (tenant_id, snapshot_date, COALESCE(practice_area_id, '00000000-...')) prevents
 * duplicate snapshots. The immutability trigger on revenue_snapshots prevents
 * UPDATE/DELETE, so we only INSERT.
 *
 * Designed to be called by Vercel Cron (daily) or manually.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 */
async function handlePost(request: Request) {
  // Auth check  -  fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const stats = { tenant_count: 0, snapshots_created: 0 }

  try {
    // 1. Fetch all tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')

    if (tenantErr || !tenants) {
      log.error('[cron/snapshot-revenue] Failed to fetch tenants', {
        error_code: tenantErr?.code,
      })
      return NextResponse.json(
        { error: `Failed to fetch tenants: ${tenantErr?.message}` },
        { status: 500 }
      )
    }

    for (const tenant of tenants) {
      stats.tenant_count++

      try {
        // 2. Get all practice areas for this tenant (enabled or not  -  snapshot all)
        const { data: practiceAreas, error: paErr } = await supabase
          .from('practice_areas')
          .select('id')
          .eq('tenant_id', tenant.id)

        if (paErr) {
          log.error('[cron/snapshot-revenue] Failed to fetch practice areas', {
            tenant_id: tenant.id,
            error_code: paErr.code,
          })
          continue
        }

        // Build list: each practice area + null for firm-wide
        const practiceAreaIds: (string | null)[] = [
          null,
          ...(practiceAreas ?? []).map((pa) => pa.id),
        ]

        for (const paId of practiceAreaIds) {
          try {
            const snapshot = await computeSnapshot(supabase, tenant.id, paId, todayStr)

            // Plain INSERT  -  the unique index on
            // (tenant_id, snapshot_date, COALESCE(practice_area_id, '00000000-...'))
            // prevents duplicates. If a conflict occurs (re-run), Postgres raises 23505
            // which we treat as a no-op for idempotency.
            const { error: insertErr } = await supabase
              .from('revenue_snapshots')
              .insert(snapshot)

            if (insertErr) {
              // 23505 = unique_violation  -  expected on re-run, skip silently
              if (insertErr.code === '23505') {
                continue
              }
              log.error('[cron/snapshot-revenue] Failed to insert snapshot', {
                tenant_id: tenant.id,
                practice_area_id: paId,
                error_code: insertErr.code,
                error_message: insertErr.message,
              })
              continue
            }

            stats.snapshots_created++
          } catch (err) {
            log.error('[cron/snapshot-revenue] Snapshot computation error', {
              tenant_id: tenant.id,
              practice_area_id: paId,
              error: String(err),
            })
          }
        }
      } catch (err) {
        log.error('[cron/snapshot-revenue] Tenant processing error', {
          tenant_id: tenant.id,
          error: String(err),
        })
      }
    }

    log.info('[cron/snapshot-revenue] Completed', {
      tenant_count: stats.tenant_count,
      snapshots_created: stats.snapshots_created,
    })

    return NextResponse.json({
      success: true,
      processedAt: todayStr,
      stats,
    })
  } catch (error) {
    console.error('Revenue snapshot cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Batch size for paginated matter fetches and .in() filter chunking.
 * Supabase/PostgREST has practical limits on query size; 500 keeps us safe.
 */
const BATCH_SIZE = 500

/**
 * Fetch all IDs from a table with pagination to avoid unbounded selects.
 * Returns a flat array of IDs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllIdsPaginated<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryBuilder: any,
): Promise<string[]> {
  const ids: string[] = []
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await queryBuilder.range(offset, offset + BATCH_SIZE - 1)
    const batch: T[] = data ?? []
    for (const row of batch) {
      ids.push(row.id)
    }
    if (batch.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return ids
}

/**
 * Split an array into chunks of the given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Compute a single revenue snapshot for a tenant + practice area combination.
 *
 * When practiceAreaId is null, computes firm-wide totals (all practice areas).
 * Amounts in DB are numeric (dollars); we multiply by 100 and round for cents.
 *
 * All matter/invoice fetches are paginated in batches of BATCH_SIZE to prevent
 * memory exhaustion at scale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeSnapshot(supabase: any, tenantId: string, practiceAreaId: string | null, snapshotDate: string) {
  // ── Helper: get matter IDs for this practice area (or all) ────────────
  let matterIds: string[] | null = null // null = no filter (firm-wide)

  if (practiceAreaId !== null) {
    matterIds = await fetchAllIdsPaginated(
      supabase
        .from('matters')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('practice_area_id', practiceAreaId)
        .neq('status', IMPORT_REVERTED_STATUS)
    )
  }

  // ── total_billed_cents: SUM(invoices.total_amount) WHERE status IN ('sent','paid','overdue') ──
  if (matterIds !== null && matterIds.length === 0) {
    return buildEmptySnapshot(tenantId, snapshotDate, practiceAreaId)
  }

  let totalBilledDollars = 0

  if (matterIds !== null) {
    // Process in chunks to avoid oversized .in() clauses
    for (const matterBatch of chunk(matterIds, BATCH_SIZE)) {
      let offset = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('invoices')
          .select('total_amount')
          .eq('tenant_id', tenantId)
          .in('status', ['sent', 'paid', 'overdue'])
          .in('matter_id', matterBatch)
          .range(offset, offset + BATCH_SIZE - 1)

        const batch: { total_amount: number }[] = data ?? []
        for (const inv of batch) {
          totalBilledDollars += inv.total_amount ?? 0
        }
        if (batch.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }
  } else {
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .in('status', ['sent', 'paid', 'overdue'])
        .range(offset, offset + BATCH_SIZE - 1)

      const batch: { total_amount: number }[] = data ?? []
      for (const inv of batch) {
        totalBilledDollars += inv.total_amount ?? 0
      }
      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  const totalBilledCents = dollarsToCents(totalBilledDollars)

  // ── total_collected_cents: SUM(payments.amount) WHERE invoice.practice_area matches ──
  // Get invoice IDs for the practice area first, then sum payments on those invoices
  let invoiceIdsForPayments: string[] | null = null

  if (matterIds !== null) {
    invoiceIdsForPayments = []
    for (const matterBatch of chunk(matterIds, BATCH_SIZE)) {
      const batchIds = await fetchAllIdsPaginated(
        supabase
          .from('invoices')
          .select('id')
          .eq('tenant_id', tenantId)
          .in('matter_id', matterBatch)
      )
      invoiceIdsForPayments.push(...batchIds)
    }
  }

  let totalCollectedDollars = 0

  if (invoiceIdsForPayments !== null) {
    if (invoiceIdsForPayments.length === 0) {
      return buildEmptySnapshot(tenantId, snapshotDate, practiceAreaId)
    }
    for (const invoiceBatch of chunk(invoiceIdsForPayments, BATCH_SIZE)) {
      let offset = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('payments')
          .select('amount')
          .eq('tenant_id', tenantId)
          .in('invoice_id', invoiceBatch)
          .range(offset, offset + BATCH_SIZE - 1)

        const batch: { amount: number }[] = data ?? []
        for (const p of batch) {
          totalCollectedDollars += p.amount ?? 0
        }
        if (batch.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }
  } else {
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('payments')
        .select('amount')
        .eq('tenant_id', tenantId)
        .range(offset, offset + BATCH_SIZE - 1)

      const batch: { amount: number }[] = data ?? []
      for (const p of batch) {
        totalCollectedDollars += p.amount ?? 0
      }
      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  const totalCollectedCents = dollarsToCents(totalCollectedDollars)

  // ── total_wip_cents: SUM(time_entries amount) WHERE is_billable=true AND is_billed=false ──
  // time_entries has duration_minutes and hourly_rate, amount = (duration_minutes / 60) * hourly_rate
  let totalWipDollars = 0

  if (matterIds !== null) {
    for (const matterBatch of chunk(matterIds, BATCH_SIZE)) {
      let offset = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('time_entries')
          .select('duration_minutes, hourly_rate')
          .eq('tenant_id', tenantId)
          .eq('is_billable', true)
          .eq('is_invoiced', false)
          .in('matter_id', matterBatch)
          .range(offset, offset + BATCH_SIZE - 1)

        const batch: { duration_minutes: number; hourly_rate: number | null }[] = data ?? []
        for (const te of batch) {
          const rate = te.hourly_rate ?? 0
          totalWipDollars += (te.duration_minutes / 60) * rate
        }
        if (batch.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }
  } else {
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('time_entries')
        .select('duration_minutes, hourly_rate')
        .eq('tenant_id', tenantId)
        .eq('is_billable', true)
        .eq('is_invoiced', false)
        .range(offset, offset + BATCH_SIZE - 1)

      const batch: { duration_minutes: number; hourly_rate: number | null }[] = data ?? []
      for (const te of batch) {
        const rate = te.hourly_rate ?? 0
        totalWipDollars += (te.duration_minutes / 60) * rate
      }
      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  const totalWipCents = dollarsToCents(totalWipDollars)

  // ── total_outstanding_cents: SUM(invoices balance_due) WHERE status IN ('sent','overdue') ──
  // balance_due = total_amount - amount_paid
  let totalOutstandingDollars = 0

  if (matterIds !== null) {
    for (const matterBatch of chunk(matterIds, BATCH_SIZE)) {
      let offset = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from('invoices')
          .select('total_amount, amount_paid')
          .eq('tenant_id', tenantId)
          .in('status', ['sent', 'overdue'])
          .in('matter_id', matterBatch)
          .range(offset, offset + BATCH_SIZE - 1)

        const batch: { total_amount: number; amount_paid: number }[] = data ?? []
        for (const inv of batch) {
          totalOutstandingDollars += (inv.total_amount ?? 0) - (inv.amount_paid ?? 0)
        }
        if (batch.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }
  } else {
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid')
        .eq('tenant_id', tenantId)
        .in('status', ['sent', 'overdue'])
        .range(offset, offset + BATCH_SIZE - 1)

      const batch: { total_amount: number; amount_paid: number }[] = data ?? []
      for (const inv of batch) {
        totalOutstandingDollars += (inv.total_amount ?? 0) - (inv.amount_paid ?? 0)
      }
      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  const totalOutstandingCents = dollarsToCents(totalOutstandingDollars)

  // ── matter_count and active_matter_count ──────────────────────────────
  let matterCount = 0
  let activeMatterCount = 0
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase
      .from('matters')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .neq('status', IMPORT_REVERTED_STATUS)

    if (practiceAreaId !== null) {
      q = q.eq('practice_area_id', practiceAreaId)
    }

    const { data } = await q.range(offset, offset + BATCH_SIZE - 1)
    const batch: { id: string; status: string }[] = data ?? []

    matterCount += batch.length
    for (const m of batch) {
      if (m.status === 'active') activeMatterCount++
    }

    if (batch.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return {
    tenant_id: tenantId,
    snapshot_date: snapshotDate,
    practice_area_id: practiceAreaId,
    total_billed_cents: totalBilledCents,
    total_collected_cents: totalCollectedCents,
    total_wip_cents: totalWipCents,
    total_outstanding_cents: totalOutstandingCents,
    matter_count: matterCount,
    active_matter_count: activeMatterCount,
  }
}

function buildEmptySnapshot(tenantId: string, snapshotDate: string, practiceAreaId: string | null) {
  return {
    tenant_id: tenantId,
    snapshot_date: snapshotDate,
    practice_area_id: practiceAreaId,
    total_billed_cents: 0,
    total_collected_cents: 0,
    total_wip_cents: 0,
    total_outstanding_cents: 0,
    matter_count: 0,
    active_matter_count: 0,
  }
}

/** Convert a dollar amount (numeric) to integer cents, rounding to nearest. */
function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export const POST = withTiming(handlePost, 'POST /api/cron/snapshot-revenue')
