'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Phone, MapPin, Globe, DollarSign, Save } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { useTenant } from '@/lib/hooks/use-tenant'
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

// Common IANA timezones relevant to a Canadian law firm
const TIMEZONES = [
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
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const CURRENCIES = [
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'PKR', label: 'PKR — Pakistani Rupee' },
  { code: 'AED', label: 'AED — UAE Dirham' },
]

const IANA_TZ_REGEX = /^[A-Za-z_]+\/[A-Za-z_/]+$/

const officeFormSchema = z.object({
  firm_name: z.string().min(1, 'Firm name is required').max(200),
  address: z.string().max(500).optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  timezone: z
    .string()
    .regex(IANA_TZ_REGEX, 'Must be a valid IANA timezone'),
  currency: z
    .string()
    .length(3, 'Currency must be a 3-character ISO code')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase (e.g. CAD)'),
})

type OfficeFormValues = z.infer<typeof officeFormSchema>

export default function OfficeSettingsPage() {
  const { tenant, isLoading: tenantLoading, refreshTenant } = useTenant()
  const queryClient = useQueryClient()

  const form = useForm<OfficeFormValues>({
    resolver: standardSchemaResolver(officeFormSchema),
    defaultValues: {
      firm_name: '',
      address: '',
      phone: '',
      timezone: 'America/Toronto',
      currency: 'CAD',
    },
  })

  // Populate form when tenant data loads
  useEffect(() => {
    if (!tenant) return
    const settings =
      typeof tenant.settings === 'object' && tenant.settings !== null
        ? (tenant.settings as Record<string, unknown>)
        : {}

    form.reset({
      firm_name: tenant.name ?? '',
      address: typeof settings.address === 'string' ? settings.address : '',
      phone: typeof settings.phone === 'string' ? settings.phone : '',
      timezone: tenant.timezone ?? 'America/Toronto',
      currency: tenant.currency ?? 'CAD',
    })
  }, [tenant, form])

  const saveSettings = useMutation({
    mutationFn: async (values: OfficeFormValues) => {
      const body: Record<string, string> = {
        firm_name: values.firm_name,
        timezone: values.timezone,
        currency: values.currency,
      }
      if (values.address !== undefined) body.address = values.address
      if (values.phone !== undefined) body.phone = values.phone

      const res = await fetch('/api/settings/office', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      return data
    },
    onSuccess: async () => {
      toast.success('Office settings saved successfully.')
      await refreshTenant()
      queryClient.invalidateQueries({ queryKey: ['tenant'] })
    },
    onError: (err) => {
      toast.error('Failed to save office settings.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Office Settings</h2>
        <p className="text-muted-foreground">
          Configure your firm&apos;s contact information, timezone, and default currency.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => saveSettings.mutate(values))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Firm Details
              </CardTitle>
              <CardDescription>
                Basic information about your firm visible to clients and staff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="firm_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firm Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Waseer Law Office" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Office Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="123 Main Street, Toronto, ON M5V 1A1"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Displayed on invoices and client-facing documents.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (416) 555-0100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Regional Settings
              </CardTitle>
              <CardDescription>
                Control how dates, times, and monetary amounts are displayed across the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      All deadlines and calendar entries are displayed in this timezone.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Currency</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Used as the default currency for new invoices and trust ledger entries.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
