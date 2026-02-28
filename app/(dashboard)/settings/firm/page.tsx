'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { firmSchema, type FirmFormValues } from '@/lib/schemas/settings'

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
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
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
  const { tenant, isLoading: tenantLoading } = useTenant()
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
                              {tz.replace(/_/g, ' ')}
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
    </div>
  )
}
