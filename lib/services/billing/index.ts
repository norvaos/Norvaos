// ============================================================================
// Billing Services  -  barrel export
// ============================================================================

export * from './invoice-audit.service'
export * from './invoice-calculation.service'
export * from './invoice-state.service'
export * from './tax-calculation.service'
export * from './discount.service'
export * from './trust-application.service'
export * from './payment-allocation.service'

// Re-export shared ServiceResult type from the first definer to avoid
// duplicate-export conflicts (each file defines its own local copy but
// the shapes are identical).
export type { ServiceResult } from './invoice-calculation.service'
