'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FunnelContext — State-gate controller for the Immigration Verified-Workflow
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * HOW maxUnlockedStep WORKS
 * ─────────────────────────
 * The funnel enforces strict linear sequencing via two gates:
 *
 *   ┌──────────────┐     Gate 1      ┌──────────────┐     Gate 2      ┌──────────────┐
 *   │ Verification │ ──────────────▸ │  Workspace   │ ──────────────▸ │   Approval   │
 *   └──────────────┘                 └──────────────┘                 └──────────────┘
 *
 *   Gate 1: Eligibility must pass (readiness.eligibility.outcome === 'pass')
 *           → If it fails, maxUnlockedStep stays at 'verification'.
 *
 *   Gate 2: ≥80% of document slots must be accepted
 *           (readiness.documents.accepted / totalSlots >= 0.8)
 *           → If it fails, maxUnlockedStep stays at 'workspace'.
 *
 * `maxUnlockedStep` is derived from `ImmigrationReadinessData` via
 * `deriveMaxUnlockedStep()`. It is recalculated whenever readiness data
 * changes (e.g. after a document is approved or eligibility is re-run).
 *
 * Navigation functions (`setCurrentStep`, `advance`) refuse to move past
 * `maxUnlockedStep`. The FunnelStepIndicator shows a lock icon on gated steps.
 *
 * ⚠️  DO NOT weaken these gates without a product decision. They exist to
 *     prevent lawyers from generating incomplete IRCC submissions.
 *
 * ESCAPE HATCH
 * ────────────
 * Power users can bypass the funnel entirely via `?view=legacy` on the shell
 * page URL. This renders the standard WorkplaceShell instead.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ────────────────────────────────────────────────────────────────────

export type FunnelStep = 'verification' | 'workspace' | 'approval'

export interface FunnelContextValue {
  currentStep: FunnelStep
  maxUnlockedStep: FunnelStep
  setCurrentStep: (step: FunnelStep) => void
  canNavigateTo: (step: FunnelStep) => boolean
  advance: () => void
  goBack: () => void
  /**
   * Optimistically unlock up to `step`, bridging the gap between a mutation
   * succeeding and the readiness query refetching.  The override is
   * automatically cleared the next time `readinessData` changes (which
   * recalculates `maxUnlockedStep` from the DB).
   */
  overrideMaxStep: (step: FunnelStep) => void
  /**
   * Atomically unlock and navigate to `step` in a single render, bypassing
   * the stale-closure issue that occurs when overrideMaxStep + advance are
   * called sequentially inside a mutation onSuccess callback.
   */
  forceAdvanceTo: (step: FunnelStep) => void
  matterId: string
  tenantId: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_ORDER: FunnelStep[] = ['verification', 'workspace', 'approval']

function stepIndex(step: FunnelStep): number {
  return STEP_ORDER.indexOf(step)
}

// ── Derive max unlocked step from readiness data ─────────────────────────────

function deriveMaxUnlockedStep(
  readiness: ImmigrationReadinessData | null,
): FunnelStep {
  if (!readiness) return 'verification'

  // Gate 1: eligibility must pass to unlock workspace
  if (readiness.eligibility.outcome !== 'pass') return 'verification'

  // Gate 2: 80 % of document slots accepted to unlock approval
  const { accepted, totalSlots } = readiness.documents
  if (totalSlots === 0 || accepted / totalSlots < 0.8) return 'workspace'

  return 'approval'
}

// ── Context ──────────────────────────────────────────────────────────────────

const FunnelCtx = createContext<FunnelContextValue | null>(null)

export function useFunnelContext(): FunnelContextValue {
  const ctx = useContext(FunnelCtx)
  if (!ctx) {
    throw new Error('useFunnelContext must be used inside <FunnelProvider>')
  }
  return ctx
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface FunnelProviderProps {
  readinessData: ImmigrationReadinessData | null
  matterId: string
  tenantId: string
  children: ReactNode
}

export function FunnelProvider({
  readinessData,
  matterId,
  tenantId,
  children,
}: FunnelProviderProps) {
  // Derived gate from real DB readiness data
  const derivedMax = useMemo(
    () => deriveMaxUnlockedStep(readinessData),
    [readinessData],
  )

  // Optimistic override — set by screens after a mutation succeeds but
  // before the readiness query refetches. Cleared whenever derivedMax
  // changes (meaning the DB-driven value has caught up).
  const [optimisticMax, setOptimisticMax] = useState<FunnelStep | null>(null)

  // Clear optimistic override once DB data catches up
  const prevDerivedRef = useRef(derivedMax)
  if (prevDerivedRef.current !== derivedMax) {
    prevDerivedRef.current = derivedMax
    if (optimisticMax !== null) setOptimisticMax(null)
  }

  // Effective max: whichever is further along
  const maxUnlockedStep =
    optimisticMax && stepIndex(optimisticMax) > stepIndex(derivedMax)
      ? optimisticMax
      : derivedMax

  // Start at the furthest unlocked step
  const [currentStep, setCurrentStepRaw] = useState<FunnelStep>(maxUnlockedStep)

  const canNavigateTo = useCallback(
    (step: FunnelStep) => stepIndex(step) <= stepIndex(maxUnlockedStep),
    [maxUnlockedStep],
  )

  const setCurrentStep = useCallback(
    (step: FunnelStep) => {
      if (canNavigateTo(step)) setCurrentStepRaw(step)
    },
    [canNavigateTo],
  )

  const advance = useCallback(() => {
    const idx = stepIndex(currentStep)
    if (idx < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[idx + 1]
      if (canNavigateTo(next)) setCurrentStepRaw(next)
    }
  }, [currentStep, canNavigateTo])

  const goBack = useCallback(() => {
    const idx = stepIndex(currentStep)
    if (idx > 0) setCurrentStepRaw(STEP_ORDER[idx - 1])
  }, [currentStep])

  const overrideMaxStep = useCallback((step: FunnelStep) => {
    setOptimisticMax(step)
  }, [])

  const forceAdvanceTo = useCallback((step: FunnelStep) => {
    setOptimisticMax(step)
    setCurrentStepRaw(step)
  }, [])

  const value = useMemo<FunnelContextValue>(
    () => ({
      currentStep,
      maxUnlockedStep,
      setCurrentStep,
      canNavigateTo,
      advance,
      goBack,
      overrideMaxStep,
      forceAdvanceTo,
      matterId,
      tenantId,
    }),
    [
      currentStep,
      maxUnlockedStep,
      setCurrentStep,
      canNavigateTo,
      advance,
      goBack,
      overrideMaxStep,
      forceAdvanceTo,
      matterId,
      tenantId,
    ],
  )

  return <FunnelCtx.Provider value={value}>{children}</FunnelCtx.Provider>
}
