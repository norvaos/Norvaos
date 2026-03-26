/**
 * Trust Accounting & IOLTA Compliance — Service Layer Barrel
 *
 * Phase 7: LSO By-Law 9 compliant trust accounting.
 *
 * NOTE: Several services define their own ServiceResult / PaginatedResult /
 * PaginationParams interfaces (structurally identical). To avoid TS2308
 * "already exported" errors we re-export only the canonical copies from
 * trust-compliance-service and use explicit named re-exports for the rest.
 */

// Canonical shared types + compliance helpers
export * from './trust-compliance-service'

// Ledger service — skip duplicate ServiceResult & getAvailableBalance
export {
  recordDeposit,
  recordDisbursement,
  recordTransfer,
  recordReversal,
  getMatterLedger,
  getAccountLedger,
  prepareDisbursementRequest,
  approveDisbursementRequest,
  rejectDisbursementRequest,
  releaseHold,
  type RecordDepositParams,
  type RecordDisbursementParams,
  type RecordTransferParams,
  type RecordReversalParams,
  type GetMatterLedgerParams,
  type GetAccountLedgerParams,
  type PrepareDisbursementRequestParams,
  type ApproveDisbursementRequestParams,
  type RejectDisbursementRequestParams,
  type ReleaseHoldParams,
  type MatterLedgerResult,
  type AccountLedgerTransaction,
  type AccountLedgerResult,
} from './trust-ledger-service'

// Reconciliation service — skip duplicate ServiceResult, PaginatedResult, PaginationParams
export {
  createReconciliation,
  setStatementBalance,
  computeBookBalance,
  identifyOutstandingItems,
  computeAdjustedBankBalance,
  computeClientListing,
  checkThreeWayBalance,
  completeReconciliation,
  reviewReconciliation,
  flagReconciliation,
  addReconciliationItem,
  resolveReconciliationItem,
  getReconciliation,
  listReconciliations,
} from './trust-reconciliation-service'

// Reporting service — skip duplicate ServiceResult, PaginatedResult, PaginationParams
export {
  getClientTrustListing,
  getAccountSummary,
  getTrustTransactionReport,
  getDisbursementReport,
  getChequeRegister,
  getHoldsReport,
  getAuditTrail,
  getLSOComplianceReport,
  type ClientTrustListingItem,
  type ClientTrustListingReport,
  type AccountSummaryReport,
  type TransactionReportFilters,
  type TransactionReportRow,
  type DisbursementReportFilters,
  type DisbursementReportRow,
  type ChequeRegisterFilters,
  type ChequeRegisterRow,
  type HoldsReportRow,
  type AuditTrailFilters,
  type AuditTrailRow,
  type LSOComplianceReport,
} from './trust-reporting-service'

// Trust Reconciler — Clio-to-Norva migration balance comparison (Directive 20.1)
export {
  reconcileClioMigration,
  type TrustMismatch,
  type ReconciliationReport,
} from './trust-reconciler'

// LedgerGuard Middleware — Fiduciary Gate (Directive 20.0)
export {
  validateTrustModification,
  enforceLedgerGuard,
  TRUST_REASON_CODES,
  type TrustReasonCode,
  type LedgerGuardInput,
  type LedgerGuardResult,
} from './ledger-guard'

// Compliance Examination Snapshots — Directive 004, Pillar 1
export {
  generateComplianceSnapshot,
  listComplianceSnapshots,
  getComplianceSnapshot,
  verifyAuditChains,
  type GenerateSnapshotParams,
  type ComplianceSnapshot,
  type ChainVerificationResult,
  type SnapshotType,
} from './compliance-examination-service'

// Auto-Reconciliation & Disbursement Lockdown — Directive 004, Pillar 2
export {
  runAutoReconciliation,
  checkDisbursementLock,
  getDiscrepancies,
  resolveDiscrepancy,
  getReconciliationSchedule,
  upsertReconciliationSchedule,
  type AutoReconcileParams,
  type AutoReconcileResult,
  type Discrepancy,
  type DisbursementLockStatus,
  type ReconciliationFrequency,
  type ReconciliationScheduleRow,
} from './auto-reconciliation-service'
