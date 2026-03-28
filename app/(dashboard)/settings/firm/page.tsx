'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Building2, DollarSign, FileCheck2, Loader2, Lock, MapPin, Phone, Save, Scale, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { norvaToast } from '@/lib/utils/norva-branding'
import { TenantNotificationTriggers } from '@/components/settings/tenant-notification-triggers'
import dynamic from 'next/dynamic'

const FirmNamingConfig = dynamic(
  () => import('@/components/settings/firm-naming-config').then((m) => ({ default: m.FirmNamingConfig })),
  { ssr: false }
)

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { firmSchema, type FirmFormValues, firmAddressSchema, type FirmAddressFormValues } from '@/lib/schemas/settings'
import { JURISDICTIONS, REGULATORY_BODIES, CANADIAN_PROVINCES, resolveRegulatoryBody } from '@/lib/config/jurisdictions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  const router = useRouter()

  // ── Deep-link scroll: if URL has a #hash, scroll and glow that field ──
  useEffect(() => {
    const hash = window.location.hash?.replace('#', '')
    if (!hash) return
    // Wait for the form to mount and populate
    const timer = setTimeout(() => {
      const el = document.getElementById(hash)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if ('focus' in el && typeof el.focus === 'function') el.focus()
      el.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2', 'transition-all', 'duration-500')
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2')
      }, 2500)
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  // ── Consequence Guard: warn before changing an already-set regulatory body ──
  // Only fires when the user explicitly selects a DIFFERENT regulatory body
  // from the dropdown  -  never on page load, form reset, or non-jurisdiction saves.
  const [showConsequenceWarning, setShowConsequenceWarning] = useState(false)
  const [pendingRegulatoryChange, setPendingRegulatoryChange] = useState<string | null>(null)
  const [confirmCountdown, setConfirmCountdown] = useState(3)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pageReadyRef = useRef(false)

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
      home_province: '',
      primary_color: '#6366f1',
      secondary_color: '#8b5cf6',
      accent_color: '#ec4899',
      timezone: 'America/Toronto',
      currency: 'CAD',
      date_format: 'YYYY-MM-DD',
    },
  })

  useEffect(() => {
    if (tenant) {
      form.reset({
        name: tenant.name ?? '',
        home_province: tenant.home_province ?? '',
        primary_color: tenant.primary_color ?? '#6366f1',
        secondary_color: tenant.secondary_color ?? '#8b5cf6',
        accent_color: tenant.accent_color ?? '#ec4899',
        timezone: tenant.timezone ?? 'America/Toronto',
        currency: tenant.currency ?? 'CAD',
        date_format: tenant.date_format ?? 'YYYY-MM-DD',
      })
      // Mark page as ready after initial form hydration  -  prevents
      // the Consequence Guard from firing during the reset cycle.
      setTimeout(() => { pageReadyRef.current = true }, 500)
    }
  }, [tenant, firmData, form])

  const queryClient = useQueryClient()

  const updateFirm = useMutation({
    mutationFn: async (values: FirmFormValues) => {
      const res = await fetch('/api/settings/firm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }
    },
    onSuccess: async () => {
      toast.success('Firm settings updated successfully.')
      await refreshTenant()   // await so singleton is updated before the UI re-renders
      // Invalidate all queries that depend on tenant settings (regulatory sidebar, etc.)
      queryClient.invalidateQueries({ queryKey: ['settings', 'firm'] })
      router.refresh()
    },
    onError: (error) => {
      norvaToast('save_failed', error.message)
    },
  })

  function onSubmit(values: FirmFormValues) {
    updateFirm.mutate(values)
  }

  if (tenantLoading) {
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

          {/* Regulatory Body & Jurisdiction */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Regulatory Body
              </CardTitle>
              <CardDescription>
                Select the Law Society or College that regulates your firm. This determines compliance rules, AML requirements, and reporting standards across NorvaOS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="home_province"
                render={({ field }) => {
                  const resolved = resolveRegulatoryBody(field.value)
                  const federalBodies = REGULATORY_BODIES.filter((b) => b.scope === 'federal')
                  const provincialBodies = REGULATORY_BODIES.filter((b) => b.scope === 'provincial')
                  return (
                    <FormItem>
                      <FormLabel>Primary Regulatory Body</FormLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={(newValue) => {
                          // Only show the Consequence Guard if:
                          // 1. Page has fully loaded (not during form reset)
                          // 2. A regulatory body was already set
                          // 3. The user is selecting a DIFFERENT body
                          if (pageReadyRef.current && tenant?.home_province && newValue !== tenant.home_province) {
                            setPendingRegulatoryChange(newValue)
                            setConfirmCountdown(3)
                            setShowConsequenceWarning(true)
                            // Start countdown timer
                            if (countdownRef.current) clearInterval(countdownRef.current)
                            countdownRef.current = setInterval(() => {
                              setConfirmCountdown((prev) => {
                                if (prev <= 1) {
                                  if (countdownRef.current) clearInterval(countdownRef.current)
                                  return 0
                                }
                                return prev - 1
                              })
                            }, 1000)
                          } else {
                            field.onChange(newValue)
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger id="firm-jurisdiction-field" className="w-full">
                            <SelectValue placeholder="Select your Law Society or College…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Federal</SelectLabel>
                            {federalBodies.map((b) => (
                              <SelectItem key={b.code} value={b.code}>
                                {b.name} ({b.abbr})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Provincial</SelectLabel>
                            {provincialBodies.map((b) => (
                              <SelectItem key={b.code} value={b.code}>
                                {b.name} ({b.abbr})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Immigration consultants select CICC. Lawyers select their provincial Law Society.
                      </FormDescription>
                      <FormMessage />

                      {/* Resolved Regulatory Badge */}
                      {resolved && (
                        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-950/30 px-4 py-3">
                          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-emerald-400">
                              {resolved.name} ({resolved.abbr})
                            </p>
                            <p className="text-xs text-emerald-600">
                              {resolved.scope === 'federal' ? 'Federal regulatory body' : `Provincial  -  ${resolved.description}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </FormItem>
                  )
                }}
              />

              {/* Country (read-only) */}
              {firmData?.jurisdiction_code && (() => {
                const j = JURISDICTIONS.find((jd) => jd.code === (firmData.jurisdiction_code as string))
                return (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-2.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-lg">{j?.flag ?? ''}</span>
                    <span className="text-sm font-medium">{j?.name ?? firmData.jurisdiction_code}</span>
                    <span className="text-xs text-muted-foreground">(Country  -  set at creation)</span>
                  </div>
                )
              })()}
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
      <FirmAddressCard tenantId={tenant!.id} firmData={firmData} refreshTenant={refreshTenant} homeProvince={tenant?.home_province} />

      {/* Matter Naming Configuration */}
      <FirmNamingConfig />

      {/* ── Consequence Guard: Regulatory Change Warning Modal ────────── */}
      {/* ── Consequence Guard: "The Pause" Modal ────────────────────────── */}
      <AlertDialog
        open={showConsequenceWarning}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRegulatoryChange(null)
            if (countdownRef.current) clearInterval(countdownRef.current)
          }
          setShowConsequenceWarning(open)
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader className="space-y-3 text-center items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/40">
              <AlertTriangle className="h-7 w-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-2xl text-red-400 text-center w-full leading-snug">
              Wait - This is a Regulatory Change
              <span className="block text-sm font-normal text-muted-foreground mt-2">
                Changing your firm&apos;s home jurisdiction isn&apos;t just a setting - it changes how you practise law in this system.
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm">

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Scale className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Law Society Rules</p>
                      <p className="text-xs text-muted-foreground">
                        We will instantly switch from{' '}
                        <strong className="text-foreground">{resolveRegulatoryBody(tenant?.home_province)?.abbr ?? 'current'}</strong>{' '}
                        to{' '}
                        <strong className="text-foreground">{resolveRegulatoryBody(pendingRegulatoryChange)?.abbr ?? 'new'}</strong>{' '}
                        protocols.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Tax Recalculation</p>
                      <p className="text-xs text-muted-foreground">
                        All new invoices will shift (e.g. from 13% HST to 5% GST).
                        This cannot be bulk-undone.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <FileCheck2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Audit Integrity</p>
                      <p className="text-xs text-muted-foreground">
                        A permanent entry will be made in your Sentinel Eye Audit Log
                        marking this transition for your next Law Society review.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Responsibility notice */}
                <div className="rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2.5 text-xs text-red-400 leading-relaxed text-center">
                  We strongly recommend reviewing the compliance requirements of both
                  your current and new regulatory body before proceeding. The administering
                  user assumes full responsibility for ensuring continued compliance
                  following this change.
                </div>

                {/* Countdown friction */}
                {confirmCountdown > 0 && (
                  <p className="text-center text-xs text-muted-foreground italic animate-pulse">
                    Reviewing consequences… ({confirmCountdown}s)
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-3 pt-2">
            <AlertDialogCancel className="w-full sm:w-auto font-semibold order-1 sm:order-none">
              Keep Current (Recommended)
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmCountdown > 0}
              className={
                confirmCountdown > 0
                  ? 'w-full sm:w-auto bg-muted text-muted-foreground border border-border cursor-not-allowed font-medium'
                  : 'w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white border-0 font-semibold'
              }
              onClick={() => {
                if (pendingRegulatoryChange) {
                  form.setValue('home_province', pendingRegulatoryChange, { shouldDirty: true })
                }
                setPendingRegulatoryChange(null)
              }}
            >
              {confirmCountdown > 0
                ? `Reviewing… (${confirmCountdown}s)`
                : 'Confirm & Log Change'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Office Address Card ─────────────────────────────────────────────────────

function FirmAddressCard({
  tenantId,
  firmData,
  refreshTenant,
  homeProvince,
}: {
  tenantId: string
  firmData: Record<string, unknown> | null | undefined
  refreshTenant: () => Promise<void>
  homeProvince: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const regBody = resolveRegulatoryBody(homeProvince ?? null)

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
        province: (firmData.province as FirmAddressFormValues['province']) ?? '',
        postal_code: (firmData.postal_code as string) ?? '',
        country: (firmData.country as string) ?? 'Canada',
        office_phone: (firmData.office_phone as string) ?? '',
        office_fax: (firmData.office_fax as string) ?? '',
      })
    }
  }, [firmData, form])

  const updateAddress = useMutation({
    mutationFn: async (values: FirmAddressFormValues) => {
      // ── Province-to-Jurisdiction Validation ──────────────────────────
      // If a provincial regulatory body is set, the office address province
      // must match that body's province. E.g., LSO requires ON.
      if (regBody && regBody.scope === 'provincial' && regBody.provinceCode && values.province) {
        if (values.province !== regBody.provinceCode) {
          const provinceName = CANADIAN_PROVINCES.find(p => p.code === regBody.provinceCode)?.name ?? regBody.provinceCode
          throw new Error(
            `${regBody.abbr}-regulated firms must have a physical presence in ${provinceName}. Please update your jurisdiction or your address.`
          )
        }
      }

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
    onSuccess: async () => {
      toast.success('Office address saved.')
      await refreshTenant() // ← Sync tenant context so Header Badge updates immediately
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
                    <Input id="firm-address-field" placeholder="123 Legal Street, Suite 400" {...field} value={field.value ?? ''} />
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
                    <FormLabel>Province / Territory</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger id="firm-province-field">
                          <SelectValue placeholder="Select province…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CANADIAN_PROVINCES.map((p) => (
                          <SelectItem key={p.code} value={p.code}>
                            {p.name} ({p.code})
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
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input id="firm-postal-field" placeholder="M5H 2N2" {...field} value={field.value ?? ''} />
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
                      <Input id="firm-phone-field" placeholder="+1 (416) 555-0100" {...field} value={field.value ?? ''} />
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
                      <Input id="firm-fax-field" placeholder="+1 (416) 555-0199" {...field} value={field.value ?? ''} />
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
