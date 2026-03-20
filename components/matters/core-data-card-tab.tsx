'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Shield,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
  Loader2,
  User,
  Users,
  Save,
  CheckCircle2,
  Info,
  ChevronsUpDown,
  Check,
  X,
  ExternalLink,
} from 'lucide-react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useMatter } from '@/lib/queries/matters'
import { useMatterIntake } from '@/lib/queries/matter-intake'
import { useUpsertMatterIntake, useRecalculateRisk, useOverrideRisk } from '@/lib/queries/matter-intake'
import { useMatterPeople, useCreateMatterPerson, useUpdateMatterPerson, useDeleteMatterPerson } from '@/lib/queries/matter-people'
import { useContacts } from '@/lib/queries/contacts'
import { matterIntakeSchema, riskOverrideSchema } from '@/lib/schemas/matter-intake'
import { matterPersonSchema } from '@/lib/schemas/matter-people'
import type { MatterIntakeFormValues, RiskOverrideFormValues } from '@/lib/schemas/matter-intake'
import type { MatterPersonFormValues } from '@/lib/schemas/matter-people'
import { RiskBadge } from '@/components/matters/risk-badge'
import {
  PERSON_ROLES,
  IMMIGRATION_STATUSES,
  MARITAL_STATUSES,
  PROCESSING_STREAMS,
  INTAKE_DELEGATION_MODES,
  GENDERS,
  RISK_LEVELS,
  FULL_COUNTRY_LIST,
  WORK_PERMIT_TYPES,
  COMMON_OCCUPATIONS,
  PROGRAM_CATEGORIES,
} from '@/lib/utils/constants'
import { CANADIAN_PROVINCES } from '@/lib/utils/visitor-visa-constants'
import { NOC_CODES, getNocTitle } from '@/lib/utils/noc-codes'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface CoreDataCardTabProps {
  matterId: string
  tenantId: string
  /** Per-field visibility overrides from matter type section config */
  fieldConfig?: Record<string, { visible: boolean }> | null
}

export function CoreDataCardTab({ matterId, tenantId, fieldConfig }: CoreDataCardTabProps) {
  /** Check if a field should be visible (defaults to true when no config) */
  const isFieldVisible = useCallback(
    (fieldKey: string): boolean => {
      if (!fieldConfig) return true
      return fieldConfig[fieldKey]?.visible !== false
    },
    [fieldConfig],
  )

  const { data: matter } = useMatter(matterId)
  const { data: intake, isLoading: intakeLoading } = useMatterIntake(matterId)
  const { data: people, isLoading: peopleLoading } = useMatterPeople(matterId)
  const upsertIntake = useUpsertMatterIntake()
  const recalculateRisk = useRecalculateRisk()
  const overrideRisk = useOverrideRisk()
  const createPerson = useCreateMatterPerson()
  const updatePerson = useUpdateMatterPerson()
  const deletePerson = useDeleteMatterPerson()

  // Fetch the matter type name + program_category_key from the matter_types table
  // (the text column on matters is often stale/null; program_category_key drives the playbook)
  const { data: matterTypeData } = useQuery({
    queryKey: ['matter_types', 'info', matter?.matter_type_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_types')
        .select('name, program_category_key')
        .eq('id', matter!.matter_type_id!)
        .single()
      return data ?? null
    },
    enabled: !!matter?.matter_type_id,
    staleTime: 5 * 60 * 1000,
  })
  const matterTypeName = matterTypeData?.name ?? null
  // When matter type has a program_category_key the playbook is fixed; when null the user must choose per-matter
  const matterTypeProgramCategoryKey = matterTypeData?.program_category_key ?? null

  const [overrideOpen, setOverrideOpen] = useState(false)
  const [personEditId, setPersonEditId] = useState<string | null>(null)
  const [personAddOpen, setPersonAddOpen] = useState(false)

  const isLocked = intake?.intake_status === 'locked'
  const isLoading = intakeLoading || peopleLoading
  const effectiveRiskLevel = intake?.risk_override_level ?? intake?.risk_level

  // ─── Intake Form ──────────────────────────────────────────────────────────

  const intakeForm = useForm<MatterIntakeFormValues>({
    resolver: zodResolver(matterIntakeSchema),
    values: {
      processing_stream: (intake?.processing_stream as any) ?? null,
      program_category: intake?.program_category ?? matterTypeProgramCategoryKey ?? null,
      jurisdiction: intake?.jurisdiction ?? 'CA',
      intake_delegation: (intake?.intake_delegation as any) ?? 'pa_only',
    },
  })

  const onSaveIntake = useCallback(
    (values: MatterIntakeFormValues) => {
      upsertIntake.mutate({
        matterId,
        tenantId,
        data: values,
      })
    },
    [matterId, tenantId, upsertIntake]
  )

  // ─── Override Form ──────────────────────────────────────────────────────────

  const overrideForm = useForm<RiskOverrideFormValues>({
    resolver: zodResolver(riskOverrideSchema),
    defaultValues: {
      risk_override_level: 'medium',
      risk_override_reason: '',
    },
  })

  const onSubmitOverride = useCallback(
    (values: RiskOverrideFormValues) => {
      if (!intake) return
      overrideRisk.mutate(
        {
          matterId,
          overrideLevel: values.risk_override_level,
          overrideReason: values.risk_override_reason,
          previousLevel: intake.risk_level,
        },
        {
          onSuccess: () => {
            setOverrideOpen(false)
            overrideForm.reset()
          },
        }
      )
    },
    [intake, matterId, overrideRisk, overrideForm]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Locked Banner */}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <Lock className="size-4" />
          Core Data Card is locked. No changes can be made.
        </div>
      )}

      {/* Strategic Variables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" />
            Strategic Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={intakeForm.handleSubmit(onSaveIntake)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Processing Stream */}
              {isFieldVisible('processing_stream') && (
                <div className="space-y-2">
                  <Label>Processing Stream</Label>
                  <Select
                    disabled={isLocked}
                    value={intakeForm.watch('processing_stream') ?? ''}
                    onValueChange={(v) => intakeForm.setValue('processing_stream', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stream..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PROCESSING_STREAMS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Program Category — editable, pre-filled from matter type */}
              {isFieldVisible('program_category') && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Programme Category
                  </Label>
                  <Select
                    disabled={isLocked}
                    value={intakeForm.watch('program_category') ?? ''}
                    onValueChange={(v) => intakeForm.setValue('program_category', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select immigration stream…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROGRAM_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {matterTypeProgramCategoryKey && (
                    <p className="text-xs text-muted-foreground">Auto-set from matter type — change if needed.</p>
                  )}
                </div>
              )}

              {/* Jurisdiction (Province dropdown) */}
              {isFieldVisible('jurisdiction') && (
                <div className="space-y-2">
                  <Label>Jurisdiction</Label>
                  <Select
                    disabled={isLocked}
                    value={intakeForm.watch('jurisdiction') ?? ''}
                    onValueChange={(v) => intakeForm.setValue('jurisdiction', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select province..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FED">Federal</SelectItem>
                      {CANADIAN_PROVINCES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {intakeForm.formState.errors.jurisdiction && (
                    <p className="text-xs text-destructive">
                      {intakeForm.formState.errors.jurisdiction.message}
                    </p>
                  )}
                </div>
              )}

              {/* Delegation Mode */}
              {isFieldVisible('intake_delegation') && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Intake Delegation
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          <p><strong>PA Only:</strong> Only the principal applicant fills the intake form</p>
                          <p><strong>Spouse Only:</strong> Only the spouse/partner fills the intake form</p>
                          <p><strong>Each Own:</strong> Each person completes their own section independently</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Select
                    disabled={isLocked}
                    value={intakeForm.watch('intake_delegation') ?? 'pa_only'}
                    onValueChange={(v) => intakeForm.setValue('intake_delegation', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTAKE_DELEGATION_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!isLocked && (
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={upsertIntake.isPending}
                >
                  {upsertIntake.isPending ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-3.5" />
                  )}
                  Save Strategic Variables
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* People Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              People on File
              {people && people.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[11px]">
                  {people.length}
                </Badge>
              )}
            </CardTitle>
            {!isLocked && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPersonAddOpen(true)}
              >
                <Plus className="mr-1 size-3.5" />
                Add Person
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(!people || people.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <User className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No people added yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add the principal applicant to begin.
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {people.map((person) => {
                const roleLabel = PERSON_ROLES.find((r) => r.value === person.person_role)?.label ?? person.person_role
                return (
                  <AccordionItem key={person.id} value={person.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <User className="size-4 text-slate-400" />
                        <div className="text-left">
                          <span className="font-medium">
                            {person.first_name} {person.last_name}
                          </span>
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {roleLabel}
                          </Badge>
                        </div>
                        {person.section_complete && (
                          <CheckCircle2 className="size-3.5 text-green-500" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <PersonDetailView
                        person={person}
                        isLocked={isLocked}
                        matterId={matterId}
                        tenantId={tenantId}
                        onUpdate={updatePerson}
                        onDelete={deletePerson}
                      />
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Validation & Risk Panel */}
      {intake && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="size-4" />
                Validation & Risk
              </CardTitle>
              <div className="flex items-center gap-2">
                {!isLocked && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => recalculateRisk.mutate({ matterId })}
                      disabled={recalculateRisk.isPending}
                    >
                      {recalculateRisk.isPending ? (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 size-3.5" />
                      )}
                      Recalculate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOverrideOpen(true)}
                      disabled={!intake.risk_level}
                    >
                      Override Risk
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Risk Display */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{intake.risk_score ?? '—'}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Risk Score
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        Risk is auto-calculated when Strategic Variables or People data is saved. Click &quot;Recalculate&quot; to refresh manually.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <RiskBadge level={effectiveRiskLevel} score={intake.risk_score} showScore={false} size="lg" />
              {intake.risk_override_level && (
                <div className="text-xs text-muted-foreground">
                  Overridden from{' '}
                  <RiskBadge level={intake.risk_level} size="sm" />
                  <p className="mt-1 italic">{intake.risk_override_reason}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Red Flags / Hard Stops */}
            {Array.isArray(intake.red_flags) && intake.red_flags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-amber-500" />
                  Issues ({(intake.red_flags as any[]).length})
                </h4>
                <div className="space-y-1.5">
                  {(intake.red_flags as any[]).map((flag: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
                        flag.severity === 'hard_stop'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      )}
                    >
                      {flag.severity === 'hard_stop' ? (
                        <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                      )}
                      <span>{flag.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completion */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-blue-500"
                  style={{ width: `${intake.completion_pct}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {intake.completion_pct}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Person Add Dialog */}
      <PersonFormDialog
        open={personAddOpen}
        onOpenChange={setPersonAddOpen}
        mode="add"
        matterId={matterId}
        tenantId={tenantId}
        onSubmit={(values) => {
          createPerson.mutate(
            {
              tenant_id: tenantId,
              matter_id: matterId,
              ...values,
            },
            { onSuccess: () => setPersonAddOpen(false) }
          )
        }}
        isPending={createPerson.isPending}
      />

      {/* Risk Override Dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Risk Level</DialogTitle>
            <DialogDescription>
              Override the calculated risk level. This requires a mandatory justification.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={overrideForm.handleSubmit(onSubmitOverride)} className="space-y-4">
            <div className="space-y-2">
              <Label>New Risk Level</Label>
              <Select
                value={overrideForm.watch('risk_override_level')}
                onValueChange={(v) => overrideForm.setValue('risk_override_level', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span style={{ color: r.color }}>{r.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Justification (min 10 characters)</Label>
              <Textarea
                {...overrideForm.register('risk_override_reason')}
                placeholder="Explain why you are overriding the risk level..."
                rows={3}
              />
              {overrideForm.formState.errors.risk_override_reason && (
                <p className="text-xs text-destructive">
                  {overrideForm.formState.errors.risk_override_reason.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOverrideOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={overrideRisk.isPending}>
                {overrideRisk.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                Apply Override
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── PersonDetailView (inline in accordion) ─────────────────────────────────

function PersonDetailView({
  person,
  isLocked,
  matterId,
  tenantId,
  onUpdate,
  onDelete,
}: {
  person: any
  isLocked: boolean
  matterId: string
  tenantId: string
  onUpdate: any
  onDelete: any
}) {
  const [editing, setEditing] = useState(false)

  if (editing && !isLocked) {
    return (
      <PersonFormInline
        person={person}
        matterId={matterId}
        tenantId={tenantId}
        onSave={(values) => {
          onUpdate.mutate(
            { id: person.id, matterId, tenantId, updates: values },
            { onSuccess: () => setEditing(false) }
          )
        }}
        onCancel={() => setEditing(false)}
        isPending={onUpdate.isPending}
      />
    )
  }

  const fields = [
    { label: 'Date of Birth', value: person.date_of_birth },
    { label: 'Gender', value: person.gender },
    { label: 'Nationality', value: person.nationality },
    { label: 'Email', value: person.email },
    { label: 'Phone', value: person.phone },
    { label: 'Immigration Status', value: person.immigration_status?.replace(/_/g, ' ') },
    { label: 'Status Expiry', value: person.status_expiry_date },
    { label: 'Country of Residence', value: person.country_of_residence },
    { label: 'Currently in Canada', value: person.currently_in_canada === true ? 'Yes' : person.currently_in_canada === false ? 'No' : null },
    { label: 'Marital Status', value: person.marital_status?.replace(/_/g, ' ') },
    { label: 'Criminal Charges', value: person.criminal_charges ? 'Yes' : null },
    { label: 'Inadmissibility', value: person.inadmissibility_flag ? 'Yes' : null },
    { label: 'Employer', value: person.employer_name },
    { label: 'Occupation', value: person.occupation },
    { label: 'NOC Code', value: person.noc_code },
  ].filter((f) => f.value != null && f.value !== '')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <p className="text-sm capitalize">{f.value}</p>
          </div>
        ))}
      </div>
      {!isLocked && (
        <div className="flex gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() =>
              onDelete.mutate({
                id: person.id,
                matterId,
                tenantId,
                personName: `${person.first_name} ${person.last_name}`,
              })
            }
          >
            <Trash2 className="mr-1 size-3.5" />
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── PersonFormInline (edit mode inside accordion) ───────────────────────────

function PersonFormInline({
  person,
  matterId,
  tenantId,
  onSave,
  onCancel,
  isPending,
}: {
  person: any
  matterId: string
  tenantId: string
  onSave: (values: any) => void
  onCancel: () => void
  isPending: boolean
}) {
  const form = useForm<MatterPersonFormValues>({
    resolver: zodResolver(matterPersonSchema),
    defaultValues: {
      person_role: person.person_role,
      first_name: person.first_name,
      last_name: person.last_name,
      middle_name: person.middle_name ?? '',
      date_of_birth: person.date_of_birth ?? '',
      gender: person.gender ?? '',
      nationality: person.nationality ?? '',
      country_of_birth: person.country_of_birth ?? '',
      email: person.email ?? '',
      phone: person.phone ?? '',
      immigration_status: person.immigration_status ?? '',
      status_expiry_date: person.status_expiry_date ?? '',
      marital_status: person.marital_status ?? '',
      currently_in_canada: person.currently_in_canada ?? null,
      country_of_residence: person.country_of_residence ?? '',
      criminal_charges: person.criminal_charges ?? false,
      criminal_details: person.criminal_details ?? '',
      inadmissibility_flag: person.inadmissibility_flag ?? false,
      inadmissibility_details: person.inadmissibility_details ?? '',
      travel_history_flag: person.travel_history_flag ?? false,
      previous_marriage: person.previous_marriage ?? false,
      number_of_dependents: person.number_of_dependents ?? 0,
      employer_name: person.employer_name ?? '',
      occupation: person.occupation ?? '',
      noc_code: person.noc_code ?? '',
      work_permit_type: person.work_permit_type ?? '',
      relationship_to_pa: person.relationship_to_pa ?? '',
    },
  })

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
      <PersonFormFields form={form} />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}

// ─── PersonFormDialog (add new person) ───────────────────────────────────────

function PersonFormDialog({
  open,
  onOpenChange,
  mode,
  matterId,
  tenantId,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'add'
  matterId: string
  tenantId: string
  onSubmit: (values: MatterPersonFormValues) => void
  isPending: boolean
}) {
  const [contactSearch, setContactSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [linkedContactName, setLinkedContactName] = useState<string | null>(null)

  const { data: contactResults } = useContacts({
    tenantId,
    search: contactSearch.length >= 2 ? contactSearch : undefined,
    pageSize: 8,
  })

  const form = useForm<MatterPersonFormValues>({
    resolver: zodResolver(matterPersonSchema),
    defaultValues: {
      person_role: 'principal_applicant',
      first_name: '',
      last_name: '',
      criminal_charges: false,
      inadmissibility_flag: false,
      previous_marriage: false,
      number_of_dependents: 0,
      travel_history_flag: false,
    },
  })

  function selectContact(contact: {
    id: string
    first_name: string | null
    last_name: string | null
    email_primary: string | null
    phone_primary: string | null
  }) {
    form.setValue('contact_id', contact.id)
    form.setValue('first_name', contact.first_name ?? '')
    form.setValue('last_name', contact.last_name ?? '')
    if (contact.email_primary) form.setValue('email', contact.email_primary)
    if (contact.phone_primary) form.setValue('phone', contact.phone_primary)
    setLinkedContactName(`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim())
    setSearchOpen(false)
    setContactSearch('')
  }

  function clearLinkedContact() {
    form.setValue('contact_id', null)
    setLinkedContactName(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Person</DialogTitle>
          <DialogDescription>
            Add a person to this matter file.
          </DialogDescription>
        </DialogHeader>

        {/* Contact search / link */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Link to existing contact (optional)</Label>
          {linkedContactName ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
              <User className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{linkedContactName}</span>
              <Badge variant="secondary" className="text-[10px] ml-0.5">linked</Badge>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={clearLinkedContact}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-start font-normal h-9 text-sm text-muted-foreground"
                >
                  <User className="mr-2 size-3.5" />
                  Search contacts to pre-fill...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[480px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name or email..."
                    value={contactSearch}
                    onValueChange={setContactSearch}
                  />
                  <CommandList>
                    {!contactResults?.contacts || contactResults.contacts.length === 0 ? (
                      <CommandEmpty>
                        {contactSearch.length < 2 ? 'Type at least 2 characters to search...' : 'No contacts found.'}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {contactResults.contacts.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => selectContact(c)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{c.first_name} {c.last_name}</span>
                              {c.email_primary && (
                                <span className="text-xs text-muted-foreground">{c.email_primary}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <Separator />

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <PersonFormFields form={form} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              Add Person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Searchable Country Combobox ─────────────────────────────────────────────

function CountryCombobox({
  value,
  onChange,
  placeholder = 'Select country...',
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const label = FULL_COUNTRY_LIST.find((c) => c.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9 text-sm">
          {label ?? <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {FULL_COUNTRY_LIST.map((c) => (
                <CommandItem
                  key={c.value}
                  value={`${c.label} ${c.value}`}
                  onSelect={() => { onChange(c.value); setOpen(false) }}
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5', value === c.value ? 'opacity-100' : 'opacity-0')} />
                  {c.label}
                  <span className="ml-auto text-xs text-muted-foreground">{c.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Multi-Select Country Combobox (for Nationality) ─────────────────────────

function CountryMultiSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedCodes = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []

  const toggleCountry = (code: string) => {
    const next = selectedCodes.includes(code)
      ? selectedCodes.filter((c) => c !== code)
      : [...selectedCodes, code]
    onChange(next.join(', '))
  }

  const removeCountry = (code: string) => {
    const next = selectedCodes.filter((c) => c !== code)
    onChange(next.join(', '))
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9 text-sm">
            {selectedCodes.length > 0
              ? `${selectedCodes.length} selected`
              : <span className="text-muted-foreground">Select nationalities...</span>}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {FULL_COUNTRY_LIST.map((c) => (
                  <CommandItem
                    key={c.value}
                    value={`${c.label} ${c.value}`}
                    onSelect={() => toggleCountry(c.value)}
                  >
                    <Check className={cn('mr-2 h-3.5 w-3.5', selectedCodes.includes(c.value) ? 'opacity-100' : 'opacity-0')} />
                    {c.label}
                    <span className="ml-auto text-xs text-muted-foreground">{c.value}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedCodes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCodes.map((code) => {
            const country = FULL_COUNTRY_LIST.find((c) => c.value === code)
            return (
              <Badge key={code} variant="secondary" className="text-xs gap-1 pr-1">
                {country?.label ?? code}
                <button
                  type="button"
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  onClick={() => removeCountry(code)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── NOC Code Searchable Dropdown ────────────────────────────────────────────

function NocCodeCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const nocTitle = value ? getNocTitle(value) : undefined

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9 text-sm">
            {value
              ? <span className="truncate">{value}{nocTitle ? ` — ${nocTitle}` : ''}</span>
              : <span className="text-muted-foreground">Search NOC code...</span>}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by code or title..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No NOC code found.</CommandEmpty>
              <CommandGroup>
                {NOC_CODES.map((noc) => (
                  <CommandItem
                    key={noc.code}
                    value={`${noc.code} ${noc.title}`}
                    onSelect={() => { onChange(noc.code); setOpen(false) }}
                  >
                    <Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', value === noc.code ? 'opacity-100' : 'opacity-0')} />
                    <span className="font-mono text-xs mr-2">{noc.code}</span>
                    <span className="truncate">{noc.title}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] shrink-0">TEER {noc.teer}</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && nocTitle && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {nocTitle}
          <a
            href={`https://noc.esdc.gc.ca/Structure/NocProfile?objectId=${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      )}
    </div>
  )
}

// ─── Occupation Combobox (with presets + custom) ─────────────────────────────

function OccupationCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Filter by search, but always show if nothing typed
  const filtered = useMemo(() => {
    if (!search) return COMMON_OCCUPATIONS
    const lower = search.toLowerCase()
    return COMMON_OCCUPATIONS.filter((o) => o.toLowerCase().includes(lower))
  }, [search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-9 text-sm">
          {value || <span className="text-muted-foreground">Select or type occupation...</span>}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search occupation..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {search ? (
                <button
                  type="button"
                  className="w-full py-2 text-sm text-blue-600 hover:underline"
                  onClick={() => { onChange(search); setOpen(false); setSearch('') }}
                >
                  Use &quot;{search}&quot;
                </button>
              ) : (
                'Type to search...'
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((occ) => (
                <CommandItem
                  key={occ}
                  value={occ}
                  onSelect={() => { onChange(occ); setOpen(false); setSearch('') }}
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5', value === occ ? 'opacity-100' : 'opacity-0')} />
                  {occ}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── PersonFormFields (shared between inline edit and dialog) ────────────────

function PersonFormFields({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      {/* Role */}
      <div className="space-y-2">
        <Label>Role</Label>
        <Select
          value={form.watch('person_role')}
          onValueChange={(v) => form.setValue('person_role', v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSON_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Identity */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>First Name *</Label>
          <Input {...form.register('first_name')} />
          {form.formState.errors.first_name && (
            <p className="text-xs text-destructive">{form.formState.errors.first_name.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Middle Name</Label>
          <Input {...form.register('middle_name')} />
        </div>
        <div className="space-y-1">
          <Label>Last Name *</Label>
          <Input {...form.register('last_name')} />
          {form.formState.errors.last_name && (
            <p className="text-xs text-destructive">{form.formState.errors.last_name.message}</p>
          )}
        </div>
      </div>

      {/* DOB + Gender + Marital Status in one row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Date of Birth</Label>
          <Input type="date" {...form.register('date_of_birth')} />
          {form.formState.errors.date_of_birth && (
            <p className="text-xs text-destructive">{form.formState.errors.date_of_birth.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Gender</Label>
          <Select
            value={form.watch('gender') ?? ''}
            onValueChange={(v) => form.setValue('gender', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Marital Status</Label>
          <Select
            value={form.watch('marital_status') ?? ''}
            onValueChange={(v) => form.setValue('marital_status', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {MARITAL_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Nationality (multi-select country dropdown) */}
      <div className="space-y-1">
        <Label>Nationality</Label>
        <CountryMultiSelect
          value={form.watch('nationality') ?? ''}
          onChange={(val) => form.setValue('nationality', val)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...form.register('email')} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...form.register('phone')} />
        </div>
      </div>

      <Separator />

      {/* Immigration */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Immigration Status</Label>
          <Select
            value={form.watch('immigration_status') ?? ''}
            onValueChange={(v) => form.setValue('immigration_status', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {IMMIGRATION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status Expiry Date</Label>
          <Input type="date" {...form.register('status_expiry_date')} />
        </div>
        <div className="space-y-1">
          <Label>Country of Residence</Label>
          <CountryCombobox
            value={form.watch('country_of_residence') ?? ''}
            onChange={(val) => form.setValue('country_of_residence', val)}
          />
        </div>
      </div>

      {/* Boolean flags */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="currently_in_canada"
            checked={form.watch('currently_in_canada') === true}
            onCheckedChange={(checked) => form.setValue('currently_in_canada', checked === true ? true : false)}
          />
          <Label htmlFor="currently_in_canada" className="font-normal">Currently in Canada</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="previous_marriage"
            checked={form.watch('previous_marriage')}
            onCheckedChange={(checked) => form.setValue('previous_marriage', checked === true)}
          />
          <Label htmlFor="previous_marriage" className="font-normal">Previous Marriage / Relationship</Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="criminal_charges"
            checked={form.watch('criminal_charges')}
            onCheckedChange={(checked) => form.setValue('criminal_charges', checked === true)}
          />
          <Label htmlFor="criminal_charges" className="font-normal">Criminal Charges</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="inadmissibility_flag"
            checked={form.watch('inadmissibility_flag')}
            onCheckedChange={(checked) => form.setValue('inadmissibility_flag', checked === true)}
          />
          <Label htmlFor="inadmissibility_flag" className="font-normal">Inadmissibility Concern</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="travel_history_flag"
            checked={form.watch('travel_history_flag')}
            onCheckedChange={(checked) => form.setValue('travel_history_flag', checked === true)}
          />
          <Label htmlFor="travel_history_flag" className="font-normal">Travel History</Label>
        </div>
      </div>

      {form.watch('criminal_charges') && (
        <div className="space-y-1">
          <Label>Criminal Details</Label>
          <Textarea {...form.register('criminal_details')} rows={2} />
        </div>
      )}

      {form.watch('inadmissibility_flag') && (
        <div className="space-y-1">
          <Label>Inadmissibility Details</Label>
          <Textarea {...form.register('inadmissibility_details')} rows={2} />
        </div>
      )}

      <Separator />

      {/* Employment */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Employer Name</Label>
          <Input {...form.register('employer_name')} />
        </div>
        <div className="space-y-1">
          <Label>Occupation</Label>
          <OccupationCombobox
            value={form.watch('occupation') ?? ''}
            onChange={(val) => form.setValue('occupation', val)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>NOC Code</Label>
          <NocCodeCombobox
            value={form.watch('noc_code') ?? ''}
            onChange={(val) => form.setValue('noc_code', val)}
          />
        </div>
        <div className="space-y-1">
          <Label>Work Permit Type</Label>
          <Select
            value={form.watch('work_permit_type') ?? ''}
            onValueChange={(v) => form.setValue('work_permit_type', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {WORK_PERMIT_TYPES.map((w) => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Relationship (non-PA) */}
      {form.watch('person_role') !== 'principal_applicant' && (
        <div className="space-y-1">
          <Label>Relationship to PA</Label>
          <Input {...form.register('relationship_to_pa')} />
        </div>
      )}

      {/* Dependents count (PA only) */}
      {form.watch('person_role') === 'principal_applicant' && (
        <div className="space-y-1 max-w-[200px]">
          <Label>Number of Dependents</Label>
          <Input
            type="number"
            min={0}
            {...form.register('number_of_dependents', { valueAsNumber: true })}
          />
        </div>
      )}
    </div>
  )
}
