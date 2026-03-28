'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Loader2, Plus, X, CheckCircle2, ChevronsUpDown, Check, Pencil, AlertTriangle } from 'lucide-react'

import { matterSchema, type MatterFormValues } from '@/lib/schemas/matter'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useI18n } from '@/lib/i18n/i18n-provider'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn, formatCents } from '@/lib/utils'
import { HelperTip } from '@/components/ui/helper-tip'
import { CANADIAN_TAX_RATES, PROVINCE_OPTIONS } from '@/lib/config/tax-rates'

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

// Compute estimated value from a fee template's items (all values in cents)
function computeTemplateTotal(template: Database['public']['Tables']['retainer_fee_templates']['Row']): number {
  const raw_pf = template.professional_fees as unknown
  const raw_gf = template.government_fees as unknown
  const raw_db = template.disbursements as unknown
  const profFees: ProfessionalFeeItem[] = Array.isArray(raw_pf) ? raw_pf : []
  const govFees: GovernmentFeeItem[] = Array.isArray(raw_gf) ? raw_gf : []
  const disburse: DisbursementItem[] = Array.isArray(raw_db) ? raw_db : []

  // Support both field formats: amount_cents (from seeded migration) and quantity*unitPrice (legacy)
  const profTotal = profFees.reduce((sum, f) => {
    if (f.amount_cents) return sum + f.amount_cents
    return sum + (f.quantity ?? 0) * (f.unitPrice ?? 0)
  }, 0)
  const govTotal = govFees.reduce((sum, f) => sum + (f.amount_cents ?? f.amount ?? 0), 0)
  const disbTotal = disburse.reduce((sum, f) => sum + (f.amount_cents ?? f.amount ?? 0), 0)
  return profTotal + govTotal + disbTotal
}

export function MatterForm({ mode, defaultValues, onSubmit, isLoading }: MatterFormProps) {
  const { tenant } = useTenant()
  const { t } = useI18n()
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
      applicant_location: 'inside_canada',
      client_province: undefined,
      ...defaultValues,
    },
  })

  const watchedPracticeAreaId = form.watch('practice_area_id')
  const watchedMatterTypeId = form.watch('matter_type_id')
  const watchedMatterStagePipelineId = form.watch('matter_stage_pipeline_id')
  const watchedBillingType = form.watch('billing_type')
  const watchedFeeTemplateId = form.watch('fee_template_id')
  const watchedApplicantLocation = form.watch('applicant_location')
  const watchedClientProvince = form.watch('client_province')

  // Track whether a fee template was auto-applied (for the "Template Applied" badge)
  const [templateAppliedName, setTemplateAppliedName] = useState<string | null>(null)
  // Track manual override of template estimated value
  const [isManualOverride, setIsManualOverride] = useState(false)
  const [templateDefaultValue, setTemplateDefaultValue] = useState<number | null>(null)
  // Searchable matter type combobox state
  const [matterTypeOpen, setMatterTypeOpen] = useState(false)
  // Inline editing of fee line items
  const [isEditingLineItems, setIsEditingLineItems] = useState(false)
  const [editedLineItems, setEditedLineItems] = useState<{
    profItems: ProfessionalFeeItem[]
    govItems: GovernmentFeeItem[]
    disbItems: DisbursementItem[]
  } | null>(null)

  // ── Data sources (all from command centre / settings) ──────────────────────
  const { data: practiceAreas, isLoading: practiceAreasLoading } = usePracticeAreas(tenantId)
  const { data: matterTypes, isLoading: matterTypesLoading } = useMatterTypes(tenantId, watchedPracticeAreaId || null)

  // Pipeline and stages: sourced from matter type's configuration
  const { data: matterStagePipelines, isLoading: pipelinesLoading } =
    useMatterStagePipelines(tenantId, watchedMatterTypeId)
  const { data: matterStages, isLoading: stagesLoading } =
    useMatterStages(watchedMatterStagePipelineId)

  // Fee templates: sourced from matter type's command centre settings
  const { data: feeTemplates, isLoading: feeTemplatesLoading, error: feeTemplatesError } = useRetainerFeeTemplates(tenantId, watchedMatterTypeId ?? null)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _feeTemplatesLoading = feeTemplatesLoading

  // Staff: all active users from command centre (never hardcoded)
  const { data: staff, isLoading: staffLoading } = useStaff(tenantId)

  // ── Reset dependent fields when matter type changes ─────────────────────────
  // This ONLY fires on matter type change  -  not on pipeline/template data arrival.
  // Separating this from the pipeline auto-select prevents a race condition where
  // late-arriving matterStagePipelines would re-fire this effect and wipe out a
  // fee_template_id that the auto-select effect had already set.
  useEffect(() => {
    if (mode !== 'create') return
    form.setValue('matter_stage_pipeline_id', undefined)
    form.setValue('initial_matter_stage_id', undefined)
    // Reset fee template so auto-select effect can pick the new type's default
    form.setValue('fee_template_id', undefined)
    form.setValue('estimated_value', undefined)
    setTemplateAppliedName(null)
    setIsManualOverride(false)
    setIsEditingLineItems(false)
    setEditedLineItems(null)
    setTemplateDefaultValue(null)
    setUserPickedTemplate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMatterTypeId])

  // ── Auto-select default pipeline when pipeline data arrives ────────────────
  useEffect(() => {
    if (mode !== 'create') return
    if (!watchedMatterTypeId || !matterStagePipelines?.length) return

    const defaultPipeline =
      matterStagePipelines.find((p) => p.is_default) ?? matterStagePipelines[0]
    if (defaultPipeline) {
      form.setValue('matter_stage_pipeline_id', defaultPipeline.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterStagePipelines])

  // Track whether user manually chose a different template (to avoid overwriting)
  const [userPickedTemplate, setUserPickedTemplate] = useState(false)

  // ── SINGLE EFFECT: Auto-select default fee template AND apply its values ──
  // ONLY depends on feeTemplates  -  when matter type changes, the query key changes,
  // React Query refetches, and feeTemplates updates. That's when this fires.
  // Do NOT add watchedMatterTypeId here  -  it causes premature firing before data arrives.
  useEffect(() => {
    if (mode !== 'create') return

    // If templates are empty/null, clear the applied state
    if (!feeTemplates || feeTemplates.length === 0) {
      setTemplateAppliedName(null)
      return
    }

    // If user manually picked a template that's still in this set, keep it
    if (userPickedTemplate && watchedFeeTemplateId) {
      const userPick = feeTemplates.find((t) => t.id === watchedFeeTemplateId)
      if (userPick) return // user's choice is valid, don't override
    }

    // Auto-select: find is_default or fall back to first
    const templateToApply = feeTemplates.find((t) => t.is_default) ?? feeTemplates[0]
    if (!templateToApply) return

    // Set the template ID in the form
    form.setValue('fee_template_id', templateToApply.id, { shouldDirty: false })

    // Apply billing values from the template
    form.setValue('billing_type', templateToApply.billing_type as MatterFormValues['billing_type'])
    const total = computeTemplateTotal(templateToApply)
    if (total > 0) {
      form.setValue('estimated_value', total)
      setTemplateDefaultValue(total)
    }
    setIsManualOverride(false)
    setIsEditingLineItems(false)
    setEditedLineItems(null)
    setTemplateAppliedName(templateToApply.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeTemplates])

  // ── When user manually changes fee template dropdown, re-apply billing values ──
  useEffect(() => {
    if (!userPickedTemplate || !watchedFeeTemplateId || !feeTemplates) return
    const template = feeTemplates.find((t) => t.id === watchedFeeTemplateId)
    if (!template) {
      setTemplateAppliedName(null)
      return
    }
    form.setValue('billing_type', template.billing_type as MatterFormValues['billing_type'])
    const total = computeTemplateTotal(template)
    if (total > 0) {
      form.setValue('estimated_value', total)
      setTemplateDefaultValue(total)
    }
    setIsManualOverride(false)
    setIsEditingLineItems(false)
    setEditedLineItems(null)
    setTemplateAppliedName(template.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFeeTemplateId])

  // ── Auto-select first stage when pipeline changes ─────────────────────────
  useEffect(() => {
    if (mode !== 'create') return
    form.setValue('initial_matter_stage_id', undefined)

    if (!watchedMatterStagePipelineId || !matterStages?.length) return
    form.setValue('initial_matter_stage_id', matterStages[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMatterStagePipelineId, matterStages])

  // ── Reset dependent fields when practice area changes ─────────────────────
  useEffect(() => {
    if (mode === 'create') {
      form.setValue('matter_type_id', undefined)
      form.setValue('matter_stage_pipeline_id', undefined)
      form.setValue('initial_matter_stage_id', undefined)
      form.setValue('fee_template_id', undefined)
      form.setValue('estimated_value', undefined)
      setTemplateAppliedName(null)
      setIsManualOverride(false)
      setTemplateDefaultValue(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPracticeAreaId])

  // Helper: is the financials section "powered" by a template?
  const hasTemplateApplied = !!templateAppliedName

  // Compute the fee breakdown for the active template (for the summary box)
  // When inline-editing, use editedLineItems so totals recalculate on every keystroke
  const activeTemplate = feeTemplates?.find((t) => t.id === watchedFeeTemplateId)
  const feeBreakdown = activeTemplate ? (() => {
    const raw_pf = activeTemplate.professional_fees as unknown
    const raw_gf = activeTemplate.government_fees as unknown
    const raw_db = activeTemplate.disbursements as unknown
    const baseProfFees: ProfessionalFeeItem[] = Array.isArray(raw_pf) ? raw_pf : []
    const baseGovFees: GovernmentFeeItem[] = Array.isArray(raw_gf) ? raw_gf : []
    const baseDisburse: DisbursementItem[] = Array.isArray(raw_db) ? raw_db : []

    // Use edited items if currently editing, otherwise use template defaults
    const profFees = isEditingLineItems && editedLineItems ? editedLineItems.profItems : baseProfFees
    const govFees = isEditingLineItems && editedLineItems ? editedLineItems.govItems : baseGovFees
    const disburse = isEditingLineItems && editedLineItems ? editedLineItems.disbItems : baseDisburse

    return {
      professional: profFees.reduce((sum, f) => f.amount_cents ? sum + f.amount_cents : sum + (f.quantity ?? 0) * (f.unitPrice ?? 0), 0),
      government: govFees.reduce((sum, f) => sum + (f.amount_cents ?? f.amount ?? 0), 0),
      disbursements: disburse.reduce((sum, f) => sum + (f.amount_cents ?? f.amount ?? 0), 0),
      profItems: profFees,
      govItems: govFees,
      disbItems: disburse,
    }
  })() : null

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Section 1: Client & Matter ──────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('form.section_client_matter' as any)}</h3>
            <p className="text-xs text-muted-foreground">{t('form.section_client_matter_desc' as any)}</p>
          </div>
          <Separator />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.matter_title' as any)} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('form.matter_title_placeholder' as any)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Primary Contact  -  always linked from contacts (command centre) */}
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.matter_primary_contact' as any)}</FormLabel>
                  <FormControl>
                    <ContactSearch
                      value={field.value ?? ''}
                      onChange={(val) => field.onChange(val || null)}
                      tenantId={tenantId}
                      placeholder={t('form.matter_search_contact' as any)}
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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.matter_description' as any)}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('form.matter_description_placeholder' as any)}
                      rows={3}
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

        {/* ── Section 2: Classification ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('form.section_classification' as any)}</h3>
            <p className="text-xs text-muted-foreground">{t('form.section_classification_desc' as any)}</p>
          </div>
          <Separator />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.matter_practice_area' as any)} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={practiceAreasLoading ? t('common.loading') : t('form.select_practice_area' as any)} />
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

            {/* Matter Type  -  searchable combobox, shown after practice area is selected */}
            {watchedPracticeAreaId && (
              <FormField
                control={form.control}
                name="matter_type_id"
                render={({ field }) => {
                  const selectedType = matterTypes?.find((mt) => mt.id === field.value)
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t('form.matter_type' as any)}</FormLabel>
                      <Popover open={matterTypeOpen} onOpenChange={setMatterTypeOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={matterTypeOpen}
                              className={cn(
                                'w-full justify-between font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {selectedType ? (
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: selectedType.color }}
                                  />
                                  {selectedType.name}
                                </span>
                              ) : (
                                matterTypesLoading ? t('common.loading') : t('form.select_matter_type' as any)
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder={t('form.select_matter_type' as any)} />
                            <CommandList>
                              <CommandEmpty>{t('form.no_matter_types' as any)}</CommandEmpty>
                              <CommandGroup>
                                {matterTypes?.map((mt) => (
                                  <CommandItem
                                    key={mt.id}
                                    value={mt.name}
                                    onSelect={() => {
                                      field.onChange(mt.id)
                                      setMatterTypeOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        field.value === mt.id ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <span
                                      className="h-2 w-2 rounded-full shrink-0 mr-2"
                                      style={{ backgroundColor: mt.color }}
                                    />
                                    {mt.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Selecting a matter type loads its pipeline, stages, and fee templates automatically
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />
            )}

          </div>
        </div>

        {/* ── Section 3: Location & Tax ────────────────────────────────────── */}
        {watchedMatterTypeId && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('form.section_location_tax' as any)}</h3>
              <p className="text-xs text-muted-foreground">{t('form.section_location_tax_desc' as any)}</p>
            </div>
            <Separator />
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="applicant_location"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FormLabel>{t('form.matter_applicant_location' as any)}</FormLabel>
                      <HelperTip contentKey="matter.applicant_location" />
                    </div>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(val) => {
                          field.onChange(val)
                          if (val === 'outside_canada') {
                            form.setValue('client_province', null)
                          }
                        }}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="inside_canada" id="loc-inside" />
                          <Label htmlFor="loc-inside" className="font-normal cursor-pointer">
                            Inside Canada
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="outside_canada" id="loc-outside" />
                          <Label htmlFor="loc-outside" className="font-normal cursor-pointer">
                            Outside Canada
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Client Province  -  shown when applicant is inside Canada */}
              {watchedApplicantLocation === 'inside_canada' && (
                <FormField
                  control={form.control}
                  name="client_province"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel>{t('form.matter_client_province' as any)}</FormLabel>
                        <HelperTip contentKey="matter.client_province" />
                      </div>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('form.select_province' as any)} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROVINCE_OPTIONS.map((p) => (
                            <SelectItem key={p.code} value={p.code}>
                              <div className="flex items-center justify-between gap-3">
                                <span>{p.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {(p.rate * 100).toFixed(p.rate === 0.14975 ? 3 : 0)}% {p.label}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Tax rate is determined by the client&apos;s location (CRA place-of-supply rules)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Section 4: Financials & Billing (Grand Finale) ───────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('form.section_financials' as any)}</h3>
              <p className="text-xs text-muted-foreground">
                {watchedMatterTypeId
                  ? 'Fee structure auto-populates from your case type template'
                  : 'Select a Matter Type above to load fee defaults'}
              </p>
            </div>
            {hasTemplateApplied && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                Template Applied
              </span>
            )}
          </div>
          <Separator />
          <div className="space-y-4">

            {/* Fee template picker */}
            {watchedMatterTypeId && feeTemplates && feeTemplates.length > 0 && (
              <FormField
                control={form.control}
                name="fee_template_id"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>{t('form.matter_fee_template' as any)}</FormLabel>
                      <HelperTip contentKey="matter.fee_template" />
                    </div>
                    <Select onValueChange={(val) => { field.onChange(val); setUserPickedTemplate(true) }} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('form.select_fee_template' as any)} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {feeTemplates.map((t) => {
                          const total = computeTemplateTotal(t)
                          return (
                            <SelectItem key={t.id} value={t.id}>
                              <div className="flex items-center gap-2">
                                {t.name}
                                <span className="text-xs text-muted-foreground">
                                  (${(total / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })})
                                </span>
                                {t.is_default && (
                                  <span className="text-xs text-emerald-600 font-medium">Default</span>
                                )}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Auto-selected based on matter type. Change if needed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ── Fee Summary Breakdown  -  only shown when a template is applied ── */}
            {hasTemplateApplied && feeBreakdown && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/30/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                    Fee Breakdown
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-600">{templateAppliedName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingLineItems) {
                          // Save: recalculate totals from edited items
                          if (editedLineItems) {
                            const profTotal = editedLineItems.profItems.reduce((s, f) => s + (f.amount_cents ?? 0), 0)
                            const govTotal = editedLineItems.govItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                            const disbTotal = editedLineItems.disbItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                            form.setValue('estimated_value', profTotal + govTotal + disbTotal)
                            setIsManualOverride(true)
                          }
                          setIsEditingLineItems(false)
                        } else {
                          // Enter edit mode
                          setEditedLineItems({
                            profItems: [...feeBreakdown.profItems],
                            govItems: [...feeBreakdown.govItems],
                            disbItems: [...feeBreakdown.disbItems],
                          })
                          setIsEditingLineItems(true)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                        isEditingLineItems
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-white border border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/40'
                      )}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      {isEditingLineItems ? t('form.save_changes' as any) : t('form.fee_edit_individual' as any)}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md bg-white border border-emerald-100 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{t('form.fee_legal' as any)}</div>
                    <div className="text-[10px] text-muted-foreground">{t('form.fee_legal_desc' as any)}</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5">
                      {formatCents(feeBreakdown.professional)}
                    </div>
                  </div>
                  <div className="rounded-md bg-white border border-emerald-100 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{t('form.fee_govt' as any)}</div>
                    <div className="text-[10px] text-muted-foreground">{t('form.fee_govt_desc' as any)}</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5">
                      {formatCents(feeBreakdown.government)}
                    </div>
                  </div>
                  <div className="rounded-md bg-white border border-emerald-100 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{t('form.fee_admin' as any)}</div>
                    <div className="text-[10px] text-muted-foreground">{t('form.fee_admin_desc' as any)}</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5">
                      {formatCents(feeBreakdown.disbursements)}
                    </div>
                  </div>
                </div>

                {/* Inline editable line items */}
                {isEditingLineItems && editedLineItems && (
                  <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                    <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">{t('form.fee_edit_individual' as any)}</div>
                    {editedLineItems.profItems.map((item, i) => (
                      <div key={`edit-pf-${i}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{item.name || item.description || 'Professional Fee'}</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="w-28 h-7 text-xs text-right"
                          value={`$${((item.amount_cents ?? 0) / 100).toFixed(2)}`}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '')
                            const dollars = parseFloat(raw)
                            if (!isNaN(dollars)) {
                              const updated = [...editedLineItems.profItems]
                              updated[i] = { ...updated[i], amount_cents: Math.round(dollars * 100) }
                              const newItems = { ...editedLineItems, profItems: updated }
                              setEditedLineItems(newItems)
                              // Recalculate estimated_value on every keystroke
                              const profTotal = newItems.profItems.reduce((s, f) => s + (f.amount_cents ?? 0), 0)
                              const govTotal = newItems.govItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              const disbTotal = newItems.disbItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              form.setValue('estimated_value', profTotal + govTotal + disbTotal)
                              setIsManualOverride(true)
                            }
                          }}
                        />
                      </div>
                    ))}
                    {editedLineItems.govItems.map((item, i) => (
                      <div key={`edit-gf-${i}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{item.name || item.description || 'Govt Fee'}</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="w-28 h-7 text-xs text-right"
                          value={`$${((item.amount_cents ?? item.amount ?? 0) / 100).toFixed(2)}`}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '')
                            const dollars = parseFloat(raw)
                            if (!isNaN(dollars)) {
                              const updated = [...editedLineItems.govItems]
                              updated[i] = { ...updated[i], amount_cents: Math.round(dollars * 100), amount: Math.round(dollars * 100) }
                              const newItems = { ...editedLineItems, govItems: updated }
                              setEditedLineItems(newItems)
                              // Recalculate estimated_value on every keystroke
                              const profTotal = newItems.profItems.reduce((s, f) => s + (f.amount_cents ?? 0), 0)
                              const govTotal = newItems.govItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              const disbTotal = newItems.disbItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              form.setValue('estimated_value', profTotal + govTotal + disbTotal)
                              setIsManualOverride(true)
                            }
                          }}
                        />
                      </div>
                    ))}
                    {editedLineItems.disbItems.map((item, i) => (
                      <div key={`edit-db-${i}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{item.name || item.description || 'Disbursement'}</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="w-28 h-7 text-xs text-right"
                          value={`$${((item.amount_cents ?? item.amount ?? 0) / 100).toFixed(2)}`}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '')
                            const dollars = parseFloat(raw)
                            if (!isNaN(dollars)) {
                              const updated = [...editedLineItems.disbItems]
                              updated[i] = { ...updated[i], amount_cents: Math.round(dollars * 100), amount: Math.round(dollars * 100) }
                              const newItems = { ...editedLineItems, disbItems: updated }
                              setEditedLineItems(newItems)
                              // Recalculate estimated_value on every keystroke
                              const profTotal = newItems.profItems.reduce((s, f) => s + (f.amount_cents ?? 0), 0)
                              const govTotal = newItems.govItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              const disbTotal = newItems.disbItems.reduce((s, f) => s + (f.amount_cents ?? f.amount ?? 0), 0)
                              form.setValue('estimated_value', profTotal + govTotal + disbTotal)
                              setIsManualOverride(true)
                            }
                          }}
                        />
                      </div>
                    ))}
                    <p className="text-[10px] text-amber-600 mt-1">
                      Changes here only apply to this matter. The fee template will not be modified.
                    </p>
                  </div>
                )}
                {/* ── Tax line  -  calculated from applicant location + province ── */}
                {(() => {
                  const taxableAmountCents = feeBreakdown.professional + feeBreakdown.disbursements
                  const isOutsideCanada = watchedApplicantLocation === 'outside_canada'
                  const provinceConfig = watchedClientProvince ? CANADIAN_TAX_RATES[watchedClientProvince] : null

                  let taxAmountCents = 0
                  let taxLabel = ''

                  if (isOutsideCanada) {
                    taxAmountCents = 0
                    taxLabel = 'Zero-rated: non-resident'
                  } else if (provinceConfig) {
                    taxAmountCents = Math.round(taxableAmountCents * provinceConfig.rate)
                    taxLabel = `${(provinceConfig.rate * 100).toFixed(provinceConfig.rate === 0.14975 ? 3 : 0)}% ${provinceConfig.label} (${provinceConfig.name})`
                  } else {
                    taxLabel = 'Select a province above'
                  }

                  const totalWithTax = feeBreakdown.professional + feeBreakdown.government + feeBreakdown.disbursements + taxAmountCents

                  return (
                    <div className="space-y-2 pt-1 border-t border-emerald-500/20">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Tax {provinceConfig || isOutsideCanada ? '' : ''}
                          <span className="text-[10px] ml-1 text-muted-foreground/70">
                            (on legal + admin fees only)
                          </span>
                        </span>
                        <span className={cn(
                          'font-medium',
                          isOutsideCanada ? 'text-amber-600' : 'text-foreground'
                        )}>
                          {isOutsideCanada
                            ? `$0.00`
                            : provinceConfig
                              ? formatCents(taxAmountCents)
                              : ' - '}
                          {' '}
                          <span className="font-normal text-muted-foreground text-[10px]">
                            {taxLabel}
                          </span>
                        </span>
                      </div>
                      {(provinceConfig || isOutsideCanada) && (
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-emerald-400">{t('form.fee_total_incl_tax' as any)}</span>
                          <span className="text-emerald-400">{formatCents(totalWithTax)}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Itemised detail (collapsed by default for clean UI) */}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">
                    View itemised breakdown
                  </summary>
                  <div className="mt-2 space-y-1 pl-2 border-l-2 border-emerald-500/20">
                    {feeBreakdown.profItems.length > 0 && (
                      <div className="pt-1 pb-0.5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('form.fee_professional_services' as any)}</div>
                        <div className="text-[11px] text-muted-foreground">{t('form.fee_professional_desc' as any)}</div>
                      </div>
                    )}
                    {feeBreakdown.profItems.map((f, i) => (
                      <div key={`pf-${i}`} className="flex justify-between">
                        <div className="min-w-0">
                          <span>{f.name || f.description || 'Professional Fee'}</span>
                          {f.name && f.description && f.description !== f.name && (
                            <div className="text-[10px] text-muted-foreground/70 truncate">{f.description}</div>
                          )}
                        </div>
                        <span className="font-medium shrink-0">{formatCents(f.amount_cents ?? (f.quantity ?? 0) * (f.unitPrice ?? 0))}</span>
                      </div>
                    ))}
                    {feeBreakdown.govItems.length > 0 && (
                      <div className="pt-2 pb-0.5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('form.fee_government' as any)}</div>
                        <div className="text-[11px] text-muted-foreground">{t('form.fee_government_desc' as any)}</div>
                      </div>
                    )}
                    {feeBreakdown.govItems.map((f, i) => (
                      <div key={`gf-${i}`} className="flex justify-between">
                        <div className="min-w-0">
                          <span>{f.name || f.description || 'Government Fee'}</span>
                          {f.name && f.description && f.description !== f.name && (
                            <div className="text-[10px] text-muted-foreground/70 truncate">{f.description}</div>
                          )}
                        </div>
                        <span className="font-medium shrink-0">{formatCents(f.amount_cents ?? f.amount ?? 0)}</span>
                      </div>
                    ))}
                    {feeBreakdown.disbItems.length > 0 && (
                      <div className="pt-2 pb-0.5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('form.fee_disbursements' as any)}</div>
                        <div className="text-[11px] text-muted-foreground">{t('form.fee_disbursements_desc' as any)}</div>
                      </div>
                    )}
                    {feeBreakdown.disbItems.map((f, i) => (
                      <div key={`db-${i}`} className="flex justify-between">
                        <div className="min-w-0">
                          <span>{f.name || f.description || 'Disbursement'}</span>
                          {f.name && f.description && f.description !== f.name && (
                            <div className="text-[10px] text-muted-foreground/70 truncate">{f.description}</div>
                          )}
                        </div>
                        <span className="font-medium shrink-0">{formatCents(f.amount_cents ?? f.amount ?? 0)}</span>
                      </div>
                    ))}

                    {/* ── Tax Summary ─────────────────────────────── */}
                    {(() => {
                      const taxableAmountCents = feeBreakdown.professional + feeBreakdown.disbursements
                      const isOutsideCanada = watchedApplicantLocation === 'outside_canada'
                      const provinceConfig = watchedClientProvince ? CANADIAN_TAX_RATES[watchedClientProvince] : null

                      let taxAmountCents = 0
                      let taxLabel = ''

                      if (isOutsideCanada) {
                        taxAmountCents = 0
                        taxLabel = 'Zero-rated (non-resident)'
                      } else if (provinceConfig) {
                        taxAmountCents = Math.round(taxableAmountCents * provinceConfig.rate)
                        taxLabel = `${provinceConfig.label} (${(provinceConfig.rate * 100).toFixed(provinceConfig.rate === 0.14975 ? 3 : 0)}%)`
                      }

                      const totalCents = feeBreakdown.professional + feeBreakdown.government + feeBreakdown.disbursements + taxAmountCents
                      const showTax = taxAmountCents > 0 || (watchedApplicantLocation === 'inside_canada' && !!watchedClientProvince)

                      return (
                        <div className="mt-3 border-t border-emerald-500/30 pt-3 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span>
                              Subtotal (Taxable)
                              <span className="ml-1 text-[10px] text-muted-foreground/70">(legal fees + disbursements)</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCents(taxableAmountCents)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>
                              {t('form.fee_government' as any)} (Exempt)
                              <span className="ml-1 text-[10px] text-muted-foreground/70">{t('form.fee_gst_exempt' as any)}</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCents(feeBreakdown.government)}</span>
                          </div>
                          {showTax && (
                            <>
                              <div className="border-t border-emerald-500/20 my-1" />
                              <div className="flex justify-between text-xs">
                                <span>
                                  {taxLabel || 'Tax'}
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">
                                    (on taxable amount only)
                                  </span>
                                </span>
                                <span className={cn(
                                  'font-medium tabular-nums',
                                  isOutsideCanada ? 'text-amber-600' : ''
                                )}>
                                  {formatCents(taxAmountCents)}
                                </span>
                              </div>
                            </>
                          )}
                          <div className="border-t border-emerald-500/30 my-1" />
                          <div className="flex justify-between text-sm font-bold">
                            <span>{t('form.fee_total' as any)}</span>
                            <span className="tabular-nums">{formatCents(totalCents)}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </details>
              </div>
            )}

            {/* Estimated Value  -  hidden until a matter type is selected */}
            {(watchedMatterTypeId || form.getValues('estimated_value')) && (
              <FormField
                control={form.control}
                name="estimated_value"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>{t('form.matter_estimated_value' as any)}</FormLabel>
                      <HelperTip contentKey="matter.estimated_value" />
                    </div>
                    {hasTemplateApplied && field.value && !isManualOverride ? (
                      <>
                        <div className="flex h-9 items-center rounded-md border bg-slate-50 px-3 text-sm font-semibold text-foreground">
                          {formatCents(field.value as number)}
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs font-normal text-muted-foreground">{t('form.fee_set_by_template' as any)}</span>
                            <button
                              type="button"
                              onClick={() => setIsManualOverride(true)}
                              className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-slate-200 hover:text-foreground transition-colors"
                              title={t('form.fee_edit_tooltip' as any)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <FormDescription>
                          {t('form.fee_customise_help' as any)}
                        </FormDescription>
                      </>
                    ) : hasTemplateApplied && isManualOverride ? (
                      <>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={field.value ? `$${(Number(field.value) / 100).toFixed(2)}` : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9.]/g, '')
                              const dollars = parseFloat(raw)
                              if (!isNaN(dollars)) {
                                field.onChange(Math.round(dollars * 100))
                              } else if (raw === '' || raw === '.') {
                                field.onChange(undefined)
                              }
                            }}
                          />
                        </FormControl>
                        <div className="flex items-start gap-1.5 mt-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-amber-600">
                            Manual price entered  -  template defaults will be ignored for this matter.
                          </span>
                        </div>
                        {templateDefaultValue && (
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('estimated_value', templateDefaultValue)
                              setIsManualOverride(false)
                            }}
                            className="text-xs text-blue-600 hover:text-blue-400 hover:underline mt-0.5"
                          >
                            Reset to template ({formatCents(templateDefaultValue)})
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={field.value ? `$${(Number(field.value) / 100).toFixed(2)}` : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9.]/g, '')
                              const dollars = parseFloat(raw)
                              if (!isNaN(dollars)) {
                                field.onChange(Math.round(dollars * 100))
                              } else if (raw === '' || raw === '.') {
                                field.onChange(undefined)
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Enter the total estimated value for this matter
                        </FormDescription>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Billing Type  -  read-only when controlled by a template, editable otherwise */}
            <FormField
              control={form.control}
              name="billing_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.matter_billing_type' as any)}</FormLabel>
                  {hasTemplateApplied ? (
                    <div className="flex h-9 items-center rounded-md border bg-slate-50 px-3 text-sm text-slate-700">
                      {BILLING_TYPES.find((bt) => bt.value === field.value)?.label ?? field.value}
                      <span className="ml-auto text-xs text-muted-foreground">{t('form.fee_set_by_template' as any)}</span>
                    </div>
                  ) : (
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
                  )}
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
          </div>
        </div>

        {/* ── Section 5: Assignment ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Assignment</h3>
            <p className="text-xs text-muted-foreground">Lawyers and staff responsible for this matter</p>
          </div>
          <Separator />
          <div className="space-y-4">
            {/* Responsible + follow-up: create mode only.
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

            {mode === 'create' && (
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
            )}
          </div>
        </div>

        {/* ── Section 6: Status & Security ──────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Status &amp; Security</h3>
            <p className="text-xs text-muted-foreground">Priority, visibility, and access controls</p>
          </div>
          <Separator />
          <div className="space-y-4">
            {/* Priority + Status shown in create mode */}
            {mode === 'create' && (
              <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? t('form.create_contact' as any) : t('form.save_changes' as any)}
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
