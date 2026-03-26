'use client'

/**
 * SovereignStepper — Directive 42.1 Multi-Step Intake Wizard
 *
 * Replaces the flat contact creation form with a multi-phase regulatory
 * intake flow:
 *   1. Conflict Search   (LEAD gate)
 *   2. Contact Details / Contact & Lead (creates contact, optionally lead)
 *   3. Compliance Review  (PROSPECT gate — skipped for general contacts)
 *
 * "Pure Contact" protocol: when isGeneralContact is true, steps 2→complete
 * directly, bypassing compliance review.
 *
 * Each phase must clear its regulatory gate before the user can advance.
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { ShieldCheck, UserPlus, ClipboardCheck, X, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { SovereignConflictStep } from './steps/conflict-step'
import { SovereignContactStep } from './steps/contact-step'
import { SovereignComplianceStep } from './steps/compliance-step'

// ── Types ────────────────────────────────────────────────────────────────────

type StepperPhase = 'conflict_search' | 'contact_details' | 'compliance_review' | 'complete'

export interface SovereignStepperProps {
  onComplete: (contactId: string, leadId: string) => void
  onCancel: () => void
}

export interface IntakeState {
  conflictCleared: boolean
  conflictScanId: string | null
  contactId: string | null
  leadId: string | null
  firstName: string
  lastName: string
  isGeneralContact: boolean
  existingContactId: string | null
  conflictResolution: 'none' | 'linked' | 'declared_no_conflict'
  conflictJustification: string | null
}

// ── Step metadata ────────────────────────────────────────────────────────────

interface StepMeta {
  phase: StepperPhase
  label: string
  gate: string
  icon: ReactNode
  number: number
}

const STEPS: StepMeta[] = [
  {
    phase: 'conflict_search',
    label: 'Conflict Search',
    gate: 'LEAD',
    icon: <ShieldCheck className="size-4" />,
    number: 1,
  },
  {
    phase: 'contact_details',
    label: 'Contact & Lead',
    gate: 'LEAD',
    icon: <UserPlus className="size-4" />,
    number: 2,
  },
  {
    phase: 'compliance_review',
    label: 'Compliance Review',
    gate: 'PROSPECT',
    icon: <ClipboardCheck className="size-4" />,
    number: 3,
  },
]

// ── Component ────────────────────────────────────────────────────────────────

export function SovereignStepper({ onComplete, onCancel }: SovereignStepperProps) {
  const [currentPhase, setCurrentPhase] = useState<StepperPhase>('conflict_search')
  const [transitioning, setTransitioning] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  const [intake, setIntake] = useState<IntakeState>({
    conflictCleared: false,
    conflictScanId: null,
    contactId: null,
    leadId: null,
    firstName: '',
    lastName: '',
    isGeneralContact: false,
    existingContactId: null,
    conflictResolution: 'none',
    conflictJustification: null,
  })

  // ── Dynamic steps based on Pure Contact protocol ────────────────────────

  const activeSteps = useMemo(() => {
    if (intake.isGeneralContact) {
      return STEPS.filter(s => s.phase !== 'compliance_review')
    }
    return STEPS
  }, [intake.isGeneralContact])

  // Derive dynamic labels: step 2 label changes based on isGeneralContact
  const labelledSteps = useMemo(() => {
    return activeSteps.map((step, idx) => {
      if (step.phase === 'contact_details') {
        return {
          ...step,
          label: intake.isGeneralContact ? 'Contact Details' : 'Contact & Lead',
          number: idx + 1,
        }
      }
      return { ...step, number: idx + 1 }
    })
  }, [activeSteps, intake.isGeneralContact])

  const currentIndex = labelledSteps.findIndex(s => s.phase === currentPhase)

  // ── Animated phase transition ────────────────────────────────────────────

  const transitionTo = useCallback((nextPhase: StepperPhase, dir: 'forward' | 'backward') => {
    setDirection(dir)
    setTransitioning(true)

    // Allow CSS fade-out, then swap phase and fade-in
    const timer = setTimeout(() => {
      setCurrentPhase(nextPhase)
      setTransitioning(false)
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  // ── Navigation handlers ──────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (currentPhase === 'conflict_search') {
      if (!intake.conflictCleared) return
      transitionTo('contact_details', 'forward')
    } else if (currentPhase === 'contact_details') {
      if (intake.isGeneralContact) {
        // Pure Contact protocol: skip compliance, complete immediately
        if (!intake.contactId) return
        onComplete(intake.contactId, intake.leadId ?? '')
      } else {
        // Standard flow: need both contactId and leadId to proceed
        if (!intake.contactId || !intake.leadId) return
        transitionTo('compliance_review', 'forward')
      }
    } else if (currentPhase === 'compliance_review') {
      if (intake.contactId && intake.leadId) {
        onComplete(intake.contactId, intake.leadId)
      }
    }
  }, [currentPhase, intake, transitionTo, onComplete])

  const handleBack = useCallback(() => {
    if (currentPhase === 'contact_details') {
      transitionTo('conflict_search', 'backward')
    } else if (currentPhase === 'compliance_review') {
      transitionTo('contact_details', 'backward')
    }
  }, [currentPhase, transitionTo])

  // ── Derive button states ─────────────────────────────────────────────────

  const canGoBack = currentPhase !== 'conflict_search'
  const canGoNext =
    (currentPhase === 'conflict_search' && intake.conflictCleared) ||
    (currentPhase === 'contact_details' && intake.isGeneralContact && !!intake.contactId) ||
    (currentPhase === 'contact_details' && !intake.isGeneralContact && !!intake.contactId && !!intake.leadId) ||
    (currentPhase === 'compliance_review' && !!intake.contactId && !!intake.leadId)

  const isLastStep =
    (currentPhase === 'compliance_review') ||
    (currentPhase === 'contact_details' && intake.isGeneralContact)

  const nextLabel = isLastStep ? 'Finish' : 'Next'

  // ── Intake state updaters (passed to step children) ──────────────────────

  const updateIntake = useCallback((patch: Partial<IntakeState>) => {
    setIntake((prev) => ({ ...prev, ...patch }))
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className="mx-auto w-full max-w-2xl overflow-hidden">
      {/* ── Header: Step Indicator ───────────────────────────────────────── */}
      <CardHeader className="space-y-4 pb-4">
        {/* Phase badge */}
        <div className="flex items-center justify-between">
          <Badge
            className={cn(
              'gap-1.5 border text-xs font-medium',
              currentPhase === 'conflict_search' && 'border-amber-200 bg-amber-50 text-amber-700',
              currentPhase === 'contact_details' && 'border-blue-200 bg-blue-50 text-blue-700',
              currentPhase === 'compliance_review' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
            )}
          >
            {labelledSteps[currentIndex]?.icon}
            {labelledSteps[currentIndex]?.gate} Gate
          </Badge>
          <span className="text-xs text-muted-foreground">
            Step {currentIndex + 1} of {labelledSteps.length}
          </span>
        </div>

        {/* Step circles with connecting lines */}
        <div className="flex items-center justify-between">
          {labelledSteps.map((step, idx) => {
            const isCompleted = idx < currentIndex
            const isCurrent = idx === currentIndex

            return (
              <div key={step.phase} className="flex flex-1 items-center">
                {/* Circle */}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300',
                      isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                      isCurrent && 'border-blue-500 bg-blue-500 text-white shadow-md shadow-blue-200',
                      !isCompleted && !isCurrent && 'border-slate-200 bg-white text-slate-400',
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-4" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium transition-colors duration-300',
                      isCurrent && 'text-slate-900',
                      isCompleted && 'text-emerald-600',
                      !isCompleted && !isCurrent && 'text-slate-400',
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connecting line (not after last step) */}
                {idx < labelledSteps.length - 1 && (
                  <div className="mx-2 mb-5 h-0.5 flex-1">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        idx < currentIndex
                          ? 'bg-emerald-500'
                          : 'bg-slate-200',
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${((currentIndex + 1) / labelledSteps.length) * 100}%` }}
          />
        </div>
      </CardHeader>

      {/* ── Body: Current Step ───────────────────────────────────────────── */}
      <CardContent className="min-h-[320px]">
        <div
          className={cn(
            'transition-all duration-200 ease-in-out',
            transitioning && direction === 'forward' && 'translate-x-4 opacity-0',
            transitioning && direction === 'backward' && '-translate-x-4 opacity-0',
            !transitioning && 'translate-x-0 opacity-100',
          )}
        >
          {currentPhase === 'conflict_search' && (
            <SovereignConflictStep
              intake={intake}
              updateIntake={updateIntake}
            />
          )}

          {currentPhase === 'contact_details' && (
            <SovereignContactStep
              intake={intake}
              updateIntake={updateIntake}
            />
          )}

          {currentPhase === 'compliance_review' && (
            <SovereignComplianceStep
              intake={intake}
              updateIntake={updateIntake}
            />
          )}
        </div>
      </CardContent>

      {/* ── Footer: Navigation ───────────────────────────────────────────── */}
      <CardFooter className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-muted-foreground"
        >
          <X className="mr-1.5 size-4" />
          Cancel
        </Button>

        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              Back
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext}
          >
            {nextLabel}
            {!isLastStep && (
              <ArrowRight className="ml-1.5 size-4" />
            )}
            {isLastStep && (
              <Check className="ml-1.5 size-4" />
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
