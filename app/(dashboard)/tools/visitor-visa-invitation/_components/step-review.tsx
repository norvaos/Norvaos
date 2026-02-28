'use client'

import { useState, useCallback } from 'react'
import { useFormContext } from 'react-hook-form'
import { differenceInDays, parseISO } from 'date-fns'
import { Copy, Printer, FileText, Check, Pencil } from 'lucide-react'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import {
  getProvinceName,
  getCountryName,
  getOptionLabel,
  IMMIGRATION_STATUSES,
  RELATIONSHIPS,
  VISIT_PURPOSES,
  ACCOMMODATION_TYPES,
  EXPENSE_RESPONSIBILITY,
  GENDERS,
} from '@/lib/utils/visitor-visa-constants'
import { generateInvitationLetter } from '@/lib/utils/visitor-visa-letter'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface StepReviewProps {
  onGoToStep: (step: number) => void
}

function SummaryCard({
  title,
  stepIndex,
  onEdit,
  children,
}: {
  title: string
  stepIndex: number
  onEdit: (step: number) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onEdit(stepIndex)}
        >
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </div>
      <div className="px-4 py-3 text-sm space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

export function StepReview({ onGoToStep }: StepReviewProps) {
  const form = useFormContext<VisitorVisaFormValues>()
  const values = form.getValues()
  const [letter, setLetter] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { inviter, visitor, visit, accommodation, additional_visitors } = values

  const duration = (() => {
    try {
      return differenceInDays(parseISO(visit.departure_date), parseISO(visit.arrival_date))
    } catch {
      return 0
    }
  })()

  const handleGenerate = useCallback(() => {
    const text = generateInvitationLetter(values)
    setLetter(text)
  }, [values])

  const handleCopy = useCallback(async () => {
    if (!letter) return
    await navigator.clipboard.writeText(letter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [letter])

  const handlePrint = useCallback(() => {
    if (!letter) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head><title>Invitation Letter</title>
        <style>body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; max-width: 700px; margin: 40px auto; padding: 0 20px; white-space: pre-wrap; }</style>
        </head>
        <body>${letter.replace(/\n/g, '<br>')}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }, [letter])

  const relationshipLabel =
    visitor.relationship === 'other' && visitor.relationship_other
      ? visitor.relationship_other
      : getOptionLabel(RELATIONSHIPS, visitor.relationship)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Review Your Information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Please review all details below before generating the invitation letter.
        </p>
        <Separator className="my-3" />
      </div>

      {/* Inviter Summary */}
      <SummaryCard title="Inviter (You)" stepIndex={0} onEdit={onGoToStep}>
        <Row label="Name" value={inviter.full_name} />
        <Row label="Date of Birth" value={inviter.date_of_birth} />
        <Row
          label="Address"
          value={`${inviter.street_address}, ${inviter.city}, ${getProvinceName(inviter.province)} ${inviter.postal_code}`}
        />
        <Row label="Phone" value={inviter.phone} />
        <Row label="Email" value={inviter.email} />
        <Row label="Status" value={getOptionLabel(IMMIGRATION_STATUSES, inviter.immigration_status)} />
        <Row label="Permit Expiry" value={inviter.permit_expiry_date} />
        <Row label="Occupation" value={inviter.occupation} />
        <Row label="Employer" value={inviter.employer_company || inviter.employer_school_name} />
        {inviter.annual_income && (
          <Row label="Annual Income" value={`CAD $${Number(inviter.annual_income).toLocaleString()}`} />
        )}
      </SummaryCard>

      {/* Visitor Summary */}
      <SummaryCard title="Visitor" stepIndex={1} onEdit={onGoToStep}>
        <Row label="Name" value={visitor.full_name} />
        <Row label="Date of Birth" value={visitor.date_of_birth} />
        {visitor.gender && <Row label="Gender" value={getOptionLabel(GENDERS, visitor.gender)} />}
        <Row label="Passport" value={visitor.passport_number} />
        <Row label="Passport Expiry" value={visitor.passport_expiry_date} />
        <Row label="Citizenship" value={getCountryName(visitor.country_of_citizenship)} />
        <Row label="Residence" value={getCountryName(visitor.country_of_residence)} />
        <Row label="Address" value={visitor.address} />
        <Row label="Phone" value={visitor.phone} />
        <Row label="Email" value={visitor.email} />
        <Row label="Relationship" value={relationshipLabel} />
      </SummaryCard>

      {/* Visit Details */}
      <SummaryCard title="Visit Details" stepIndex={2} onEdit={onGoToStep}>
        <Row label="Purpose" value={getOptionLabel(VISIT_PURPOSES, visit.purpose)} />
        <Row label="Arrival" value={visit.arrival_date} />
        <Row label="Departure" value={visit.departure_date} />
        {duration > 0 && <Row label="Duration" value={`${duration} days`} />}
        <Row label="Business Purpose" value={visit.business_purpose} />
        <Row label="Event" value={visit.event_name} />
        <Row label="Medical Facility" value={visit.medical_facility} />
        <Row label="Wedding" value={visit.wedding_whose} />
        <Row label="Other Details" value={visit.other_description} />
        <Row label="Places to Visit" value={visit.places_to_visit} />
      </SummaryCard>

      {/* Accommodation */}
      <SummaryCard title="Accommodation & Financial Support" stepIndex={3} onEdit={onGoToStep}>
        <Row label="Staying" value={getOptionLabel(ACCOMMODATION_TYPES, accommodation.staying_with)} />
        <Row label="Accommodation" value={accommodation.accommodation_name} />
        <Row label="Address" value={accommodation.accommodation_address} />
        <Row label="Expenses" value={getOptionLabel(EXPENSE_RESPONSIBILITY, accommodation.expense_responsibility)} />
        {(accommodation.expense_responsibility === 'inviter' ||
          accommodation.expense_responsibility === 'shared') && (
          <>
            {accommodation.will_provide_accommodation && <Row label="Providing" value="Accommodation" />}
            {accommodation.will_provide_food && <Row label="Providing" value="Food & Meals" />}
            {accommodation.will_provide_transportation && <Row label="Providing" value="Transportation" />}
            {accommodation.will_provide_spending_money && <Row label="Providing" value="Spending Money" />}
            <Row label="Employment" value={accommodation.employment_status} />
            {accommodation.inviter_annual_income && (
              <Row label="Income" value={`CAD $${Number(accommodation.inviter_annual_income).toLocaleString()}`} />
            )}
            <Row label="Dependents" value={accommodation.number_of_dependents} />
          </>
        )}
      </SummaryCard>

      {/* Additional Visitors */}
      {additional_visitors.has_additional && additional_visitors.visitors.length > 0 && (
        <SummaryCard title="Additional Visitors" stepIndex={4} onEdit={onGoToStep}>
          {additional_visitors.visitors.map((v, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{i + 1}.</span>
              <span className="text-foreground">
                {v.name}
                {v.relationship && ` (${v.relationship})`}
                {v.country && ` from ${getCountryName(v.country)}`}
              </span>
            </div>
          ))}
        </SummaryCard>
      )}

      {/* Generate */}
      <Separator className="my-2" />

      {!letter ? (
        <Button type="button" size="lg" className="w-full" onClick={handleGenerate}>
          <FileText className="mr-2 h-4 w-4" />
          Generate Invitation Letter
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
            >
              Regenerate
            </Button>
          </div>

          <div className="rounded-lg border bg-white p-6 font-serif text-sm leading-relaxed whitespace-pre-wrap">
            {letter}
          </div>
        </div>
      )}
    </div>
  )
}
