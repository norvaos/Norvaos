'use client'

/**
 * OnboardingTab  -  Persistent matter onboarding checklist.
 *
 * Sections:
 *  1. Assignment & Ownership  -  responsible lawyer, staff, priority
 *  2. Key Dates  -  statute of limitations, next deadline, opened date
 *  3. Contact Verification  -  primary and secondary contacts
 *  4. Case Configuration  -  matter-type-driven dynamic questions (placeholder)
 *  5. Notifications  -  confirm assignment emails sent to lawyer/staff
 *
 * Each section shows a "Confirm" button that marks it as verified.
 * The tab header shows an orange badge with the count of unconfirmed sections.
 */

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle2,
  Circle,
  Users,
  CalendarDays,
  UserCheck,
  Settings2,
  Bell,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  AlertTriangle,
  Mail,
  X,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import {
  useMatterOnboardingSteps,
  useConfirmOnboardingStep,
  useUnconfirmOnboardingStep,
  ONBOARDING_STEPS,
  type OnboardingStepKey,
} from '@/lib/queries/matter-onboarding'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import type { Database } from '@/lib/types/database'
import { useQuery, useMutation } from '@tanstack/react-query'
import { PRIORITIES } from '@/lib/utils/constants'
import {
  useMatterTypeIntakeSchema,
  type IntakeQuestion,
} from '@/lib/queries/matter-types'
import {
  useMatterDynamicIntakeAnswers,
  useSaveMatterDynamicIntake,
  useMatterIntakeRiskFlags,
  useResolveIntakeRiskFlag,
  useIntakePrefill,
} from '@/lib/queries/matter-intake'

type Matter = Database['public']['Tables']['matters']['Row']
type UserRow = Database['public']['Tables']['users']['Row']
type MatterContact = Database['public']['Tables']['matter_contacts']['Row'] & {
  contact?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    organization_name: string | null
  }
}

interface OnboardingTabProps {
  matter: Matter
  users: UserRow[]
  matterId: string
  tenantId: string
}

// ─── Shared step card wrapper ─────────────────────────────────────────────────

interface StepCardProps {
  stepKey: OnboardingStepKey
  title: string
  icon: React.ReactNode
  confirmedAt: string | null
  onConfirm: () => void
  onUnconfirm: () => void
  isPending: boolean
  children: React.ReactNode
  defaultExpanded?: boolean
}

function StepCard({
  stepKey,
  title,
  icon,
  confirmedAt,
  onConfirm,
  onUnconfirm,
  isPending,
  children,
  defaultExpanded = false,
}: StepCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || !confirmedAt)
  const confirmed = !!confirmedAt

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        confirmed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      )}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={cn('shrink-0', confirmed ? 'text-emerald-600' : 'text-slate-400')}>
          {confirmed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </div>
        <div className={cn('text-slate-500 shrink-0', confirmed && 'text-emerald-600')}>
          {icon}
        </div>
        <span className={cn('flex-1 text-sm font-medium', confirmed ? 'text-emerald-800' : 'text-slate-800')}>
          {title}
        </span>
        {confirmed && (
          <span className="text-[11px] text-emerald-600 shrink-0">
            Confirmed {format(new Date(confirmedAt), 'MMM d')}
          </span>
        )}
        {!confirmed && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] shrink-0">
            Pending
          </Badge>
        )}
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          <Separator className="my-0" />
          <div className="px-4 py-4 space-y-4">
            {children}

            <div className="flex items-center gap-2 pt-2">
              {!confirmed ? (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onConfirm()
                  }}
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Confirm &amp; Mark Complete
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnconfirm()
                  }}
                  disabled={isPending}
                >
                  <X className="mr-1 h-3 w-3" />
                  Revert
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Matter contacts hook ─────────────────────────────────────────────────────

function useMatterContacts(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-contacts-full', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_contacts')
        .select('*, contact:contacts(id, first_name, last_name, email, organization_name)')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data as unknown as MatterContact[]
    },
    enabled: !!matterId && !!tenantId,
    staleTime: 1000 * 60,
  })
}

// ─── Inline editable field ────────────────────────────────────────────────────

function InlineEditSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onSave: (val: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const currentLabel = options.find((o) => o.value === value)?.label ?? value

  async function handleChange(val: string) {
    setSaving(true)
    try {
      await onSave(val)
      setEditing(false)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <Select value={value} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="h-7 text-xs w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{currentLabel || ' - '}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-50 hover:opacity-100"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

function InlineEditDate({
  label,
  value,
  onSave,
}: {
  label: string
  value: string | null | undefined
  onSave: (val: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(draft || null)
      setEditing(false)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const display = value ? format(new Date(value), 'MMM d, yyyy') : <span className="text-muted-foreground italic">Not set</span>

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-xs w-40"
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{display}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-50 hover:opacity-100"
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Notification sender ───────────────────────────────────────────────────────

function useNotificationStatus(matterId: string) {
  return useQuery({
    queryKey: ['matter-notification-sent', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('matter_onboarding_steps')
        .select('confirmed_at')
        .eq('matter_id', matterId)
        .eq('step_key', 'notifications')
        .maybeSingle()
      return (data as any)?.confirmed_at ?? null
    },
    enabled: !!matterId,
  })
}

// ─── Dynamic Intake Form ─────────────────────────────────────────────────────

function DynamicIntakeSection({
  matterId,
  tenantId,
  matterTypeId,
}: {
  matterId: string
  tenantId: string
  matterTypeId: string
}) {
  const { data: schema = [], isLoading: schemaLoading } = useMatterTypeIntakeSchema(matterTypeId)
  const { data: existing, isLoading: answersLoading } = useMatterDynamicIntakeAnswers(matterId)
  const { data: prefill } = useIntakePrefill(matterId)
  const { data: riskFlags = [] } = useMatterIntakeRiskFlags(matterId)
  const saveAnswers = useSaveMatterDynamicIntake()
  const resolveFlag = useResolveIntakeRiskFlag()

  const [answers, setAnswers] = useState<Record<string, string | boolean | null>>({})
  const [dirty, setDirty] = useState(false)

  // Merge: existing matter answers take priority, then pre-fill from lead snapshot
  useEffect(() => {
    const merged: Record<string, string | boolean | null> = {}

    // Layer 1: Pre-fill from lead snapshot (lowest priority)
    if (prefill?.answers) {
      for (const [key, value] of Object.entries(prefill.answers)) {
        if (value !== null && value !== undefined && value !== '') {
          merged[key] = value as string | boolean
        }
      }
    }

    // Layer 2: Existing matter-specific answers overwrite snapshot (highest priority)
    if (existing?.answers) {
      Object.assign(merged, existing.answers)
    }

    setAnswers(merged)
    setDirty(false)
  }, [existing, prefill])

  const isVisible = useCallback((q: IntakeQuestion): boolean => {
    if (!q.show_if) return true
    const dep = answers[q.show_if.question_key]
    const depStr = dep === true ? 'true' : dep === false ? 'false' : String(dep ?? '')
    return depStr === q.show_if.equals
  }, [answers])

  function handleChange(key: string, value: string | boolean | null) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  function handleSave() {
    saveAnswers.mutate({ matterId, tenantId, answers }, {
      onSuccess: () => {
        setDirty(false)
        toast.success('Case configuration saved')
      },
    })
  }

  if (schemaLoading || answersLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    )
  }

  if (schema.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No intake questions configured for this matter type. Add questions in{' '}
        <strong>Settings → Matter Types → Intake Questions</strong>.
      </p>
    )
  }

  const visibleQuestions = schema.filter(isVisible)
  const answered = visibleQuestions.filter((q) => {
    const v = answers[q.key]
    return v !== undefined && v !== null && v !== ''
  }).length
  const completionPct = visibleQuestions.length > 0
    ? Math.round((answered / visibleQuestions.length) * 100)
    : 100

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-red-400'
            )}
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{answered}/{visibleQuestions.length} answered</span>
      </div>

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-red-700">Risk Flags Detected</p>
          {riskFlags.map((flag) => (
            <div key={flag.id} className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs">
              <AlertCircle className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', flag.severity === 'critical' ? 'text-red-600' : 'text-amber-500')} />
              <div className="flex-1 min-w-0">
                <span className="font-medium capitalize">{flag.field_key.replace(/_/g, ' ')}</span>
                {flag.intake_value && <span className="text-muted-foreground">  -  Intake: {flag.intake_value}</span>}
                {flag.ircc_value && <span className="text-muted-foreground"> / IRCC: {flag.ircc_value}</span>}
              </div>
              <Badge variant="outline" className={cn('text-[10px] shrink-0', flag.severity === 'critical' ? 'border-red-300 text-red-700 bg-red-50' : 'border-amber-300 text-amber-700 bg-amber-50')}>
                {flag.severity}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => resolveFlag.mutate({ flagId: flag.id, matterId })}
                title="Resolve flag"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-3">
        {schema.map((q) => {
          if (!isVisible(q)) return null
          const val = answers[q.key]

          const isFromSnapshot = !!(
            prefill?.answers?.[q.key] !== undefined &&
            prefill.answers[q.key] !== null &&
            !existing?.answers?.[q.key]
          )

          return (
            <div key={q.key} className="space-y-1">
              <Label className="text-xs font-medium">
                {q.label}
                {q.required && <span className="text-red-500 ml-1">*</span>}
                {isFromSnapshot && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200">
                    Previously collected
                  </span>
                )}
              </Label>

              {q.type === 'boolean' && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={val === true ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleChange(q.key, true)}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    variant={val === false ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleChange(q.key, false)}
                  >
                    No
                  </Button>
                </div>
              )}

              {q.type === 'select' && (
                <Select
                  value={typeof val === 'string' ? val : ''}
                  onValueChange={(v) => handleChange(q.key, v)}
                >
                  <SelectTrigger className="h-8 text-xs w-64">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(q.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {q.type === 'text' && (
                <Input
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleChange(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  className="h-8 text-xs w-full max-w-sm"
                />
              )}

              {q.type === 'date' && (
                <Input
                  type="date"
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleChange(q.key, e.target.value)}
                  className="h-8 text-xs w-40"
                />
              )}

              {q.help_text && (
                <p className="text-[11px] text-muted-foreground">{q.help_text}</p>
              )}
            </div>
          )
        })}
      </div>

      {dirty && (
        <Button
          size="sm"
          className="text-xs h-7"
          onClick={handleSave}
          disabled={saveAnswers.isPending}
        >
          {saveAnswers.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save Answers
        </Button>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OnboardingTab({ matter, users, matterId, tenantId }: OnboardingTabProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const queryClient = useQueryClient()

  const { data: steps, isLoading } = useMatterOnboardingSteps(matterId)
  const { data: contacts, isLoading: contactsLoading } = useMatterContacts(matterId, tenantId)
  const confirmStep = useConfirmOnboardingStep()
  const unconfirmStep = useUnconfirmOnboardingStep()

  // Helper to get confirmation state
  const getStep = (key: OnboardingStepKey) => steps?.[key] ?? { step_key: key, confirmed_at: null, confirmed_by: null }

  const incompleteCount = ONBOARDING_STEPS.filter((k) => !steps?.[k]?.confirmed_at).length
  const allComplete = incompleteCount === 0

  // ── Mutation to update matter fields inline ──────────────────────────────
  const updateMatter = useMutation({
    mutationFn: async (patch: Partial<Matter>) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matters')
        .update(patch as never)
        .eq('id', matterId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matters', 'detail', matterId] })
    },
  })

  // ── Notification send mutation ─────────────────────────────────────────
  const [notifSent, setNotifSent] = useState(false)
  const sendNotifications = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notifications/matter-assigned`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to send notifications')
      }
    },
    onSuccess: () => {
      setNotifSent(true)
      toast.success('Notifications sent to lawyer and staff')
    },
    onError: (err) => {
      toast.error('Failed to send notifications', { description: (err as Error).message })
    },
  })

  const formatUserName = (u: UserRow) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email

  const lawyerOptions = users.map((u) => ({ value: u.id, label: formatUserName(u) }))
  const priorityOptions = PRIORITIES.map((p) => ({ value: p.value, label: p.label }))

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        allComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      )}>
        {allComplete ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        )}
        <div className="flex-1">
          <p className={cn('text-sm font-medium', allComplete ? 'text-emerald-800' : 'text-amber-800')}>
            {allComplete
              ? 'Onboarding complete  -  matter is ready for active work'
              : `${incompleteCount} of ${ONBOARDING_STEPS.length} onboarding steps remaining`}
          </p>
          {!allComplete && (
            <p className="text-xs text-amber-700 mt-0.5">
              Confirm each section to ensure the matter is properly set up before work begins.
            </p>
          )}
        </div>
        {!allComplete && (
          <div className="text-xs font-semibold text-amber-700 shrink-0">
            {ONBOARDING_STEPS.length - incompleteCount}/{ONBOARDING_STEPS.length}
          </div>
        )}
      </div>

      {/* ── 1. Assignment & Ownership ────────────────────────────────────── */}
      <StepCard
        stepKey="assignment"
        title="Assignment &amp; Ownership"
        icon={<Users className="h-4 w-4" />}
        confirmedAt={getStep('assignment').confirmed_at}
        onConfirm={() => confirmStep.mutate({ matterId, stepKey: 'assignment' })}
        onUnconfirm={() => unconfirmStep.mutate({ matterId, stepKey: 'assignment' })}
        isPending={confirmStep.isPending || unconfirmStep.isPending}
        defaultExpanded
      >
        <div className="space-y-3">
          <InlineEditSelect
            label="Responsible Lawyer"
            value={matter.responsible_lawyer_id ?? ''}
            options={lawyerOptions}
            onSave={async (val) => {
              await updateMatter.mutateAsync({ responsible_lawyer_id: val || null } as never)
            }}
          />
          <InlineEditSelect
            label="Follow-up Staff"
            value={(matter as { followup_lawyer_id?: string }).followup_lawyer_id ?? '__none__'}
            options={[{ value: '__none__', label: ' -  None  - ' }, ...lawyerOptions]}
            onSave={async (val) => {
              await updateMatter.mutateAsync({ followup_lawyer_id: val === '__none__' ? null : val } as never)
            }}
          />
          <InlineEditSelect
            label="Priority"
            value={matter.priority ?? 'medium'}
            options={priorityOptions}
            onSave={async (val) => {
              await updateMatter.mutateAsync({ priority: val } as never)
            }}
          />
        </div>
      </StepCard>

      {/* ── 2. Key Dates ─────────────────────────────────────────────────── */}
      <StepCard
        stepKey="key_dates"
        title="Key Dates"
        icon={<CalendarDays className="h-4 w-4" />}
        confirmedAt={getStep('key_dates').confirmed_at}
        onConfirm={() => confirmStep.mutate({ matterId, stepKey: 'key_dates' })}
        onUnconfirm={() => unconfirmStep.mutate({ matterId, stepKey: 'key_dates' })}
        isPending={confirmStep.isPending || unconfirmStep.isPending}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Matter Opened</span>
            <span className="text-sm font-medium">
              {matter.created_at ? format(new Date(matter.created_at), 'MMM d, yyyy') : ' - '}
            </span>
          </div>
          <InlineEditDate
            label="Statute of Limitations"
            value={matter.statute_of_limitations}
            onSave={async (val) => {
              await updateMatter.mutateAsync({ statute_of_limitations: val } as never)
            }}
          />
          <InlineEditDate
            label="Next Deadline"
            value={matter.next_deadline}
            onSave={async (val) => {
              await updateMatter.mutateAsync({ next_deadline: val } as never)
            }}
          />
          {matter.next_deadline && new Date(matter.next_deadline) < new Date() && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Next deadline has passed  -  please update
            </div>
          )}
        </div>
      </StepCard>

      {/* ── 3. Contact Verification ──────────────────────────────────────── */}
      <StepCard
        stepKey="contacts"
        title="Contact Verification"
        icon={<UserCheck className="h-4 w-4" />}
        confirmedAt={getStep('contacts').confirmed_at}
        onConfirm={() => confirmStep.mutate({ matterId, stepKey: 'contacts' })}
        onUnconfirm={() => unconfirmStep.mutate({ matterId, stepKey: 'contacts' })}
        isPending={confirmStep.isPending || unconfirmStep.isPending}
      >
        {contactsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : contacts && contacts.length > 0 ? (
          <div className="space-y-2">
            {contacts.map((mc) => {
              const c = mc.contact
              if (!c) return null
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || ' - '
              return (
                <div
                  key={mc.id}
                  className="flex items-center gap-3 rounded-md border bg-slate-50 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {c.email && (
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {mc.is_primary ? 'Primary' : mc.role}
                  </Badge>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No contacts linked to this matter yet.</p>
        )}
      </StepCard>

      {/* ── 4. Case Configuration ────────────────────────────────────────── */}
      <StepCard
        stepKey="case_config"
        title="Case Configuration"
        icon={<Settings2 className="h-4 w-4" />}
        confirmedAt={getStep('case_config').confirmed_at}
        onConfirm={() => confirmStep.mutate({ matterId, stepKey: 'case_config' })}
        onUnconfirm={() => unconfirmStep.mutate({ matterId, stepKey: 'case_config' })}
        isPending={confirmStep.isPending || unconfirmStep.isPending}
      >
        {matter.matter_type_id ? (
          <DynamicIntakeSection
            matterId={matterId}
            tenantId={tenantId}
            matterTypeId={matter.matter_type_id}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No matter type assigned  -  please assign one to unlock case configuration
          </div>
        )}
      </StepCard>

      {/* ── 5. Notifications ─────────────────────────────────────────────── */}
      <StepCard
        stepKey="notifications"
        title="Assignment Notifications"
        icon={<Bell className="h-4 w-4" />}
        confirmedAt={getStep('notifications').confirmed_at}
        onConfirm={() => {
          // Auto-send notifications when confirmed
          sendNotifications.mutate()
          confirmStep.mutate({ matterId, stepKey: 'notifications' })
        }}
        onUnconfirm={() => unconfirmStep.mutate({ matterId, stepKey: 'notifications' })}
        isPending={confirmStep.isPending || unconfirmStep.isPending || sendNotifications.isPending}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send an email to the responsible lawyer and assigned staff to notify them that this
            matter has been assigned to them.
          </p>

          {/* Recipients preview */}
          <div className="space-y-1.5">
            {matter.responsible_lawyer_id && (() => {
              const lawyer = users.find((u) => u.id === matter.responsible_lawyer_id)
              return lawyer ? (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{formatUserName(lawyer)}  -  {lawyer.email}</span>
                  <Badge variant="secondary" className="text-[10px]">Lawyer</Badge>
                </div>
              ) : null
            })()}
            {(matter as { followup_lawyer_id?: string }).followup_lawyer_id && (() => {
              const staff = users.find((u) => u.id === (matter as { followup_lawyer_id?: string }).followup_lawyer_id)
              return staff ? (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{formatUserName(staff)}  -  {staff.email}</span>
                  <Badge variant="secondary" className="text-[10px]">Staff</Badge>
                </div>
              ) : null
            })()}
          </div>

          {(notifSent || !!getStep('notifications').confirmed_at) && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Notifications sent
            </div>
          )}

          {!getStep('notifications').confirmed_at && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendNotifications.mutate()}
              disabled={sendNotifications.isPending}
              className="text-xs"
            >
              {sendNotifications.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="mr-1.5 h-3.5 w-3.5" />
              )}
              Send Now
            </Button>
          )}
        </div>
      </StepCard>
    </div>
  )
}
