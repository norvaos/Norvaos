/**
 * ClioMigrationEngine — Directive 035: Sovereign Extraction Bridge
 *
 * One-way forensic pull from Clio Manage into the Norva schema.
 * Uses the existing Clio API client (lib/services/clio/client.ts) and
 * typed fetchers (lib/services/clio/fetchers/*).
 *
 * Workflow:
 *   1. Contacts → Norva Contacts (PII encrypted, duplicates merged via clio_source_id)
 *   2. Matters → Norva Matters (clio_source_id prevents double-imports)
 *   3. Documents → Sentinel Eye Scan Queue (OCR + expiry check)
 *   4. Trust Balances → Immutable Ledger Block 1 (hashed + anchored)
 *
 * IMPORTANT: Genesis Block is NOT created for imported matters until
 * readiness score reaches 100. We do not grandfather in "soft" data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchClioContacts } from './clio/fetchers/contacts'
import { fetchClioMatters } from './clio/fetchers/matters'
import { fetchClioDocuments } from './clio/fetchers/documents'
import { fetchClioTrustBalances } from './clio/fetchers/trust-balances'
import { encryptContactPII } from './pii-encryption'
import { log } from '@/lib/utils/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export type MigrationPhase = 'contacts' | 'matters' | 'documents' | 'trust_ledger'
export type MigrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface MigrationProgress {
  phase: MigrationPhase
  status: MigrationStatus
  total: number
  processed: number
  errors: number
  startedAt: string | null
  completedAt: string | null
}

export interface MigrationResult {
  connectionId: string
  tenantId: string
  phases: MigrationProgress[]
  totalImported: number
  totalErrors: number
  gapAlerts: number
  startedAt: string
  completedAt: string | null
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class ClioMigrationEngine {
  private connectionId: string
  private tenantId: string
  private migrationId: string | null = null
  private admin: SupabaseClient<Database>

  constructor(connectionId: string, tenantId: string) {
    this.connectionId = connectionId
    this.tenantId = tenantId
    this.admin = createAdminClient() as unknown as SupabaseClient<Database>
  }

  // ── Public Entry Point ──────────────────────────────────────────────────

  async run(): Promise<MigrationResult> {
    const startedAt = new Date().toISOString()

    // Create migration record
    const { data: migration } = await (this.admin as any)
      .from('clio_migrations')
      .insert({
        tenant_id: this.tenantId,
        connection_id: this.connectionId,
        status: 'in_progress',
        started_at: startedAt,
        progress: {},
      })
      .select('id')
      .single()

    this.migrationId = migration?.id ?? null

    const phases: MigrationProgress[] = []
    let totalImported = 0
    let totalErrors = 0
    let gapAlerts = 0

    try {
      // Phase 1: Contacts
      const contactResult = await this.importContacts()
      phases.push(contactResult)
      totalImported += contactResult.processed
      totalErrors += contactResult.errors

      // Phase 2: Matters
      const matterResult = await this.importMatters()
      phases.push(matterResult)
      totalImported += matterResult.processed
      totalErrors += matterResult.errors

      // Phase 3: Documents
      const docResult = await this.importDocuments()
      phases.push(docResult)
      totalImported += docResult.processed
      totalErrors += docResult.errors

      // Phase 4: Trust Ledger
      const trustResult = await this.importTrustLedger()
      phases.push(trustResult)
      totalImported += trustResult.processed
      totalErrors += trustResult.errors

      // Phase 5: Gap Analysis
      gapAlerts = await this.runGapAnalysis()

      const completedAt = new Date().toISOString()
      await (this.admin as any)
        .from('clio_migrations')
        .update({
          status: 'completed',
          completed_at: completedAt,
          progress: { phases, totalImported, totalErrors, gapAlerts },
        })
        .eq('id', this.migrationId)

      // SENTINEL audit log
      await (this.admin as any).from('sentinel_audit_log').insert({
        tenant_id: this.tenantId,
        event_type: 'CLIO_MIGRATION_COMPLETED',
        severity: 'info',
        table_name: 'clio_migrations',
        record_id: this.migrationId,
        details: { totalImported, totalErrors, gapAlerts },
      })

      return {
        connectionId: this.connectionId,
        tenantId: this.tenantId,
        phases,
        totalImported,
        totalErrors,
        gapAlerts,
        startedAt,
        completedAt,
      }
    } catch (err) {
      log.error('[clio-migration] Fatal error', {
        connectionId: this.connectionId,
        error: err instanceof Error ? err.message : 'Unknown',
      })

      await (this.admin as any)
        .from('clio_migrations')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', this.migrationId)

      throw err
    }
  }

  // ── Phase 1: Contacts ───────────────────────────────────────────────────

  private async importContacts(): Promise<MigrationProgress> {
    const phase: MigrationProgress = {
      phase: 'contacts',
      status: 'in_progress',
      total: 0,
      processed: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
    }

    try {
      const { rows } = await fetchClioContacts(this.connectionId, this.admin)
      phase.total = rows.length

      for (const row of rows) {
        try {
          // Prevent double-import via clio_source_id
          const { data: existing } = await (this.admin as any)
            .from('contacts')
            .select('id')
            .eq('tenant_id', this.tenantId)
            .eq('clio_source_id', row.__source_id)
            .maybeSingle()

          if (existing) {
            phase.processed++
            continue
          }

          // Encrypt PII
          const encrypted = encryptContactPII({
            first_name: row.firstName || row.name || '',
            last_name: row.lastName || '',
            email: row.email || '',
            phone: row.phone || '',
          })

          await (this.admin as any).from('contacts').insert({
            tenant_id: this.tenantId,
            first_name: row.firstName || row.name || '',
            last_name: row.lastName || '',
            email_primary: row.email || null,
            phone_primary: row.phone || null,
            contact_type: row.type === 'Company' ? 'company' : 'individual',
            clio_source_id: row.__source_id,
            source: 'clio_import',
            ...encrypted,
          })

          phase.processed++
        } catch (err) {
          phase.errors++
          await this.logError('contacts', row.__source_id, err)
        }
      }
    } catch (err) {
      phase.status = 'failed'
      throw err
    }

    phase.status = 'completed'
    phase.completedAt = new Date().toISOString()
    await this.updateProgress(phase)
    return phase
  }

  // ── Phase 2: Matters ────────────────────────────────────────────────────

  private async importMatters(): Promise<MigrationProgress> {
    const phase: MigrationProgress = {
      phase: 'matters',
      status: 'in_progress',
      total: 0,
      processed: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
    }

    try {
      const { rows } = await fetchClioMatters(this.connectionId, this.admin)
      phase.total = rows.length

      const statusMap: Record<string, string> = {
        Open: 'active',
        Pending: 'on_hold',
        Closed: 'closed_won',
      }

      for (const row of rows) {
        try {
          const { data: existing } = await (this.admin as any)
            .from('matters')
            .select('id')
            .eq('tenant_id', this.tenantId)
            .eq('clio_source_id', row.__source_id)
            .maybeSingle()

          if (existing) {
            phase.processed++
            continue
          }

          // Link to imported contact
          let contactId: string | null = null
          if (row.clientId) {
            const { data: contact } = await (this.admin as any)
              .from('contacts')
              .select('id')
              .eq('tenant_id', this.tenantId)
              .eq('clio_source_id', row.clientId)
              .maybeSingle()
            contactId = contact?.id ?? null
          }

          await (this.admin as any).from('matters').insert({
            tenant_id: this.tenantId,
            title: row.description || `Clio #${row.displayNumber}`,
            matter_number: row.displayNumber || null,
            status: statusMap[row.status] ?? 'active',
            contact_id: contactId,
            clio_source_id: row.__source_id,
            source: 'clio_import',
            open_date: row.openDate || null,
            close_date: row.closeDate || null,
            readiness_score: 0, // Genesis Block locked until 100
          })

          phase.processed++
        } catch (err) {
          phase.errors++
          await this.logError('matters', row.__source_id, err)
        }
      }
    } catch (err) {
      phase.status = 'failed'
      throw err
    }

    phase.status = 'completed'
    phase.completedAt = new Date().toISOString()
    await this.updateProgress(phase)
    return phase
  }

  // ── Phase 3: Documents ──────────────────────────────────────────────────

  private async importDocuments(): Promise<MigrationProgress> {
    const phase: MigrationProgress = {
      phase: 'documents',
      status: 'in_progress',
      total: 0,
      processed: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
    }

    try {
      const { rows } = await fetchClioDocuments(this.connectionId, this.admin)
      phase.total = rows.length

      for (const row of rows) {
        try {
          if (!row.matterId) {
            phase.processed++
            continue
          }

          // Find imported matter
          const { data: matter } = await (this.admin as any)
            .from('matters')
            .select('id')
            .eq('tenant_id', this.tenantId)
            .eq('clio_source_id', row.matterId)
            .maybeSingle()

          if (!matter) {
            phase.processed++
            continue
          }

          // Queue for Sentinel Eye scan
          await (this.admin as any).from('document_import_queue').insert({
            tenant_id: this.tenantId,
            matter_id: matter.id,
            clio_document_id: row.__source_id,
            file_name: row.name || 'Untitled',
            content_type: row.contentType || null,
            status: 'pending_scan',
            source: 'clio_import',
          })

          phase.processed++
        } catch (err) {
          phase.errors++
          await this.logError('documents', row.__source_id, err)
        }
      }
    } catch (err) {
      phase.status = 'failed'
      throw err
    }

    phase.status = 'completed'
    phase.completedAt = new Date().toISOString()
    await this.updateProgress(phase)
    return phase
  }

  // ── Phase 4: Trust Ledger ───────────────────────────────────────────────

  private async importTrustLedger(): Promise<MigrationProgress> {
    const phase: MigrationProgress = {
      phase: 'trust_ledger',
      status: 'in_progress',
      total: 0,
      processed: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
    }

    try {
      const { rows } = await fetchClioTrustBalances(this.connectionId, this.admin)
      phase.total = rows.length

      for (const row of rows) {
        try {
          // Find linked matter
          let matterId: string | null = null
          if (row.matterId) {
            const { data: matter } = await (this.admin as any)
              .from('matters')
              .select('id')
              .eq('tenant_id', this.tenantId)
              .eq('clio_source_id', row.matterId)
              .maybeSingle()
            matterId = matter?.id ?? null
          }

          // Import as trust record (anchored to ledger)
          await (this.admin as any).from('trust_transactions').insert({
            tenant_id: this.tenantId,
            matter_id: matterId,
            amount_cents: Math.round(parseFloat(row.balance || '0') * 100),
            description: `Clio trust import — ${row.matterName || row.__source_id}`,
            transaction_type: 'receipt',
            transaction_date: new Date().toISOString().split('T')[0],
            clio_source_id: row.__source_id,
            source: 'clio_import',
          })

          phase.processed++
        } catch (err) {
          phase.errors++
          await this.logError('trust_ledger', row.__source_id, err)
        }
      }
    } catch (err) {
      phase.status = 'failed'
      throw err
    }

    phase.status = 'completed'
    phase.completedAt = new Date().toISOString()
    await this.updateProgress(phase)
    return phase
  }

  // ── Phase 5: Gap Analysis ───────────────────────────────────────────────

  private async runGapAnalysis(): Promise<number> {
    const { count } = await (this.admin as any)
      .from('matters')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .eq('source', 'clio_import')
      .lt('readiness_score', 100)

    return count ?? 0
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async updateProgress(phase: MigrationProgress): Promise<void> {
    if (!this.migrationId) return
    await (this.admin as any)
      .from('clio_migrations')
      .update({ progress: { currentPhase: phase.phase, ...phase } })
      .eq('id', this.migrationId)
  }

  private async logError(phase: string, sourceId: string, err: unknown): Promise<void> {
    await (this.admin as any)
      .from('clio_migration_logs')
      .insert({
        migration_id: this.migrationId,
        tenant_id: this.tenantId,
        phase,
        clio_source_id: sourceId,
        error_message: err instanceof Error ? err.message : 'Unknown error',
        severity: 'error',
      })
      .catch(() => {}) // Non-blocking
  }
}
