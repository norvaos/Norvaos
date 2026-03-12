'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Lock, MapPin, Phone, Save } from 'lucide-react'
import { toast } from 'sonner'
import { TenantNotificationTriggers } from '@/components/settings/tenant-notification-triggers'

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { firmSchema, type FirmFormValues, firmAddressSchema, type FirmAddressFormValues } from '@/lib/schemas/settings'
import { JURISDICTIONS } from '@/lib/config/jurisdictions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const TIMEZONES = [
  // Americas
  'America/St_Johns',
  'America/Halifax',
  'America/Toronto',
  'America/New_York',
  'America/Winnipeg',
  'America/Chicago',
  'America/Edmonton',
  'America/Denver',
  'America/Vancouver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  // Europe & Africa
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  // Asia & Pacific
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

const CURRENCIES = [
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
]

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-02-24)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (24/02/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (02/24/2026)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (24-02-2026)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Feb 24, 2026)' },
]

function formatTzLabel(tz: string): string {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now)
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
    return `${city} (${offset})`
  } catch {
    return tz.replace(/_/g, ' ')
  }
}

function ColourPickerField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-md border border-input p-0.5"
          aria-label={label}
        />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="w-32 font-mono text-sm"
      />
    </div>
  )
}

export default function SettingsFirmPage() {
  const { tenant, isLoading: tenantLoading, refreshTenant } = useTenant()
  const queryClient = useQueryClient()

  const { data: firmData, isLoading } = useQuery({
    queryKey: ['settings', 'firm', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!tenant) return null
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenant.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!tenant,
  })

  const form = useForm<FirmFormValues>({
    resolver: standardSchemaResolver(firmSchema),
    defaultValues: {
      name: '',
      primary_color: '#6366f1',
      secondary_color: '#8b5cf6',
      accent_color: '#ec4899',
      timezone: 'America/Toronto',
      currency: 'CAD',
      date_format: 'YYYY-MM-DD',
    },
  })

  useEffect(() => {
    if (firmData) {
      form.reset({
        name: firmData.name ?? '',
        primary_color: firmData.primary_color ?? '#6366f1',
        secondary_color: firmData.secondary_color ?? '#8b5cf6',
        accent_color: firmData.accent_color ?? '#ec4899',
        timezone: firmData.timezone ?? 'America/Toronto',
        currency: firmData.currency ?? 'CAD',
        date_format: firmData.date_format ?? 'YYYY-MM-DD',
      })
    }
  }, [firmData, form])

  const updateFirm = useMutation({
    mutationFn: async (values: FirmFormValues) => {
      const supabase = createClient()
      if (!tenant) throw new Error('No tenant found')
      const { error } = await supabase
        .from('tenants')
        .update({
          name: values.name,
          primary_color: values.primary_color,
          secondary_color: values.secondary_color,
          accent_color: values.accent_color,
          timezone: values.timezone,
          currency: values.currency,
          date_format: values.date_format,
        })
        .eq('id', tenant.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Firm settings updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'firm'] })
      refreshTenant()
    },
    onError: (error) => {
      toast.error('Failed to update firm settings.', {
        description: error.message,
      })
    },
  })

  function onSubmit(values: FirmFormValues) {
    updateFirm.mutate(values)
  }

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Firm Settings</h2>
          <p className="text-muted-foreground">Configure your firm preferences.</p>
        </div>
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Firm Settings</h2>
        <p className="text-muted-foreground">
          Configure your firm name, branding colours, and regional preferences.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                General
              </CardTitle>
              <CardDescription>Basic firm information.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firm Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your firm name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Jurisdiction (read-only) */}
          {firmData?.jurisdiction_code && (() => {
            const j = JURISDICTIONS.find((jd) => jd.code === firmData.jurisdiction_code)
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Jurisdiction
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>
                    Set at creation — cannot be changed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-3">
                    <span className="text-lg">{j?.flag ?? ''}</span>
                    <span className="font-medium">{j?.name ?? firmData.jurisdiction_code}</span>
                    <span className="text-sm text-muted-foreground">({firmData.jurisdiction_code})</span>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          <Card>
            <CardHeader>
              <CardTitle>Branding Colours</CardTitle>
              <CardDescription>
                Customise the colour scheme used throughout NorvaOS for your firm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="primary_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Colour</FormLabel>
                      <FormControl>
                        <ColourPickerField
                          value={field.value}
                          onChange={field.onChange}
                          label="Primary colour"
                        />
                      </FormControl>
                      <FormDescription>Main brand colour.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secondary_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secondary Colour</FormLabel>
                      <FormControl>
                        <ColourPickerField
                          value={field.value}
                          onChange={field.onChange}
                          label="Secondary colour"
                        />
                      </FormControl>
                      <FormDescription>Used for accents and highlights.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accent_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accent Colour</FormLabel>
                      <FormControl>
                        <ColourPickerField
                          value={field.value}
                          onChange={field.onChange}
                          label="Accent colour"
                        />
                      </FormControl>
                      <FormDescription>Used for calls to action.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium">Colour Preview</p>
                <div className="flex gap-3">
                  <div
                    className="h-12 w-24 rounded-md border"
                    style={{ backgroundColor: form.watch('primary_color') }}
                  />
                  <div
                    className="h-12 w-24 rounded-md border"
                    style={{ backgroundColor: form.watch('secondary_color') }}
                  />
                  <div
                    className="h-12 w-24 rounded-md border"
                    style={{ backgroundColor: form.watch('accent_color') }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Regional Settings</CardTitle>
              <CardDescription>
                Configure your timezone, currency, and date display format.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {formatTzLabel(tz)}
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
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
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
                  name="date_format"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date Format</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select date format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DATE_FORMATS.map((df) => (
                            <SelectItem key={df.value} value={df.value}>
                              {df.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateFirm.isPending}>
              {updateFirm.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>

      {/* Notification Triggers (admin) */}
      <TenantNotificationTriggers />

      {/* Office Address Card */}
      <FirmAddressCard tenantId={tenant!.id} firmData={firmData} />
    </div>
  )
}

// ─── Office Address Card ─────────────────────────────────────────────────────

function FirmAddressCard({
  tenantId,
  firmData,
}: {
  tenantId: string
  firmData: Record<string, unknown> | null | undefined
}) {
  const queryClient = useQueryClient()

  const form = useForm<FirmAddressFormValues>({
    resolver: standardSchemaResolver(firmAddressSchema),
    defaultValues: {
      address_line1: '',
      address_line2: '',
      city: '',
      province: '',
      postal_code: '',
      country: 'Canada',
      office_phone: '',
      office_fax: '',
    },
  })

  useEffect(() => {
    if (firmData) {
      form.reset({
        address_line1: (firmData.address_line1 as string) ?? '',
        address_line2: (firmData.address_line2 as string) ?? '',
        city: (firmData.city as string) ?? '',
        province: (firmData.province as string) ?? '',
        postal_code: (firmData.postal_code as string) ?? '',
        country: (firmData.country as string) ?? 'Canada',
        office_phone: (firmData.office_phone as string) ?? '',
        office_fax: (firmData.office_fax as string) ?? '',
      })
    }
  }, [firmData, form])

  const updateAddress = useMutation({
    mutationFn: async (values: FirmAddressFormValues) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('tenants')
        .update({
          address_line1: values.address_line1 || null,
          address_line2: values.address_line2 || null,
          city: values.city || null,
          province: values.province || null,
          postal_code: values.postal_code || null,
          country: values.country || 'Canada',
          office_phone: values.office_phone || null,
          office_fax: values.office_fax || null,
        } as never)
        .eq('id', tenantId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Office address saved.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'firm'] })
    },
    onError: (error) => {
      toast.error('Failed to save address.', { description: error.message })
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => updateAddress.mutate(v))}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Office Address
            </CardTitle>
            <CardDescription>
              Your office address appears on Use of Representative forms, retainer agreements,
              and client-facing documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="address_line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Legal Street, Suite 400" {...field} value={field.value ?? ''} />
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
                    <Input placeholder="PO Box, Floor, Unit (optional)" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Toronto" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province / State</FormLabel>
                    <FormControl>
                      <Input placeholder="Ontario" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder="M5H 2N2" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Input placeholder="Canada" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground pt-2">
              <Phone className="h-4 w-4" />
              Contact Numbers
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="office_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Office Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (416) 555-0100" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="office_fax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fax (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (416) 555-0199" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <div className="flex justify-end px-6 pb-6">
            <Button type="submit" disabled={updateAddress.isPending}>
              {updateAddress.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Address
            </Button>
          </div>
        </Card>
      </form>
    </Form>
  )
}
