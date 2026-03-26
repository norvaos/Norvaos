'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { contactSchema, type ContactFormValues } from '@/lib/schemas/contact'
import { CONTACT_SOURCES } from '@/lib/utils/constants'
import { CLIENT_LOCALES } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/i18n-provider'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Loader2, User, Building2, ChevronDown, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IdScanner } from '@/components/contacts/id-scanner'
import type { IdScanFields } from '@/lib/services/ocr/id-field-parser'

const PHONE_TYPES = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'fax', label: 'Fax' },
] as const

/* ------------------------------------------------------------------ */
/*  Year-first Date of Birth picker                                    */
/* ------------------------------------------------------------------ */

const MONTHS = [
  { value: '01', key: 'form.month_january' },
  { value: '02', key: 'form.month_february' },
  { value: '03', key: 'form.month_march' },
  { value: '04', key: 'form.month_april' },
  { value: '05', key: 'form.month_may' },
  { value: '06', key: 'form.month_june' },
  { value: '07', key: 'form.month_july' },
  { value: '08', key: 'form.month_august' },
  { value: '09', key: 'form.month_september' },
  { value: '10', key: 'form.month_october' },
  { value: '11', key: 'form.month_november' },
  { value: '12', key: 'form.month_december' },
] as const

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

interface DateOfBirthPickerProps {
  value: string | undefined
  onChange: (value: string) => void
}

function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const { t } = useI18n()

  // Parse the existing value (YYYY-MM-DD) into parts
  const parsed = useMemo(() => {
    if (!value) return { year: '', month: '', day: '' }
    const parts = value.split('-')
    return {
      year: parts[0] ?? '',
      month: parts[1] ?? '',
      day: parts[2] ?? '',
    }
  }, [value])

  const [year, setYear] = useState(parsed.year)
  const [month, setMonth] = useState(parsed.month)
  const [day, setDay] = useState(parsed.day)

  // Sync from external value changes (e.g. form reset)
  useEffect(() => {
    setYear(parsed.year)
    setMonth(parsed.month)
    setDay(parsed.day)
  }, [parsed])

  // Build the ISO date string and propagate up when all three parts are set
  const propagate = useCallback(
    (y: string, m: string, d: string) => {
      if (y && m && d) {
        onChange(`${y}-${m}-${d.padStart(2, '0')}`)
      } else if (!y && !m && !d) {
        onChange('')
      }
    },
    [onChange],
  )

  // Year options: current year down to 1900
  const currentYear = new Date().getFullYear()
  const yearOptions = useMemo(() => {
    const opts: number[] = []
    for (let y = currentYear; y >= 1900; y--) {
      opts.push(y)
    }
    return opts
  }, [currentYear])

  // Day options depend on year + month
  const dayOptions = useMemo(() => {
    if (!year || !month) return []
    const count = daysInMonth(Number(year), Number(month))
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [year, month])

  // If changing month/year makes the selected day invalid, reset it
  useEffect(() => {
    if (day && dayOptions.length > 0 && Number(day) > dayOptions.length) {
      setDay('')
    }
  }, [day, dayOptions])

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Year */}
      <Select
        value={year}
        onValueChange={(v) => {
          setYear(v)
          propagate(v, month, day)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('form.year' as any)} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {yearOptions.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Month */}
      <Select
        value={month}
        onValueChange={(v) => {
          setMonth(v)
          propagate(year, v, day)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('form.month' as any)} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {t(m.key as any)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Day */}
      <Select
        value={day}
        onValueChange={(v) => {
          setDay(v)
          propagate(year, month, v)
        }}
        disabled={!year || !month}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('form.day' as any)} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {dayOptions.map((d) => (
            <SelectItem key={d} value={String(d).padStart(2, '0')}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Contact Form                                                       */
/* ------------------------------------------------------------------ */

interface ContactFormProps {
  mode: 'create' | 'edit'
  defaultValues?: Partial<ContactFormValues>
  onSubmit: (values: ContactFormValues) => void
  isLoading?: boolean
}

export function ContactForm({
  mode,
  defaultValues,
  onSubmit,
  isLoading = false,
}: ContactFormProps) {
  const { t } = useI18n()
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false)
  /** Fields the OCR parser flagged as needing manual review — shows amber border */
  const [reviewRequiredFields, setReviewRequiredFields] = useState<Set<string>>(new Set())

  const form = useForm<ContactFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(contactSchema) as any,
    defaultValues: {
      contact_type: 'individual',
      client_status: 'lead',
      phone_type_primary: 'mobile',
      country: 'Canada',
      email_opt_in: true,
      sms_opt_in: false,
      ...defaultValues,
    },
  })

  const contactType = form.watch('contact_type')

  // ── ID Scanner auto-fill callback ───────────────────────────────────────
  const handleScanComplete = useCallback((fields: IdScanFields) => {
    if (fields.first_name) form.setValue('first_name', fields.first_name, { shouldDirty: true })
    if (fields.last_name) form.setValue('last_name', fields.last_name, { shouldDirty: true })
    if (fields.middle_name) form.setValue('middle_name', fields.middle_name, { shouldDirty: true })
    if (fields.date_of_birth) form.setValue('date_of_birth', fields.date_of_birth, { shouldDirty: true })
    if (fields.address_line1) form.setValue('address_line1', fields.address_line1, { shouldDirty: true })
    if (fields.city) form.setValue('city', fields.city, { shouldDirty: true })
    if (fields.province_state) form.setValue('province_state', fields.province_state, { shouldDirty: true })
    if (fields.postal_code) form.setValue('postal_code', fields.postal_code, { shouldDirty: true })
    // Ensure contact type is individual
    form.setValue('contact_type', 'individual')

    // Flag fields the parser couldn't confidently extract — amber "Review Required" border
    if (fields.review_required && fields.review_required.length > 0) {
      setReviewRequiredFields(new Set(fields.review_required))
    } else {
      setReviewRequiredFields(new Set())
    }
  }, [form])

  // Reset name fields when switching contact type
  useEffect(() => {
    if (mode === 'create') {
      if (contactType === 'individual') {
        form.setValue('organization_name', undefined)
      } else {
        form.setValue('first_name', undefined)
        form.setValue('last_name', undefined)
        form.setValue('middle_name', undefined)
        form.setValue('preferred_name', undefined)
        form.setValue('date_of_birth', undefined)
      }
    }
  }, [contactType, mode, form])

  // Open the additional details section if any of those fields have data (edit mode)
  useEffect(() => {
    if (mode === 'edit' && defaultValues) {
      const hasAdditional =
        defaultValues.middle_name ||
        defaultValues.preferred_name ||
        defaultValues.email_secondary ||
        defaultValues.website ||
        defaultValues.phone_secondary ||
        defaultValues.job_title
      if (hasAdditional) {
        setAdditionalDetailsOpen(true)
      }
    }
  }, [mode, defaultValues])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Contact Type Toggle */}
        <FormField
          control={form.control}
          name="contact_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.contact_type' as any)}</FormLabel>
              <FormControl>
                <div className="flex rounded-lg border p-1">
                  <button
                    type="button"
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colours',
                      field.value === 'individual'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => field.onChange('individual')}
                  >
                    <User className="size-4" />
                    Individual
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colours',
                      field.value === 'organization'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => field.onChange('organization')}
                  >
                    <Building2 className="size-4" />
                    Organisation
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Classification — visible in both create and edit */}
        <FormField
          control={form.control}
          name="client_status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.classification' as any)}</FormLabel>
              <Select
                value={field.value || 'lead'}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.select_classification' as any)} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {/* Client Lifecycle — auto-managed by system for these */}
                  <SelectItem value="lead">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-amber-400" />
                      Lead
                    </span>
                  </SelectItem>
                  <SelectItem value="client">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-green-500" />
                      Client
                    </span>
                  </SelectItem>
                  <SelectItem value="former_client">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-slate-400" />
                      Former Client
                    </span>
                  </SelectItem>
                  {/* Legal Professionals */}
                  <SelectItem value="lawyer">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-500" />
                      Lawyer
                    </span>
                  </SelectItem>
                  <SelectItem value="consultant">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-indigo-500" />
                      Consultant
                    </span>
                  </SelectItem>
                  <SelectItem value="judge">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-purple-500" />
                      Judge
                    </span>
                  </SelectItem>
                  {/* Government / IRCC */}
                  <SelectItem value="ircc_officer">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-red-500" />
                      IRCC Officer
                    </span>
                  </SelectItem>
                  <SelectItem value="government">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-red-400" />
                      Government
                    </span>
                  </SelectItem>
                  {/* Other */}
                  <SelectItem value="referral_source">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-teal-500" />
                      Referral Source
                    </span>
                  </SelectItem>
                  <SelectItem value="vendor">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-orange-500" />
                      Vendor
                    </span>
                  </SelectItem>
                  <SelectItem value="other_professional">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-gray-500" />
                      Other Professional
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className="text-xs">
                Lead/Client/Former auto-updates when matters change. Professional types are locked from auto-sync.
              </FormDescription>
            </FormItem>
          )}
        />

        {/* Preferred Language */}
        <FormField
          control={form.control}
          name="preferred_language"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Globe className="size-4" />
                {t('form.preferred_language' as any)}
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value ?? ''}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('form.select_preferred_language' as any)} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CLIENT_LOCALES.map((locale) => (
                    <SelectItem key={locale.code} value={locale.code}>
                      {locale.nativeLabel} — {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Primary Information                                 */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('form.section_basic_info' as any)}
          </h3>

          {/* ID Scanner — scan a government ID to auto-fill fields */}
          {mode === 'create' && contactType === 'individual' && (
            <IdScanner onScanComplete={handleScanComplete} />
          )}

          {contactType === 'individual' ? (
            <>
              {/* First Name / Last Name */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.first_name' as any)} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="First name"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.last_name' as any)} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Last name"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Date of Birth — year-first picker */}
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.date_of_birth' as any)}</FormLabel>
                    <FormControl>
                      <DateOfBirthPicker
                        value={field.value ?? undefined}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : (
            <>
              <FormField
                control={form.control}
                name="organization_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.organisation_name' as any)} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Organisation name"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.website' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Contact Details (primary)                           */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('form.section_contact_details' as any)}
          </h3>

          <FormField
            control={form.control}
            name="email_primary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.primary_email' as any)}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <FormField
                control={form.control}
                name="phone_primary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.primary_phone' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 123-4567"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="phone_type_primary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.phone_type' as any)}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? 'mobile'}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('form.phone_type' as any)} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PHONE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(('form.phone_' + type.value) as any)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Address                                             */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">{t('form.section_address' as any)}</h3>

          <FormField
            control={form.control}
            name="address_line1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.address_line_1' as any)}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="123 Main St"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address_line2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.address_line_2' as any)}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Suite 100"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* City, Province, Postal Code, Country — visually grouped */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.city' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Toronto"
                        className={cn(reviewRequiredFields.has('city') && !field.value && 'border-amber-400 ring-1 ring-amber-200 bg-amber-50/50')}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          field.onChange(e)
                          if (e.target.value) setReviewRequiredFields(prev => { const next = new Set(prev); next.delete('city'); return next })
                        }}
                      />
                    </FormControl>
                    {reviewRequiredFields.has('city') && !field.value && (
                      <p className="text-[10px] font-medium text-amber-600">{t('form.review_required_ocr' as any)}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="province_state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.province_state' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ontario"
                        className={cn(reviewRequiredFields.has('province_state') && !field.value && 'border-amber-400 ring-1 ring-amber-200 bg-amber-50/50')}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          field.onChange(e)
                          if (e.target.value) setReviewRequiredFields(prev => { const next = new Set(prev); next.delete('province_state'); return next })
                        }}
                      />
                    </FormControl>
                    {reviewRequiredFields.has('province_state') && !field.value && (
                      <p className="text-[10px] font-medium text-amber-600">{t('form.review_required_ocr' as any)}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.postal_code' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="M5V 2T6"
                        className={cn(reviewRequiredFields.has('postal_code') && !field.value && 'border-amber-400 ring-1 ring-amber-200 bg-amber-50/50')}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          field.onChange(e)
                          if (e.target.value) setReviewRequiredFields(prev => { const next = new Set(prev); next.delete('postal_code'); return next })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            form.handleSubmit(onSubmit)()
                          }
                        }}
                      />
                    </FormControl>
                    {reviewRequiredFields.has('postal_code') && !field.value && (
                      <p className="text-[10px] font-medium text-amber-600">{t('form.review_required_ocr' as any)}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.country' as any)}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Canada"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Additional Details (collapsible)                    */}
        {/* ============================================================ */}
        <Collapsible
          open={additionalDetailsOpen}
          onOpenChange={setAdditionalDetailsOpen}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-muted/60 transition-colours"
            >
              Additional Details
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform duration-200',
                  additionalDetailsOpen && 'rotate-180',
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4 pt-4">
            {contactType === 'individual' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="middle_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('form.middle_name' as any)}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Middle name"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="preferred_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('form.preferred_name' as any)}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Preferred name"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="job_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.job_title' as any)}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Job title"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.website' as any)}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="email_secondary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.secondary_email' as any)}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="secondary@example.com"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="phone_secondary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.secondary_phone' as any)}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 987-6543"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="phone_type_secondary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.phone_type' as any)}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('form.phone_type' as any)} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PHONE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {t(('form.phone_' + type.value) as any)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Source & Preferences                                */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('form.section_source_prefs' as any)}
          </h3>

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.source' as any)}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ''}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('form.select_source' as any)} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTACT_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="source_detail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.source_detail' as any)}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Referred by John Smith"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <FormField
              control={form.control}
              name="email_opt_in"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('form.email_communications' as any)}</FormLabel>
                    <FormDescription>
                      Receive email updates and newsletters
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sms_opt_in"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('form.sms_communications' as any)}</FormLabel>
                    <FormDescription>
                      Receive text message updates
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Section: Notes */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">{t('form.notes' as any)}</h3>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.notes' as any)}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('form.notes_placeholder' as any)}
                    className="min-h-[100px] resize-y"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Form-level error message */}
        {form.formState.errors.root && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === 'create' ? t('form.create_contact' as any) : t('form.save_changes' as any)}
          </Button>
        </div>
      </form>
    </Form>
  )
}
