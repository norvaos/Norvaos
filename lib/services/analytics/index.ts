// ── Phase 8: Analytics & Collections Service Layer ───────────────────────────

export {
  // Analytics queries
  getAgedReceivables,
  getMatterProfitability,
  getLawyerUtilization,
  getRevenueAnalytics,
  getTrustComplianceDashboard,
  getKpiScorecard,
  // Analytics types
  type ServiceResult,
  type AgingBucket,
  type InvoiceDetail,
  type AgedReceivablesData,
  type AgedReceivablesFilters,
  type MatterProfitabilityRow,
  type MatterProfitabilityData,
  type MatterProfitabilityFilters,
  type PracticeAreaBreakdown,
  type LawyerUtilisationRow,
  type LawyerUtilisationFilters,
  type RevenuePeriod,
  type RevenueAnalyticsData,
  type RevenueAnalyticsFilters,
  type TrustComplianceDashboardData,
  type KpiScorecardData,
  type KpiPeriodParams,
} from './analytics-service'

export {
  // Collection actions
  logCollectionAction,
  getCollectionActions,
  // Payment plans
  createPaymentPlan,
  approvePaymentPlan,
  recordInstalmentPayment,
  getPaymentPlans,
  // Write-offs
  requestWriteOff,
  approveWriteOff,
  rejectWriteOff,
  // Client statements
  getClientStatement,
  // Collections types
  type CollectionActionInput,
  type CollectionAction,
  type PaymentPlanInput,
  type PaymentPlan,
  type PaymentPlanFilters,
  type ClientStatementMatter,
  type ClientStatementData,
} from './collections-service'
