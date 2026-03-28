'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { User, CheckCircle2, Loader2, Lock } from 'lucide-react'
import {
  IMMIGRATION_STATUSES,
  MARITAL_STATUSES,
  GENDERS,
  FULL_COUNTRY_LIST,
} from '@/lib/utils/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileForm {
  date_of_birth: string
  gender: string
  marital_status: string
  nationality: string
  country_of_birth: string
  country_of_residence: string
  immigration_status: string
  immigration_status_expiry: string
  currently_in_canada: boolean
  criminal_charges: boolean
  inadmissibility_flag: boolean
  travel_history_flag: boolean
}

const EMPTY_FORM: ProfileForm = {
  date_of_birth: '',
  gender: '',
  marital_status: '',
  nationality: '',
  country_of_birth: '',
  country_of_residence: '',
  immigration_status: '',
  immigration_status_expiry: '',
  currently_in_canada: false,
  criminal_charges: false,
  inadmissibility_flag: false,
  travel_history_flag: false,
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Debounce hook ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [timeoutRef])

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => callback(...args), delay)
    }) as T,
    [callback, delay, timeoutRef]
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientProfilePanel() {
  const { contact, tenantId, isConverted, entityType, entityId, isLoading } = useCommandCentre()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Tracks whether the form has been initialised from the contact  -  prevents
  // the initial hydration from triggering an immediate save.
  const initialisedRef = useRef(false)

  // ── Hydrate form from contact ─────────────────────────────────────────────
  useEffect(() => {
    if (!contact) return
    initialisedRef.current = false
    setForm({
      date_of_birth: contact.date_of_birth ?? '',
      gender: contact.gender ?? '',
      marital_status: contact.marital_status ?? '',
      nationality: contact.nationality ?? '',
      country_of_birth: contact.country_of_birth ?? '',
      country_of_residence: contact.country_of_residence ?? '',
      immigration_status: contact.immigration_status ?? '',
      immigration_status_expiry: contact.immigration_status_expiry ?? '',
      currently_in_canada: contact.currently_in_canada ?? false,
      criminal_charges: contact.criminal_charges ?? false,
      inadmissibility_flag: contact.inadmissibility_flag ?? false,
      travel_history_flag: contact.travel_history_flag ?? false,
    })
    // Use a microtask delay so the setState above settles before re-enabling saves
    Promise.resolve().then(() => {
      initialisedRef.current = true
    })
  }, [contact])

  // ── Save to Supabase ──────────────────────────────────────────────────────
  const saveToDb = useCallback(
    async (patch: Partial<ProfileForm>) => {
      if (!contact?.id || !tenantId) return

      setSaveState('saving')
      try {
        const supabase = createClient()

        // 1. Always save to contacts (source of truth)
        const { error } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', contact.id)
          .eq('tenant_id', tenantId)

        if (error) throw error

        // 2. When in matter context, mirror the same fields to matter_people
        //    so the People on File section stays in sync without manual re-entry.
        //    Field name mapping: immigration_status_expiry → status_expiry_date
        if (entityType === 'matter' && entityId) {
          const matterPeoplePatch: Record<string, unknown> = {}
          const fieldMap: Record<string, string> = {
            immigration_status_expiry: 'status_expiry_date',
          }
          for (const [key, val] of Object.entries(patch)) {
            const mappedKey = fieldMap[key] ?? key
            matterPeoplePatch[mappedKey] = val
          }
          // Non-fatal: ignore errors so a missing matter_people row never blocks the contact save
          await supabase
            .from('matter_people')
            .update(matterPeoplePatch)
            .eq('matter_id', entityId)
            .eq('contact_id', contact.id)
            .eq('is_active', true)

          queryClient.invalidateQueries({ queryKey: ['matter-people', entityId] })
        }

        // Invalidate both query key shapes used across the codebase
        queryClient.invalidateQueries({ queryKey: ['contacts', 'detail', contact.id] })
        queryClient.invalidateQueries({ queryKey: ['contacts'] })

        setSaveState('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
      } catch {
        setSaveState('error')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveState('idle'), 3000)
      }
    },
    [contact?.id, tenantId, entityType, entityId, queryClient]
  )

  const debouncedSave = useDebouncedCallback(
    useCallback(
      (patch: Partial<ProfileForm>) => {
        if (!initialisedRef.current) return
        saveToDb(patch)
      },
      [saveToDb]
    ),
    800
  )

  // ── Field change handlers ────────────────────────────────────────────────

  // String / select fields
  const handleString = useCallback(
    (field: keyof ProfileForm, value: string) => {
      const normalised = value === '__none__' ? '' : value
      setForm((prev) => {
        const next = { ...prev, [field]: normalised }
        debouncedSave({ [field]: normalised || null })
        return next
      })
    },
    [debouncedSave]
  )

  // Boolean / checkbox fields
  const handleBool = useCallback(
    (field: keyof ProfileForm, checked: boolean) => {
      setForm((prev) => {
        const next = { ...prev, [field]: checked }
        debouncedSave({ [field]: checked })
        return next
      })
    },
    [debouncedSave]
  )

  // ── Read-only lock (lead converted) ──────────────────────────────────────
  const isLocked = entityType === 'lead' && isConverted

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading && !contact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <User className="h-4 w-4" />
            Client Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!contact) {
    return (
      <Card className="border-dashed border-slate-200 bg-slate-50/50">
        <CardContent className="py-8 flex flex-col items-center text-center gap-2">
          <User className="h-7 w-7 text-slate-300" />
          <p className="text-sm text-slate-400">No contact linked to this record.</p>
        </CardContent>
      </Card>
    )
  }

  // ── Save indicator ────────────────────────────────────────────────────────
  const SaveIndicator = () => {
    if (saveState === 'saving') {
      return (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </span>
      )
    }
    if (saveState === 'saved') {
      return (
        <Badge variant="outline" className="text-[11px] text-emerald-600 border-emerald-200 bg-emerald-950/30 gap-1 py-0 px-2">
          <CheckCircle2 className="h-3 w-3" />
          Saved
        </Badge>
      )
    }
    if (saveState === 'error') {
      return (
        <span className="text-xs text-red-500">Save failed  -  please retry</span>
      )
    }
    return null
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <User className="h-4 w-4" />
          Client Profile
          {isLocked && (
            <Badge variant="outline" className="ml-1 text-[11px] text-slate-500 border-slate-200 gap-1 py-0 px-2">
              <Lock className="h-3 w-3" />
              Read-only
            </Badge>
          )}
          <span className="ml-auto">
            <SaveIndicator />
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Intake note */}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {entityType === 'matter'
            ? 'Saves to the contact record and syncs to People on File for this matter.'
            : 'Collected at intake  -  flows into the matter file on conversion.'}
        </p>

        {isLocked && (
          <p className="text-[11px] text-amber-600 bg-amber-950/30 border border-amber-200 rounded-md px-3 py-2">
            Data locked after conversion  -  edit in the matter.
          </p>
        )}

        {/* ── Row 1: Date of Birth / Gender / Marital Status ────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Date of Birth</Label>
            <TenantDateInput
              className="h-9 text-sm"
              value={form.date_of_birth}
              disabled={isLocked}
              onChange={(iso) => handleString('date_of_birth', iso)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Gender</Label>
            <Select
              value={form.gender || '__none__'}
              onValueChange={(v) => handleString('gender', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Marital Status</Label>
            <Select
              value={form.marital_status || '__none__'}
              onValueChange={(v) => handleString('marital_status', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {MARITAL_STATUSES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Row 2: Nationality / Country of Birth / Country of Residence ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Nationality</Label>
            <Select
              value={form.nationality || '__none__'}
              onValueChange={(v) => handleString('nationality', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {FULL_COUNTRY_LIST.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Country of Birth</Label>
            <Select
              value={form.country_of_birth || '__none__'}
              onValueChange={(v) => handleString('country_of_birth', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {FULL_COUNTRY_LIST.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Country of Residence</Label>
            <Select
              value={form.country_of_residence || '__none__'}
              onValueChange={(v) => handleString('country_of_residence', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {FULL_COUNTRY_LIST.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Row 3: Immigration Status / Expiry / Currently in Canada ───── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Immigration Status</Label>
            <Select
              value={form.immigration_status || '__none__'}
              onValueChange={(v) => handleString('immigration_status', v)}
              disabled={isLocked}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__"> -  Not specified  - </SelectItem>
                {IMMIGRATION_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Status Expiry</Label>
            <TenantDateInput
              className="h-9 text-sm"
              value={form.immigration_status_expiry}
              disabled={isLocked}
              onChange={(iso) => handleString('immigration_status_expiry', iso)}
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="currently_in_canada"
              checked={form.currently_in_canada}
              disabled={isLocked}
              onCheckedChange={(checked) =>
                handleBool('currently_in_canada', Boolean(checked))
              }
            />
            <Label
              htmlFor="currently_in_canada"
              className="text-xs text-slate-600 cursor-pointer leading-tight"
            >
              Currently in Canada
            </Label>
          </div>
        </div>

        {/* ── Row 4: Flags ──────────────────────────────────────────────── */}
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Risk Flags
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="criminal_charges"
                checked={form.criminal_charges}
                disabled={isLocked}
                onCheckedChange={(checked) =>
                  handleBool('criminal_charges', Boolean(checked))
                }
              />
              <Label
                htmlFor="criminal_charges"
                className="text-xs text-slate-600 cursor-pointer leading-tight"
              >
                Criminal Charges
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="inadmissibility_flag"
                checked={form.inadmissibility_flag}
                disabled={isLocked}
                onCheckedChange={(checked) =>
                  handleBool('inadmissibility_flag', Boolean(checked))
                }
              />
              <Label
                htmlFor="inadmissibility_flag"
                className="text-xs text-slate-600 cursor-pointer leading-tight"
              >
                Inadmissibility Concern
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="travel_history_flag"
                checked={form.travel_history_flag}
                disabled={isLocked}
                onCheckedChange={(checked) =>
                  handleBool('travel_history_flag', Boolean(checked))
                }
              />
              <Label
                htmlFor="travel_history_flag"
                className="text-xs text-slate-600 cursor-pointer leading-tight"
              >
                Travel History Issues
              </Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
