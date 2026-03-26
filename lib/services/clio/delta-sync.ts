/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Clio Delta-Sync Engine (Directive 5.3)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Background polling service that stays connected to the Clio API for 7 days
 * post-migration. If a new document, note, or trust entry appears in Clio,
 * the Norva Bridge "teleports" it to the Vault automatically.
 *
 * Architecture:
 *   - One session per tenant (delta_sync_sessions table)
 *   - Cron-triggered polling every 2 minutes (configurable)
 *   - Watermark-based incremental fetch (updated_at > last watermark)
 *   - Each poll cycle is logged as a delta_sync_run for observability
 *
 * Entity types synced:
 *   - notes → activities table (Norva Timeline)
 *   - documents → documents table (metadata only  -  file download TBD)
 *   - trust_line_items → trust_transactions (Norva Ledger)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioFetch } from './client'
import { log } from '@/lib/utils/logger'
import { classifyDocument } from '@/lib/services/document-classifier'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncEntityType = 'notes' | 'documents' | 'trust_line_items'

interface DeltaSyncSession {
  id: string
  tenant_id: string
  connection_id: string
  platform: string
  status: string
  poll_interval_seconds: number
  entity_types: string[]
  watermarks: Record<string, string>
  expires_at: string
  total_synced: number
  total_errors: number
}

interface SyncRunResult {
  entityType: SyncEntityType
  itemsFetched: number
  itemsCreated: number
  itemsUpdated: number
  itemsSkipped: number
  newWatermark: string | null
  error?: string
}

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Start a new delta-sync session for a tenant's Clio connection.
 * Returns the session ID. Fails if an active session already exists.
 */
export async function startDeltaSyncSession(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    connectionId: string
    userId: string
    pollIntervalSeconds?: number
    entityTypes?: SyncEntityType[]
    durationDays?: number
  },
): Promise<{ sessionId: string }> {
  const {
    tenantId,
    connectionId,
    userId,
    pollIntervalSeconds = 120,
    entityTypes = ['notes', 'documents', 'trust_line_items'],
    durationDays = 7,
  } = params

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + durationDays)

  // Initialize watermarks to "now"  -  only sync items created AFTER migration start
  const watermarks: Record<string, string> = {}
  for (const et of entityTypes) {
    watermarks[et] = new Date().toISOString()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('delta_sync_sessions')
    .insert({
      tenant_id: tenantId,
      connection_id: connectionId,
      platform: 'clio',
      status: 'active',
      poll_interval_seconds: pollIntervalSeconds,
      entity_types: entityTypes,
      watermarks,
      expires_at: expiresAt.toISOString(),
      started_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('A delta-sync session is already active for this tenant.')
    }
    throw error
  }

  log.info('delta_sync.session_started', {
    tenant_id: tenantId,
    session_id: data.id,
    entity_types: entityTypes.join(','),
    expires_at: expiresAt.toISOString(),
  })

  return { sessionId: data.id }
}

/**
 * Stop (complete) an active delta-sync session.
 */
export async function stopDeltaSyncSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  tenantId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('delta_sync_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)

  log.info('delta_sync.session_stopped', { session_id: sessionId })
}

/**
 * Get the active delta-sync session for a tenant.
 */
export async function getActiveSyncSession(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<DeltaSyncSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('delta_sync_sessions')
    .select('id, tenant_id, connection_id, platform, status, poll_interval_seconds, entity_types, watermarks, expires_at, total_synced, total_errors')
    .eq('tenant_id', tenantId)
    .eq('platform', 'clio')
    .eq('status', 'active')
    .maybeSingle()

  return data as DeltaSyncSession | null
}

// ─── Poll Execution ──────────────────────────────────────────────────────────

/**
 * Execute a single poll cycle for all entity types in a session.
 * Called by the cron endpoint every N seconds.
 */
export async function executePollCycle(
  supabase: SupabaseClient<Database>,
  session: DeltaSyncSession,
): Promise<SyncRunResult[]> {
  const results: SyncRunResult[] = []

  // Check if session has expired
  if (new Date(session.expires_at) < new Date()) {
    await stopDeltaSyncSession(supabase, session.id, session.tenant_id)
    log.info('delta_sync.session_expired', { session_id: session.id })
    return results
  }

  for (const entityType of session.entity_types as SyncEntityType[]) {
    const watermark = session.watermarks[entityType] ?? new Date(0).toISOString()
    const runStart = Date.now()

    // Create run log entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: run } = await (supabase as any)
      .from('delta_sync_runs')
      .insert({
        session_id: session.id,
        tenant_id: session.tenant_id,
        entity_type: entityType,
        status: 'running',
        previous_watermark: watermark,
      })
      .select('id')
      .single()

    try {
      const result = await syncEntityType(
        supabase,
        session.connection_id,
        session.tenant_id,
        entityType,
        watermark,
      )

      results.push(result)

      // Update run log
      if (run) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('delta_sync_runs')
          .update({
            status: 'completed',
            items_fetched: result.itemsFetched,
            items_created: result.itemsCreated,
            items_updated: result.itemsUpdated,
            items_skipped: result.itemsSkipped,
            new_watermark: result.newWatermark,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - runStart,
          })
          .eq('id', run.id)
      }

      // Advance watermark if we got new data
      if (result.newWatermark) {
        const updatedWatermarks = { ...session.watermarks, [entityType]: result.newWatermark }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('delta_sync_sessions')
          .update({
            watermarks: updatedWatermarks,
            last_poll_at: new Date().toISOString(),
            total_synced: session.total_synced + result.itemsCreated + result.itemsUpdated,
          })
          .eq('id', session.id)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'

      results.push({
        entityType,
        itemsFetched: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        newWatermark: null,
        error: errorMsg,
      })

      // Update run log with error
      if (run) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('delta_sync_runs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - runStart,
          })
          .eq('id', run.id)
      }

      // Update session error count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('delta_sync_sessions')
        .update({
          total_errors: session.total_errors + 1,
          last_error: errorMsg,
          last_error_at: new Date().toISOString(),
          last_poll_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      log.error('delta_sync.entity_sync_failed', {
        session_id: session.id,
        entity_type: entityType,
        error: errorMsg,
      })
    }
  }

  return results
}

// ─── Per-Entity Sync Logic ───────────────────────────────────────────────────

async function syncEntityType(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  tenantId: string,
  entityType: SyncEntityType,
  watermark: string,
): Promise<SyncRunResult> {
  switch (entityType) {
    case 'notes':
      return syncNotes(supabase, connectionId, tenantId, watermark)
    case 'documents':
      return syncDocuments(supabase, connectionId, tenantId, watermark)
    case 'trust_line_items':
      return syncTrustLineItems(supabase, connectionId, tenantId, watermark)
    default:
      return { entityType, itemsFetched: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, newWatermark: null }
  }
}

/**
 * Sync notes from Clio → Norva Timeline (activities table)
 */
async function syncNotes(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  tenantId: string,
  watermark: string,
): Promise<SyncRunResult> {
  const result: SyncRunResult = {
    entityType: 'notes',
    itemsFetched: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    newWatermark: null,
  }

  // Fetch notes updated after watermark
  const response = await clioFetch<{
    data: Array<{
      id: number
      subject?: string
      detail?: string
      type?: string
      date?: string
      regarding?: { id: number; type: string; name?: string }
      created_at?: string
      updated_at?: string
    }>
  }>(connectionId, supabase, 'notes', {
    fields: ['id', 'subject', 'detail', 'type', 'date', 'regarding', 'created_at', 'updated_at'],
    params: {
      updated_since: watermark,
      order: 'updated_at(asc)',
      limit: '200',
    },
  })

  const notes = response.data ?? []
  result.itemsFetched = notes.length

  if (notes.length === 0) return result

  let latestUpdatedAt = watermark

  for (const note of notes) {
    // Track the latest updated_at for watermark advancement
    if (note.updated_at && note.updated_at > latestUpdatedAt) {
      latestUpdatedAt = note.updated_at
    }

    // Resolve the matter ID from Clio regarding → Norva matter
    let matterId: string | null = null
    if (note.regarding?.type === 'Matter' && note.regarding.id) {
      const { data: matter } = await supabase
        .from('matters')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('clio_id', String(note.regarding.id))
        .maybeSingle()
      matterId = matter?.id ?? null
    }

    // Check if this note was already synced (idempotent via clio source ID)
    const sourceKey = `clio_note_${note.id}`
    const { data: existing } = await supabase
      .from('activities')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_key', sourceKey)
      .maybeSingle()

    if (existing) {
      result.itemsSkipped++
      continue
    }

    // Insert into activities (Norva Timeline)
    const { error: insertError } = await supabase
      .from('activities')
      .insert({
        tenant_id: tenantId,
        activity_type: 'note',
        title: note.subject || 'Note from Clio',
        description: note.detail ?? null,
        entity_type: matterId ? 'matter' : 'general',
        entity_id: matterId ?? tenantId,
        source_key: sourceKey,
        metadata: {
          clio_id: note.id,
          clio_type: note.type,
          clio_date: note.date,
          synced_via: 'delta_sync',
        },
      })

    if (insertError) {
      log.warn('delta_sync.note_insert_failed', { clio_id: note.id, error: insertError.message })
      result.itemsSkipped++
    } else {
      result.itemsCreated++
    }
  }

  result.newWatermark = latestUpdatedAt
  return result
}

/**
 * Sync documents from Clio → Norva documents table (metadata)
 */
async function syncDocuments(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  tenantId: string,
  watermark: string,
): Promise<SyncRunResult> {
  const result: SyncRunResult = {
    entityType: 'documents',
    itemsFetched: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    newWatermark: null,
  }

  const response = await clioFetch<{
    data: Array<{
      id: number
      name?: string
      content_type?: string
      matter?: { id: number; display_number: string }
      created_at?: string
      updated_at?: string
    }>
  }>(connectionId, supabase, 'documents', {
    fields: ['id', 'name', 'content_type', 'matter', 'created_at', 'updated_at'],
    params: {
      updated_since: watermark,
      order: 'updated_at(asc)',
      limit: '200',
    },
  })

  const docs = response.data ?? []
  result.itemsFetched = docs.length

  if (docs.length === 0) return result

  let latestUpdatedAt = watermark

  for (const doc of docs) {
    if (doc.updated_at && doc.updated_at > latestUpdatedAt) {
      latestUpdatedAt = doc.updated_at
    }

    // Resolve Clio matter → Norva matter
    let matterId: string | null = null
    if (doc.matter?.id) {
      const { data: matter } = await supabase
        .from('matters')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('clio_id', String(doc.matter.id))
        .maybeSingle()
      matterId = matter?.id ?? null
    }

    // Idempotency check
    const sourceKey = `clio_doc_${doc.id}`
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_key', sourceKey)
      .maybeSingle()

    if (existing) {
      result.itemsSkipped++
      continue
    }

    // Auto-classify the document before insert (Directive 5.4)
    const classification = await classifyDocument(doc.name || 'Untitled')

    // Insert document metadata with classification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertError } = await (supabase as any)
      .from('documents')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        file_name: classification.suggestedName || doc.name || 'Untitled',
        file_type: doc.content_type ?? 'application/octet-stream',
        category: classification.category,
        source_key: sourceKey,
        status: classification.confidence >= 0.7 ? 'classified' : 'pending_classification',
        metadata: {
          clio_id: doc.id,
          synced_via: 'delta_sync',
          original_name: doc.name,
          classification: {
            category: classification.category,
            type: classification.type,
            confidence: classification.confidence,
            method: classification.method,
            classified_at: new Date().toISOString(),
          },
        },
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      log.warn('delta_sync.doc_insert_failed', { clio_id: doc.id, error: insertError.message })
      result.itemsSkipped++
    } else {
      result.itemsCreated++
      if (inserted) {
        log.info('delta_sync.doc_classified', {
          doc_id: inserted.id,
          category: classification.category,
          type: classification.type,
          confidence: classification.confidence,
          method: classification.method,
        })
      }
    }
  }

  result.newWatermark = latestUpdatedAt
  return result
}

/**
 * Sync trust line items from Clio → Norva Ledger (trust_transactions)
 */
async function syncTrustLineItems(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  tenantId: string,
  watermark: string,
): Promise<SyncRunResult> {
  const result: SyncRunResult = {
    entityType: 'trust_line_items',
    itemsFetched: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    newWatermark: null,
  }

  let response: { data: Array<{
    id: number
    date?: string
    amount?: number
    type?: string
    note?: string
    matter?: { id: number }
    contact?: { id: number }
    created_at?: string
    updated_at?: string
  }> }

  try {
    response = await clioFetch(connectionId, supabase, 'trust_line_items', {
      fields: ['id', 'date', 'amount', 'type', 'note', 'matter', 'contact', 'created_at', 'updated_at'],
      params: {
        updated_since: watermark,
        order: 'updated_at(asc)',
        limit: '200',
      },
    })
  } catch {
    // trust_line_items endpoint may not be available
    return result
  }

  const items = response.data ?? []
  result.itemsFetched = items.length

  if (items.length === 0) return result

  let latestUpdatedAt = watermark

  for (const item of items) {
    if (item.updated_at && item.updated_at > latestUpdatedAt) {
      latestUpdatedAt = item.updated_at
    }

    if (!item.matter?.id || item.amount == null) {
      result.itemsSkipped++
      continue
    }

    // Resolve Clio matter → Norva matter
    const { data: matter } = await supabase
      .from('matters')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('clio_id', String(item.matter.id))
      .maybeSingle()

    if (!matter) {
      result.itemsSkipped++
      continue
    }

    // Idempotency check
    const sourceKey = `clio_trust_${item.id}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('trust_transactions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('reference_number', sourceKey)
      .maybeSingle()

    if (existing) {
      result.itemsSkipped++
      continue
    }

    // Determine transaction type from Clio type
    const isDeposit = item.amount > 0
    const transactionType = isDeposit ? 'deposit' : 'disbursement'

    // Get default trust account for tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: trustAccount } = await (supabase as any)
      .from('trust_bank_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!trustAccount) {
      result.itemsSkipped++
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('trust_transactions')
      .insert({
        tenant_id: tenantId,
        trust_account_id: trustAccount.id,
        matter_id: matter.id,
        transaction_type: transactionType,
        amount_cents: Math.round(Math.abs(item.amount) * 100),
        description: item.note || `Delta-sync from Clio (${transactionType})`,
        reference_number: sourceKey,
        payment_method: 'migration',
        is_cleared: true,
        effective_date: item.date ?? new Date().toISOString().split('T')[0],
      })

    if (insertError) {
      log.warn('delta_sync.trust_insert_failed', { clio_id: item.id, error: insertError.message })
      result.itemsSkipped++
    } else {
      result.itemsCreated++
    }
  }

  result.newWatermark = latestUpdatedAt
  return result
}
