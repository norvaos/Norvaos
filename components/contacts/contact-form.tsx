'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { contactSchema, type ContactFormValues } from '@/lib/schemas/contact'
import { CONTACT_SOURCES } from '@/lib/utils/constants'

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
import { Loader2, User, Building2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

interface DateOfBirthPickerProps {
  value: string | undefined
  onChange: (value: string) => void
}

function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
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
          <SelectValue placeholder="Year" />
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
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
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
          <SelectValue placeholder="Day" />
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
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false)

  const form = useForm<ContactFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(contactSchema) as any,
    defaultValues: {
      contact_type: 'individual',
      phone_type_primary: 'mobile',
      country: 'Canada',
      email_opt_in: true,
      sms_opt_in: false,
      ...defaultValues,
    },
  })

  const contactType = form.watch('contact_type')

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
              <FormLabel>Contact Type</FormLabel>
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

        <Separator />

        {/* ============================================================ */}
        {/*  Section: Primary Information                                 */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Basic Information
          </h3>

          {contactType === 'individual' ? (
            <>
              {/* First Name / Last Name */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
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
                      <FormLabel>Last Name *</FormLabel>
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
                    <FormLabel>Date of Birth</FormLabel>
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
                    <FormLabel>Organisation Name *</FormLabel>
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
                    <FormLabel>Website</FormLabel>
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
            Contact Details
          </h3>

          <FormField
            control={form.control}
            name="email_primary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Email</FormLabel>
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
                    <FormLabel>Primary Phone</FormLabel>
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
                  <FormLabel>Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? 'mobile'}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PHONE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
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
          <h3 className="text-sm font-semibold text-slate-900">Address</h3>

          <FormField
            control={form.control}
            name="address_line1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address Line 1</FormLabel>
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
                <FormLabel>Address Line 2</FormLabel>
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
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Toronto"
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
                name="province_state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province / State</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ontario"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
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
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="M5V 2T6"
                        {...field}
                        value={field.value ?? ''}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            form.handleSubmit(onSubmit)()
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
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
                        <FormLabel>Middle Name</FormLabel>
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
                        <FormLabel>Preferred Name</FormLabel>
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
                      <FormLabel>Job Title</FormLabel>
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
                      <FormLabel>Website</FormLabel>
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
                  <FormLabel>Secondary Email</FormLabel>
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
                      <FormLabel>Secondary Phone</FormLabel>
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
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PHONE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
            Source &amp; Preferences
          </h3>

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ''}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a source" />
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
                <FormLabel>Source Detail</FormLabel>
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
                    <FormLabel>Email Communications</FormLabel>
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
                    <FormLabel>SMS Communications</FormLabel>
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
          <h3 className="text-sm font-semibold text-slate-900">Notes</h3>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add any additional notes about this contact..."
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
            {mode === 'create' ? 'Create Contact' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
