'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  User,
  UserCheck,
  Plane,
  Home,
  Users,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react'
import {
  visitorVisaFormSchema,
  STEP_FIELDS,
  type VisitorVisaFormValues,
} from '@/lib/schemas/visitor-visa-invitation'
import { cn } from '@/lib/utils'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

import { StepInviter } from './step-inviter'
import { StepVisitor } from './step-visitor'
import { StepVisitDetails } from './step-visit-details'
import { StepAccommodation } from './step-accommodation'
import { StepAdditionalVisitors } from './step-additional-visitors'
import { StepReview } from './step-review'

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { title: 'Inviter', icon: User },
  { title: 'Visitor', icon: UserCheck },
  { title: 'Visit Details', icon: Plane },
  { title: 'Accommodation', icon: Home },
  { title: 'Additional Visitors', icon: Users },
  { title: 'Review', icon: FileCheck },
] as const

const TOTAL_STEPS = STEPS.length

// ---------------------------------------------------------------------------
// Step Progress
// ---------------------------------------------------------------------------

function StepProgress({
  currentStep,
  onStepClick,
}: {
  currentStep: number
  onStepClick: (step: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        const Icon = step.icon
        return (
          <div key={step.title} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isCompleted) onStepClick(i)
              }}
              disabled={!isCompleted}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                isCompleted && 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600',
                isCurrent && 'bg-primary text-primary-foreground ring-4 ring-primary/10',
                !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
              )}
              title={step.title}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </button>
            {i < TOTAL_STEPS - 1 && (
              <div
                className={cn(
                  'h-0.5 w-4 sm:w-8 rounded-full transition-colors duration-300',
                  i < currentStep ? 'bg-emerald-500' : 'bg-muted',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export function InvitationWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  const form = useForm<VisitorVisaFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(visitorVisaFormSchema) as any,
    defaultValues: {
      inviter: {
        full_name: '',
        date_of_birth: '',
        street_address: '',
        city: '',
        province: '',
        postal_code: '',
        phone: '',
        email: '',
        immigration_status: '',
        permit_expiry_date: '',
        employer_school_name: '',
        occupation: '',
        employer_company: '',
        annual_income: '',
      },
      visitor: {
        full_name: '',
        date_of_birth: '',
        gender: '',
        passport_number: '',
        passport_expiry_date: '',
        country_of_citizenship: '',
        country_of_residence: '',
        address: '',
        phone: '',
        email: '',
        relationship: '',
        relationship_other: '',
      },
      visit: {
        purpose: '',
        business_purpose: '',
        business_company: '',
        event_name: '',
        event_dates: '',
        event_location: '',
        medical_facility: '',
        medical_treatment: '',
        wedding_whose: '',
        wedding_date: '',
        wedding_venue: '',
        other_description: '',
        arrival_date: '',
        departure_date: '',
        places_to_visit: '',
      },
      accommodation: {
        staying_with: '',
        accommodation_name: '',
        accommodation_address: '',
        accommodation_other_details: '',
        expense_responsibility: '',
        will_provide_accommodation: false,
        will_provide_food: false,
        will_provide_transportation: false,
        will_provide_spending_money: false,
        employment_status: '',
        inviter_annual_income: '',
        number_of_dependents: '',
      },
      additional_visitors: {
        has_additional: false,
        visitors: [],
      },
    },
    mode: 'onTouched',
  })

  const handleNext = useCallback(async () => {
    const fieldsToValidate = STEP_FIELDS[currentStep]
    if (fieldsToValidate && fieldsToValidate.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valid = await form.trigger(fieldsToValidate as any)
      if (!valid) return
    }
    setDirection('forward')
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }, [currentStep, form])

  const handlePrev = useCallback(() => {
    setDirection('backward')
    setCurrentStep((s) => Math.max(0, s - 1))
  }, [])

  const goToStep = useCallback((step: number) => {
    setDirection(step < currentStep ? 'backward' : 'forward')
    setCurrentStep(step)
  }, [currentStep])

  const isLastStep = currentStep === TOTAL_STEPS - 1
  const stepInfo = STEPS[currentStep]

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()}>
        {/* Progress */}
        <StepProgress currentStep={currentStep} onStepClick={goToStep} />

        {/* Card */}
        <div className="mt-6 rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Step header */}
          <div className="border-b bg-muted/30 px-6 py-3">
            <div className="flex items-center gap-2">
              <stepInfo.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Step {currentStep + 1} of {TOTAL_STEPS}: {stepInfo.title}
              </span>
            </div>
          </div>

          {/* Step content */}
          <div
            key={currentStep}
            className={cn(
              'p-6 sm:p-8 animate-in fade-in duration-200',
              direction === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
            )}
          >
            {currentStep === 0 && <StepInviter />}
            {currentStep === 1 && <StepVisitor />}
            {currentStep === 2 && <StepVisitDetails />}
            {currentStep === 3 && <StepAccommodation />}
            {currentStep === 4 && <StepAdditionalVisitors />}
            {currentStep === 5 && <StepReview onGoToStep={goToStep} />}
          </div>

          {/* Navigation */}
          <div className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className={currentStep === 0 ? 'invisible' : ''}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>

            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {TOTAL_STEPS}
            </span>

            {!isLastStep && (
              <Button type="button" onClick={handleNext}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {isLastStep && <div />}
          </div>
        </div>
      </form>
    </Form>
  )
}
