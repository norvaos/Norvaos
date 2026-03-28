'use client'

/**
 * FieldInput  -  Single field input component for the questionnaire renderer.
 *
 * Handles different field types (text, select, date, number, boolean, country,
 * email, phone, textarea) and renders the appropriate shadcn/ui control.
 *
 * Shows source provenance badges, stale indicators, verification status,
 * and character count when applicable.
 */

import { useState, useCallback } from 'react'
import { Check, AlertTriangle, Info, Shield } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AnswerRecord, AnswerSource } from '@/lib/ircc/types/answers'

// ── Country List ──────────────────────────────────────────────────────────────

const COUNTRY_OPTIONS: { label: string; value: string }[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bangladesh', 'Barbados', 'Belarus',
  'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China', 'Colombia',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Georgia',
  'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guyana', 'Haiti',
  'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia',
  'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos',
  'Latvia', 'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar',
  'Malawi', 'Malaysia', 'Mali', 'Malta', 'Mauritius', 'Mexico', 'Moldova',
  'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
  'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palestine',
  'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia',
  'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
  'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago',
  'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
].map(c => ({ label: c, value: c }))

// ── Source Display Names ─────────────────────────────────────────────────────

const SOURCE_DISPLAY: Record<AnswerSource, string> = {
  client_portal: 'Client Portal',
  staff_entry: 'Staff Entry',
  canonical_prefill: 'Profile Prefill',
  cross_form_reuse: 'Cross-form Reuse',
  cross_matter_import: 'Matter Import',
  extraction: 'Document Extraction',
  migration: 'Data Migration',
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FieldInputProps {
  field: {
    id: string
    profile_path: string
    label: string
    field_type: string
    options?: { label: string; value: string }[]
    placeholder?: string
    description?: string
    is_required: boolean
    max_length?: number
  }
  value: unknown
  answer?: AnswerRecord
  onChange: (value: unknown) => void
  onBlur: () => void
  readOnly?: boolean
  showVerification?: boolean
  onVerify?: () => void
  isVerified?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FieldInput({
  field,
  value,
  answer,
  onChange,
  onBlur,
  readOnly = false,
  showVerification = false,
  onVerify,
  isVerified = false,
}: FieldInputProps) {
  const stringValue = value != null ? String(value) : ''
  const charCount = field.max_length ? stringValue.length : null

  // ── Label Row ─────────────────────────────────────────────────────────────

  const labelRow = (
    <div className="flex items-center gap-1.5 mb-1">
      <Label
        htmlFor={`field-${field.id}`}
        className="text-xs font-medium text-foreground leading-none"
      >
        {field.label}
        {field.is_required && (
          <span className="text-destructive ml-0.5">*</span>
        )}
      </Label>

      {/* Stale indicator */}
      {answer?.stale && (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 leading-4 border-amber-500/30 text-amber-400 bg-amber-950/30 gap-0.5"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Stale
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-60 text-xs">
              {answer.stale_reason ?? 'A related field has changed. Please review this value.'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Verified checkmark (staff mode only) */}
      {showVerification && isVerified && (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center text-green-600">
                <Shield className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Verified
              {answer?.verified_by ? ` by ${answer.verified_by}` : ''}
              {answer?.verified_at
                ? ` on ${new Date(answer.verified_at).toLocaleDateString('en-CA', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : ''}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Verify button (staff mode, not yet verified) */}
      {showVerification && !isVerified && onVerify && stringValue && (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onVerify}
                disabled={readOnly}
                className={cn(
                  'inline-flex items-center text-muted-foreground/40 hover:text-green-600 transition-colors rounded-full p-0.5',
                  readOnly && 'opacity-30 cursor-not-allowed',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Mark as verified
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )

  // ── Input Control ─────────────────────────────────────────────────────────

  let control: React.ReactNode

  switch (field.field_type) {
    case 'select': {
      const options = field.options ?? []
      control = (
        <Select
          value={stringValue || undefined}
          onValueChange={(val) => {
            onChange(val)
            // Trigger onBlur for auto-save after selection
            setTimeout(onBlur, 0)
          }}
          disabled={readOnly}
        >
          <SelectTrigger
            id={`field-${field.id}`}
            className="w-full text-xs h-8"
          >
            <SelectValue placeholder={field.placeholder ?? 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    }

    case 'country': {
      control = (
        <Select
          value={stringValue || undefined}
          onValueChange={(val) => {
            onChange(val)
            setTimeout(onBlur, 0)
          }}
          disabled={readOnly}
        >
          <SelectTrigger
            id={`field-${field.id}`}
            className="w-full text-xs h-8"
          >
            <SelectValue placeholder={field.placeholder ?? 'Select country...'} />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    }

    case 'boolean': {
      const boolValue = value === true || value === 'true' || value === 'yes' || value === '1'
      control = (
        <div className="flex items-center gap-2 py-1">
          <Switch
            id={`field-${field.id}`}
            checked={boolValue}
            onCheckedChange={(checked) => {
              onChange(checked)
              setTimeout(onBlur, 0)
            }}
            disabled={readOnly}
          />
          <span className="text-xs text-muted-foreground">
            {boolValue ? 'Yes' : 'No'}
          </span>
        </div>
      )
      break
    }

    case 'textarea': {
      control = (
        <Textarea
          id={`field-${field.id}`}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? ''}
          disabled={readOnly}
          maxLength={field.max_length ?? undefined}
          rows={3}
          className="text-xs resize-y min-h-[60px]"
        />
      )
      break
    }

    case 'date': {
      control = (
        <TenantDateInput
          id={`field-${field.id}`}
          value={stringValue}
          onChange={(iso) => { onChange(iso); setTimeout(onBlur, 0) }}
          disabled={readOnly}
          className="text-xs h-8"
        />
      )
      break
    }

    case 'number': {
      control = (
        <Input
          id={`field-${field.id}`}
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? ''}
          disabled={readOnly}
          className="text-xs h-8"
        />
      )
      break
    }

    case 'email': {
      control = (
        <Input
          id={`field-${field.id}`}
          type="email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? 'email@example.com'}
          disabled={readOnly}
          className="text-xs h-8"
        />
      )
      break
    }

    case 'phone': {
      control = (
        <Input
          id={`field-${field.id}`}
          type="tel"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? '+1 (000) 000-0000'}
          disabled={readOnly}
          className="text-xs h-8"
        />
      )
      break
    }

    // Default: text input
    default: {
      control = (
        <Input
          id={`field-${field.id}`}
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder ?? ''}
          disabled={readOnly}
          maxLength={field.max_length ?? undefined}
          className="text-xs h-8"
        />
      )
      break
    }
  }

  // ── Footer Row (description, source, char count) ──────────────────────────

  const footerRow = (
    <div className="flex items-center justify-between gap-2 mt-0.5">
      <div className="flex items-center gap-2 min-w-0">
        {/* Description / help text */}
        {field.description && (
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center text-muted-foreground/50 shrink-0">
                  <Info className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs">
                {field.description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Source badge */}
        {answer?.source && (
          <span className="text-[10px] text-muted-foreground/60 truncate leading-none">
            {SOURCE_DISPLAY[answer.source] ?? answer.source}
          </span>
        )}
      </div>

      {/* Character count */}
      {charCount !== null && field.max_length && (
        <span
          className={cn(
            'text-[10px] tabular-nums leading-none shrink-0',
            charCount > field.max_length * 0.9
              ? 'text-destructive'
              : 'text-muted-foreground/50',
          )}
        >
          {charCount}/{field.max_length}
        </span>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'py-2 border-b last:border-0',
      answer?.stale && 'bg-amber-950/30',
      isVerified && !answer?.stale && 'bg-emerald-950/10',
    )}>
      {labelRow}
      {control}
      {(field.description || answer?.source || (charCount !== null && field.max_length)) && footerRow}
    </div>
  )
}
