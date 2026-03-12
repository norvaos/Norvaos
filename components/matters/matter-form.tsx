'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Loader2, Plus, X } from 'lucide-react'

import { matterSchema, type MatterFormValues } from '@/lib/schemas/matter'
import { useTenant } from '@/lib/hooks/use-tenant'
import { BILLING_TYPES, PRIORITIES, MATTER_STATUSES, MATTER_CONTACT_ROLES } from '@/lib/utils/constants'
import { ContactSearch } from '@/components/shared/contact-search'
import {
  useMatterTypes,
  useMatterStagePipelines,
  useMatterStages,
} from '@/lib/queries/matter-types'
import { useRetainerFeeTemplates } from '@/lib/queries/retainer-fee-templates'
import type { ProfessionalFeeItem, GovernmentFeeItem, DisbursementItem } from '@/lib/queries/retainer-fee-templates'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type User = Database['public']['Tables']['users']['Row']

const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'Visible to All', description: 'Everyone in the firm can see this matter' },
  { value: 'owner', label: 'Matter Owner Only', description: 'Only the responsible lawyer can see this matter' },
  { value: 'team', label: 'Team Members', description: 'Only assigned team members can see this matter' },
  { value: 'group', label: 'Practice Group', description: 'Only members of the practice area can see this matter' },
]

interface MatterFormProps {
  mode: 'create' | 'edit'
  defaultValues?: Partial<MatterFormValues>
  onSubmit: (values: MatterFormValues) => void
  isLoading?: boolean
}

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice_areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
  })
}

function useStaff(tenantId: string) {
  return useQuery({
    queryKey: ['users', tenantId, 'staff'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return data as User[]
    },
    enabled: !!tenantId,
  })
}

function formatUserName(user: User): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return name || user.email
}

// Compute estimated value from a fee template's items
function computeTemplateTotal(template: Database['public']['Tables']['retainer_fee_templates']['Row']): number {
  const raw_pf = template.professional_fees as unknown
  const raw_gf = template.government_fees as unknown
  const raw_db = template.disbursements as unknown
  const profFees: ProfessionalFeeItem[] = Array.isArray(raw_pf) ? raw_pf : []
  const govFees: GovernmentFeeItem[] = Array.isArray(raw_gf) ? raw_gf : []
  const disburse: DisbursementItem[] = Array.isArray(raw_db) ? raw_db : []

  const profTotal = profFees.reduce((sum, f) => sum + (f.quantity ?? 0) * (f.unitPrice ?? 0), 0)
  const govTotal = govFees.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  const disbTotal = disburse.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  return profTotal + govTotal + disbTotal
}

export function MatterForm({ mode, defaultValues, onSubmit, isLoading }: MatterFormProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const form = useForm<MatterFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(matterSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      contact_id: undefined,
      additional_contacts: [],
      practice_area_id: '',
      pipeline_id: undefined,
      stage_id: undefined,
      matter_stage_pipeline_id: undefined,
      initial_matter_stage_id: undefined,
      responsible_lawyer_id: '',
      originating_lawyer_id: undefined,
      followup_lawyer_id: undefined,
      billing_type: 'flat_fee',
      hourly_rate: undefined,
      estimated_value: undefined,
      fee_template_id: undefined,
      priority: 'medium',
      status: 'active',
      visibility: 'all',
      statute_of_limitations: undefined,
      next_deadline: undefined,
      ...defaultValues,
    },
  })

  const watchedPracticeAreaId = form.watch('practice_area_id')
  const watchedMatterTypeId = form.watch('matter_type_id')
  const watchedMatterStagePipelineId = form.watch('matter_stage_pipeline_id')
  const watchedBillingType = form.watch('billing_type')
  const watchedFeeTemplateId = form.watch('fee_template_id')

  // ── Data sources (all from command centre / settings) ──────────────────────
  const { data: practiceAreas, isLoading: practiceAreasLoading } = usePracticeAreas(tenantId)
  const { data: matterTypes, isLoading: matterTypesLoading } = useMatterTypes(tenantId, watchedPracticeAreaId || null)

  // Pipeline and stages: sourced from matter type's configuration
  const { data: matterStagePipelines, isLoading: pipelinesLoading } =
    useMatterStagePipelines(tenantId, watchedMatterTypeId)
  const { data: matterStages, isLoading: stagesLoading } =
    useMatterStages(watchedMatterStagePipelineId)

  // Fee templates: sourced from matter type's command centre settings
  const { data: feeTemplates } = useRetainerFeeTemplates(tenantId, watchedMatterTypeId ?? null)

  // Staff: all active users from command centre (never hardcoded)
  const { data: staff, isLoading: staffLoading } = useStaff(tenantId)

  // ── Auto-select default pipeline when matter type changes ──────────────────
  useEffect(() => {
    if (mode !== 'create') return
    form.setValue('matter_stage_pipeline_id', undefined)
    form.setValue('initial_matter_stage_id', undefined)

    if (!watchedMatterTypeId || !matterStagePipelines?.length) return

    const defaultPipeline =
      matterStagePipelines.find((p) => p.is_default) ?? matterStagePipelines[0]
    if (defaultPipeline) {
      form.setValue('matter_stage_pipeline_id', defaultPipeline.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMatterTypeId, matterStagePipelines])

  // ── Auto-select first stage when pipeline changes ─────────────────────────
  useEffect(() => {
    if (mode !== 'create') return
    form.setValue('initial_matter_stage_id', undefined)

    if (!watchedMatterStagePipelineId || !matterStages?.length) return
    form.setValue('initial_matter_stage_id', matterStages[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMatterStagePipelineId, matterStages])

  // ── Auto-populate billing from fee template ────────────────────────────────
  useEffect(() => {
    if (!watchedFeeTemplateId || !feeTemplates) return
    const template = feeTemplates.find((t) => t.id === watchedFeeTemplateId)
    if (!template) return

    form.setValue('billing_type', template.billing_type as MatterFormValues['billing_type'])
    const total = computeTemplateTotal(template)
    if (total > 0) {
      form.setValue('estimated_value', total)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFeeTemplateId, feeTemplates])

  // ── Reset dependent fields when practice area changes ─────────────────────
  useEffect(() => {
    if (mode === 'create') {
      form.setValue('matter_type_id', undefined)
      form.setValue('matter_stage_pipeline_id', undefined)
      form.setValue('initial_matter_stage_id', undefined)
      form.setValue('fee_template_id', undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPracticeAreaId])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Basic Information ──────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Basic Information</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Smith v. Jones" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the matter..."
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Primary Contact — always linked from contacts (command centre) */}
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Contact</FormLabel>
                  <FormControl>
                    <ContactSearch
                      value={field.value ?? ''}
                      onChange={(val) => field.onChange(val || null)}
                      tenantId={tenantId}
                      placeholder="Search or create a contact..."
                    />
                  </FormControl>
                  <FormDescription>
                    Search your contacts or create a new one
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Additional Contacts (create mode only) */}
            {mode === 'create' && (
              <AdditionalContactsSection
                contacts={form.watch('additional_contacts') ?? []}
                onChange={(contacts) => form.setValue('additional_contacts', contacts)}
                tenantId={tenantId}
              />
            )}
          </div>
        </div>

        {/* ── Classification ─────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Classification</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Area *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={practiceAreasLoading ? 'Loading...' : 'Select a practice area'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {practiceAreas?.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id}>
                          {pa.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Matter Type — shown after practice area is selected */}
            {watchedPracticeAreaId && (
              <FormField
                control={form.control}
                name="matter_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={matterTypesLoading ? 'Loading...' : 'Select a matter type (optional)'}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {matterTypes?.map((mt) => (
                          <SelectItem key={mt.id} value={mt.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: mt.color }}
                              />
                              {mt.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Selecting a matter type loads its pipeline, stages, and fee templates automatically
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Pipeline — derived from matter type (command centre), not free-form */}
            {watchedMatterTypeId && (
              <>
                <FormField
                  control={form.control}
                  name="matter_stage_pipeline_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pipeline</FormLabel>
                      {matterStagePipelines && matterStagePipelines.length === 1 ? (
                        // Single pipeline: show as read-only label (no dropdown needed)
                        <div className="flex h-9 items-center rounded-md border bg-slate-50 px-3 text-sm text-slate-700">
                          {matterStagePipelines[0].name}
                          <input type="hidden" value={matterStagePipelines[0].id} onChange={() => {}} />
                        </div>
                      ) : (
                        // Multiple pipelines configured for this matter type: let user choose
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ''}
                          disabled={pipelinesLoading || !matterStagePipelines?.length}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={pipelinesLoading ? 'Loading...' : 'Select pipeline'}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {matterStagePipelines?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}{p.is_default ? ' (Default)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormDescription>
                        Pipeline is configured in Settings → Matter Types
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Initial Stage — from selected pipeline's stages */}
                <FormField
                  control={form.control}
                  name="initial_matter_stage_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Starting Stage</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                        disabled={stagesLoading || !watchedMatterStagePipelineId}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={
                                !watchedMatterStagePipelineId
                                  ? 'Select a pipeline first'
                                  : stagesLoading
                                    ? 'Loading...'
                                    : 'Select starting stage'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {matterStages?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Stages are defined in Settings → Matter Types → Pipeline
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Assignment — all staff from command centre ─────────────────────── */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Assignment</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            {/* Responsible lawyer + follow-up: create mode only.
                In edit mode these are managed inline from the Onboarding tab. */}
            {mode === 'create' && (
              <>
                <FormField
                  control={form.control}
                  name="responsible_lawyer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsible Lawyer *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={staffLoading ? 'Loading...' : 'Select a lawyer'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staff?.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {formatUserName(u)}
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
                  name="followup_lawyer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up Lawyer / Staff</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select follow-up staff (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staff?.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {formatUserName(u)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Person responsible for client follow-up
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground rounded-md border bg-slate-50 px-3 py-2">
                Responsible lawyer and assigned staff are managed from the matter&apos;s{' '}
                <strong>Onboarding tab</strong>.
              </p>
            )}

            <FormField
              control={form.control}
              name="originating_lawyer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Originating Lawyer</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select originating lawyer (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staff?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {formatUserName(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Lawyer who originated this file (for business development tracking)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Billing — sourced from command centre fee templates ────────────── */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Billing</h3>
          <Separator className="my-3" />
          <div className="space-y-4">

            {/* Fee template picker (shown when matter type is selected and templates exist) */}
            {watchedMatterTypeId && feeTemplates && feeTemplates.length > 0 && (
              <FormField
                control={form.control}
                name="fee_template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee Template</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a fee template (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {feeTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              {t.name}
                              {t.is_default && (
                                <span className="text-xs text-slate-400">(Default)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Selecting a template auto-fills billing type and estimated value.
                      Managed in Settings → Fee Templates.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="billing_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select billing type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BILLING_TYPES.map((bt) => (
                        <SelectItem key={bt.value} value={bt.value}>
                          {bt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(watchedBillingType === 'hourly' || watchedBillingType === 'hybrid') && (
              <FormField
                control={form.control}
                name="hourly_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate (CAD)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="estimated_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Value (CAD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormDescription>
                    Auto-filled when a fee template is selected
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Status & Security ──────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Status &amp; Security</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            {/* Priority only shown in create mode — managed via Onboarding tab in edit */}
            {mode === 'create' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MATTER_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Status alone in edit mode */}
            {mode === 'edit' && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MATTER_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visibility</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select visibility" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VISIBILITY_OPTIONS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {VISIBILITY_OPTIONS.find((v) => v.value === field.value)?.description}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Statute of limitations and next deadline — create mode only.
                In edit mode these are managed from the Onboarding tab. */}
            {mode === 'create' && (
              <>
                <FormField
                  control={form.control}
                  name="statute_of_limitations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Statute of Limitations</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        Can be updated later from the matter&apos;s Onboarding tab
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="next_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Deadline</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Matter' : 'Update Matter'}
          </Button>
        </div>
      </form>
    </Form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Additional Contacts Section (create mode only)
// ─────────────────────────────────────────────────────────────────────────────

interface AdditionalContact {
  contact_id: string
  role: string
}

function AdditionalContactsSection({
  contacts,
  onChange,
  tenantId,
}: {
  contacts: AdditionalContact[]
  onChange: (contacts: AdditionalContact[]) => void
  tenantId: string
}) {
  function handleAdd() {
    onChange([...contacts, { contact_id: '', role: 'other' }])
  }

  function handleRemove(index: number) {
    onChange(contacts.filter((_, i) => i !== index))
  }

  function handleContactChange(index: number, contactId: string) {
    const updated = [...contacts]
    updated[index] = { ...updated[index], contact_id: contactId }
    onChange(updated)
  }

  function handleRoleChange(index: number, role: string) {
    const updated = [...contacts]
    updated[index] = { ...updated[index], role }
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <div className="space-y-3">
          {contacts.map((ac, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-lg border bg-slate-50 p-3"
            >
              <div className="flex-1 space-y-2">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    Contact
                  </label>
                  <ContactSearch
                    value={ac.contact_id}
                    onChange={(val) => handleContactChange(index, val)}
                    tenantId={tenantId}
                    placeholder="Search contact..."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    Role
                  </label>
                  <Select value={ac.role} onValueChange={(val) => handleRoleChange(index, val)}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATTER_CONTACT_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="mt-6 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="w-full"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Another Contact
      </Button>
    </div>
  )
}
