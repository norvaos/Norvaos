'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { leadSchema, type LeadFormValues } from '@/lib/schemas/lead'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { LEAD_TEMPERATURES, CONTACT_SOURCES } from '@/lib/utils/constants'
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
// Inline data-fetching hooks (same pattern as MatterForm)
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
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const form = useForm<LeadFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(leadSchema) as any,
    defaultValues: {
      contact_id: '',
      pipeline_id: fixedPipelineId ?? '',
      stage_id: fixedStageId ?? '',
      source: undefined,
      source_detail: undefined,
      practice_area_id: undefined,
      estimated_value: undefined,
      assigned_to: undefined,
      temperature: 'warm',
      notes: undefined,
      next_follow_up: undefined,
      ...defaultValues,
    },
  })

  const watchedPipelineId = form.watch('pipeline_id')

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

  function formatUserName(user: User): string {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return name || user.email
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Contact Selection */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Contact</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact *</FormLabel>
                  <FormControl>
                    <ContactSearch
                      value={field.value}
                      onChange={field.onChange}
                      tenantId={tenantId}
                      placeholder="Search contacts by name or email..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Pipeline & Stage */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Pipeline & Stage</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="pipeline_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={pipelinesLoading ? 'Loading...' : 'Select a pipeline'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pipelines?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
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
              name="stage_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!watchedPipelineId}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            !watchedPipelineId
                              ? 'Select a pipeline first'
                              : stagesLoading
                                ? 'Loading...'
                                : 'Select a stage'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Lead Details */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Lead Details</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperature</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select temperature" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEAD_TEMPERATURES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.label}
                          </div>
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
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONTACT_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
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
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Area</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={practiceAreasLoading ? 'Loading...' : 'Select a practice area (optional)'}
                        />
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

            <FormField
              control={form.control}
              name="estimated_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Value ($)</FormLabel>
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
          </div>
        </div>

        {/* Assignment */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Assignment</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={lawyersLoading ? 'Loading...' : 'Select a lawyer (optional)'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {lawyers?.map((u) => (
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
          </div>
        </div>

        {/* Follow-up & Notes */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Follow-up & Notes</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="next_follow_up"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Follow-up</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any relevant notes about this lead..."
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

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Lead' : 'Update Lead'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
