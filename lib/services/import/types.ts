/**
 * Shared types for the data import engine.
 *
 * Used across adapters, the import engine, API routes, and UI components.
 */

export type SourcePlatform = 'ghl' | 'clio' | 'officio'

export type ImportEntityType =
  | 'contacts'
  | 'leads'
  | 'matters'
  | 'tasks'
  | 'notes'
  | 'documents'
  | 'time_entries'
  | 'pipeline_stages'
  | 'calendar_events'
  | 'conversations'
  | 'tags'
  | 'custom_fields'
  | 'invoices'
  | 'companies'
  | 'forms'
  | 'payments'
  | 'surveys'
  | 'users'

export type BatchStatus =
  | 'pending'
  | 'validating'
  | 'importing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'rolled_back'

export type RecordStatus = 'pending' | 'succeeded' | 'failed' | 'skipped'

export type DuplicateStrategy = 'skip' | 'update' | 'create_new'

// ─── Platform Adapter Types ──────────────────────────────────────────────────

export interface FieldMapping {
  /** Expected CSV header name from the source platform */
  sourceColumn: string
  /** NorvaOS DB column name. Use '__source_id' for the row's unique identifier. */
  targetColumn: string
  /** Whether this field must be mapped for import to proceed */
  required: boolean
  /** Transform the raw CSV string value into the DB-ready value */
  transform?: (value: string, row: Record<string, string>) => unknown
  /** Default value when the source column is empty or unmapped */
  defaultValue?: unknown
  /** Alternative CSV header names to try during auto-detection (case-insensitive) */
  aliases?: string[]
}

export interface EntityAdapter {
  entityType: ImportEntityType
  /** NorvaOS table name (e.g. 'contacts', 'matters') */
  targetTable: string
  /** Display name shown in the wizard (e.g. "Contacts") */
  displayName: string
  /** Source-qualified name (e.g. "GHL Contacts") */
  sourceDisplayName: string
  /** Description shown in entity selection step */
  description: string
  /** Field mapping definitions */
  fieldMappings: FieldMapping[]
  /** Entity types that must be imported first */
  dependsOn?: ImportEntityType[]
  /** Custom row-level validation beyond field types */
  validate?: (row: Record<string, unknown>) => string[]
  /** Post-process an entire batch of rows before insert */
  postProcess?: (rows: Record<string, unknown>[]) => Record<string, unknown>[]
}

export interface PlatformAdapter {
  platform: SourcePlatform
  displayName: string
  description: string
  entities: EntityAdapter[]
  getEntityAdapter(entityType: ImportEntityType): EntityAdapter | undefined
}

// ─── Import Engine Types ─────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
  errors: { row: number; message: string }[]
}

export interface ColumnMapping {
  /** Maps source CSV header → target NorvaOS field */
  [sourceHeader: string]: string
}

export interface AutoMapResult {
  /** Successfully auto-mapped columns: source → target */
  mapped: Record<string, string>
  /** Source columns that could not be auto-mapped */
  unmapped: string[]
  /** Required target fields that are not yet mapped */
  missingRequired: string[]
}

export interface ValidationResult {
  validRows: number
  invalidRows: number
  duplicateRows: number
  errors: ImportError[]
  previewRows: Record<string, unknown>[]
}

export interface ImportError {
  rowNumber: number
  field?: string
  sourceValue?: string
  message: string
  severity: 'error' | 'warning'
}

export interface DuplicateResult {
  rowNumber: number
  matchedEntityId: string
  matchedOn: string
  confidence: 'exact' | 'likely'
}

export interface ImportProgress {
  batchId: string
  status: BatchStatus
  totalRows: number
  processedRows: number
  succeededRows: number
  failedRows: number
  skippedRows: number
}

export interface ImportResult {
  batchId: string
  status: BatchStatus
  totalRows: number
  succeededRows: number
  failedRows: number
  skippedRows: number
  errors: ImportError[]
  completedAt: string | null
}

// ─── Platform Info ───────────────────────────────────────────────────────────

export const PLATFORM_INFO: Record<SourcePlatform, { displayName: string; description: string }> = {
  ghl: {
    displayName: 'Go High Level',
    description: 'Import contacts, opportunities, calendar events, conversations, invoices, documents, and more from Go High Level.',
  },
  clio: {
    displayName: 'Clio',
    description: 'Import contacts, matters, tasks, notes, time entries, documents, trust balances, custom field values, and more from Clio.',
  },
  officio: {
    displayName: 'Officio',
    description: 'Import clients, cases, tasks, notes, and documents from Officio.',
  },
}
