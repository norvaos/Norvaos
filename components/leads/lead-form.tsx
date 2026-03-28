'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { leadSchema, type LeadFormValues } from '@/lib/schemas/lead'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useLeadSources } from '@/lib/queries/leads'
import { LEAD_TEMPERATURES } from '@/lib/utils/constants'
import { CLIENT_LOCALES } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/i18n-provider'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContactSearch } from '@/components/shared/contact-search'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type LeadSource = Database['public']['Tables']['lead_sources']['Row']
type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type User = Database['public']['Tables']['users']['Row']

interface LeadFormProps {
  mode: 'create' | 'edit'
  defaultValues?: Partial<LeadFormValues>
  onSubmit: (values: LeadFormValues) => void
  isLoading?: boolean
  fixedPipelineId?: string
  fixedStageId?: string
}

// ---------------------------------------------------------------------------
// Sovereign Error Handler — parses PostgreSQL error codes
// ---------------------------------------------------------------------------

function parseSovereignError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const err = error as { code?: string; message?: string; details?: string }

  switch (err.code) {
    case '23505': {
      // Unique constraint violation
      const detail = err.details ?? err.message ?? ''
      const emailMatch = detail.match(/\(([^)]*email[^)]*)\)/i)
      if (emailMatch) {
        return `IDENTITY_EXISTS — This email is already locked in the system.`
      }
      return `DUPLICATE_RECORD — A record with this data already exists.`
    }
    case '23503':
      return `LINK_BROKEN — Referenced record does not exist. Check your selections.`
    case '23502':
      return `FIELD_REQUIRED — A mandatory field is missing.`
    case '42501':
      return `ACCESS_DENIED — You do not have permission for this operation.`
    default:
      if (err.message) {
        return `SYSTEM_FAULT — ${err.message}`
      }
      return null
  }
}

// ---------------------------------------------------------------------------
// Data-fetching hooks
// ---------------------------------------------------------------------------

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

function useLeadPipelines(tenantId: string) {
  return useQuery({
    queryKey: ['pipelines', tenantId, 'lead'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('pipeline_type', 'lead')
        .order('name')

      if (error) throw error
      return data as Pipeline[]
    },
    enabled: !!tenantId,
  })
}

function useStagesForPipeline(pipelineId?: string) {
  return useQuery({
    queryKey: ['pipeline_stages', pipelineId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId!)
        .order('sort_order')

      if (error) throw error
      return data as PipelineStage[]
    },
    enabled: !!pipelineId,
  })
}

function useLawyers(tenantId: string) {
  return useQuery({
    queryKey: ['users', tenantId, 'lawyers'],
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeadForm({
  mode,
  defaultValues,
  onSubmit,
  isLoading,
  fixedPipelineId,
  fixedStageId,
}: LeadFormProps) {
  const { t } = useI18n()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const [sovereignError, setSovereignError] = useState<string | null>(null)

  const form = useForm<LeadFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(leadSchema) as any,
    defaultValues: {
      contact_id: '',
      email: '',
      pipeline_id: fixedPipelineId ?? '',
      stage_id: fixedStageId ?? '',
      source: '',
      source_detail: undefined,
      practice_area_id: '',
      estimated_value: undefined,
      assigned_to: undefined,
      temperature: 'warm',
      preferred_language: undefined,
      notes: undefined,
      next_follow_up: undefined,
      ...defaultValues,
    },
    mode: 'onChange',
  })

  const watchedPipelineId = form.watch('pipeline_id')

  // Watch mandatory fields for validation lock
  const watchedEmail = form.watch('email')
  const watchedSource = form.watch('source')
  const watchedPracticeArea = form.watch('practice_area_id')
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmail ?? '')
  const isSourceSelected = !!watchedSource && watchedSource.length > 0
  const isCaseTypeSelected = !!watchedPracticeArea && watchedPracticeArea.length > 0
  const canIgnite = isEmailValid && isSourceSelected && isCaseTypeSelected

  const { data: leadSources, isLoading: sourcesLoading } = useLeadSources(tenantId)
  const { data: practiceAreas, isLoading: practiceAreasLoading } = usePracticeAreas(tenantId)
  const { data: pipelines, isLoading: pipelinesLoading } = useLeadPipelines(tenantId)
  const { data: stages, isLoading: stagesLoading } = useStagesForPipeline(watchedPipelineId)
  const { data: lawyers, isLoading: lawyersLoading } = useLawyers(tenantId)

  // Reset stage when pipeline changes (only in create mode)
  useEffect(() => {
    if (mode === 'create') {
      form.setValue('stage_id', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPipelineId])

  // Clear sovereign error when form changes
  useEffect(() => {
    setSovereignError(null)
  }, [watchedEmail, watchedSource, watchedPracticeArea])

  function formatUserName(user: User): string {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return name || user.email
  }

  function handleFormSubmit(values: LeadFormValues) {
    setSovereignError(null)
    try {
      onSubmit(values)
    } catch (err) {
      const parsed = parseSovereignError(err)
      if (parsed) setSovereignError(parsed)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className={`space-y-6 relative ${sovereignError ? 'ring-1 ring-amber-500/40 rounded-lg' : ''}`}
      >
        {/* Contact Selection */}
        <div>
          <h3 className="text-sm font-semibold text-foreground/80 font-sans uppercase tracking-tight">{t('form.section_contact' as any)}</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/70 font-mono text-xs uppercase tracking-wider">{t('form.lead_contact' as any)} *</FormLabel>
                  <FormControl>
                    <ContactSearch
                      value={field.value}
                      onChange={field.onChange}
                      tenantId={tenantId}
                      placeholder={t('form.search_contacts' as any)}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/70 font-mono text-xs uppercase tracking-wider">Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      className="font-mono text-foreground placeholder:text-muted-foreground"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Pipeline & Stage */}
        <div>
          <h3 className="text-sm font-semibold text-foreground/80 font-sans uppercase tracking-tight">{t('form.section_pipeline_stage' as any)}</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="pipeline_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_pipeline' as any)} *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue
                          placeholder={pipelinesLoading ? t('common.loading') : t('form.select_pipeline' as any)}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pipelines?.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="font-mono">
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stage_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_stage' as any)} *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!watchedPipelineId}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue
                          placeholder={
                            !watchedPipelineId
                              ? t('form.select_pipeline_first' as any)
                              : stagesLoading
                                ? t('common.loading')
                                : t('form.select_stage' as any)
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages?.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="font-mono">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Lead Details */}
        <div>
          <h3 className="text-sm font-semibold text-foreground/80 font-sans uppercase tracking-tight">{t('form.section_lead_details' as any)}</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_temperature' as any)}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue placeholder={t('form.select_temperature' as any)} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEAD_TEMPERATURES.map((temp) => (
                        <SelectItem key={temp.value} value={temp.value} className="font-mono">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: temp.color }}
                            />
                            {temp.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/70 font-mono text-xs uppercase tracking-wider">{t('form.lead_source' as any)} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue placeholder={sourcesLoading ? t('common.loading') : t('form.select_source' as any)} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leadSources?.map((s) => (
                        <SelectItem key={s.id} value={s.name} className="font-mono">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferred_language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.preferred_language' as any)}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue placeholder={t('form.select_preferred_language' as any)} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CLIENT_LOCALES.map((locale) => (
                        <SelectItem key={locale.code} value={locale.code} className="font-mono">
                          {locale.nativeLabel} ({locale.label})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/70 font-mono text-xs uppercase tracking-wider">{t('form.lead_practice_area' as any)} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue
                          placeholder={practiceAreasLoading ? t('common.loading') : t('form.select_practice_area' as any)}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {practiceAreas?.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id} className="font-mono">
                          {pa.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimated_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_estimated_value' as any)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className="font-mono"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Assignment */}
        <div>
          <h3 className="text-sm font-semibold text-foreground/80 font-sans uppercase tracking-tight">{t('form.section_assignment' as any)}</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_assigned_to' as any)}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full font-mono">
                        <SelectValue
                          placeholder={lawyersLoading ? t('common.loading') : t('form.select_lawyer' as any)}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {lawyers?.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="font-mono">
                          {formatUserName(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Follow-up & Notes */}
        <div>
          <h3 className="text-sm font-semibold text-foreground/80 font-sans uppercase tracking-tight">{t('form.section_followup_notes' as any)}</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="next_follow_up"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_follow_up' as any)}</FormLabel>
                  <FormControl>
                    <TenantDateInput
                      value={field.value ?? ''}
                      onChange={(iso) => field.onChange(iso)}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t('form.lead_notes' as any)}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('form.lead_notes_placeholder' as any)}
                      rows={3}
                      className="font-mono"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-[10px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Sovereign Error Alert — slim amber HUD bar */}
        {sovereignError && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
              [SATELLITE_ALERT]: {sovereignError}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="submit"
            disabled={isLoading || !canIgnite}
            className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 shadow-lg disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed font-mono uppercase tracking-wider text-xs"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Ignite Mission' : 'Update Lead'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
