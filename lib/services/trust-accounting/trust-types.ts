// Shared types for all trust-accounting services
// All monetary values are BIGINT (cents). UI is responsible for dollar conversion.

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Standard pagination helpers
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export function normalizePagination(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1)
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE))
  const fromIdx = (p - 1) * ps
  const to = fromIdx + ps - 1
  return { page: p, pageSize: ps, from: fromIdx, to }
}

export function buildPaginatedResult<T>(
  rows: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  const pageSize = Math.min(Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  return {
    rows,
    total,
    page: Math.max(1, params.page ?? 1),
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

// Audit log parameter type (used by all services)
export interface WriteAuditLogParams {
  tenantId: string
  action: string
  entityType: string
  entityId: string
  userId: string
  matterId?: string | null
  metadata?: Record<string, unknown>
}

// Trust transaction log entry type (for the append-only transaction log)
export type TransactionLogEventType =
  | 'deposit_recorded'
  | 'disbursement_recorded'
  | 'transfer_recorded'
  | 'reversal_recorded'
  | 'hold_created'
  | 'hold_released'
  | 'hold_cancelled'
  | 'reconciliation_created'
  | 'reconciliation_completed'
  | 'reconciliation_reviewed'
  | 'disbursement_request_prepared'
  | 'disbursement_request_approved'
  | 'disbursement_request_rejected'
  | 'balance_warning'
  | 'overdraft_prevented'

// All types are already exported at definition site above.
