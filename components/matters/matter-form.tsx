'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, X } from 'lucide-react'

import { matterSchema, type MatterFormValues } from '@/lib/schemas/matter'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { BILLING_TYPES, PRIORITIES, MATTER_STATUSES, MATTER_CONTACT_ROLES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'
import { ContactSearch } from '@/components/shared/contact-search'
import { useMatterTypes } from '@/lib/queries/matter-types'

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
type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
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

function usePipelinesForPracticeArea(tenantId: string, practiceAreaName?: string) {
  return useQuery({
    queryKey: ['pipelines', tenantId, 'matter', practiceAreaName],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('pipeline_type', 'matter')
        .order('name')

      if (practiceAreaName) {
        query = query.or(`practice_area.eq.${practiceAreaName},practice_area.is.null`)
      }

      const { data, error } = await query
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
      responsible_lawyer_id: '',
      originating_lawyer_id: undefined,
      billing_type: 'flat_fee',
      hourly_rate: undefined,
      estimated_value: undefined,
      priority: 'medium',
      status: 'active',
      visibility: 'all',
      statute_of_limitations: undefined,
      next_deadline: undefined,
      ...defaultValues,
    },
  })

  const watchedPracticeAreaId = form.watch('practice_area_id')
  const watchedPipelineId = form.watch('pipeline_id')
  const watchedBillingType = form.watch('billing_type')

  const { data: practiceAreas, isLoading: practiceAreasLoading } = usePracticeAreas(tenantId)
  const { data: matterTypes, isLoading: matterTypesLoading } = useMatterTypes(tenantId, watchedPracticeAreaId || null)
  // Pipeline filter uses the practice area NAME (not ID) because the
  // pipelines.practice_area column stores names like "Immigration".
  const watchedPracticeAreaName = practiceAreas?.find((pa) => pa.id === watchedPracticeAreaId)?.name
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelinesForPracticeArea(tenantId, watchedPracticeAreaName)
  const { data: stages, isLoading: stagesLoading } = useStagesForPipeline(watchedPipelineId)
  const { data: lawyers, isLoading: lawyersLoading } = useLawyers(tenantId)

  // Reset matter type, pipeline, and stage when practice area changes
  useEffect(() => {
    if (mode === 'create') {
      form.setValue('matter_type_id', undefined)
      form.setValue('pipeline_id', undefined)
      form.setValue('stage_id', undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPracticeAreaId])

  // Reset stage when pipeline changes
  useEffect(() => {
    if (mode === 'create') {
      form.setValue('stage_id', undefined)
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
        {/* Basic Information */}
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

            {/* Contact Search with inline creation */}
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
                    Search for an existing contact or create a new one
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

        {/* Classification */}
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
                      disabled={!watchedPracticeAreaId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              matterTypesLoading ? 'Loading...' : 'Select a matter type (optional)'
                            }
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="pipeline_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                    disabled={!watchedPracticeAreaId}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            !watchedPracticeAreaId
                              ? 'Select a practice area first'
                              : pipelinesLoading
                                ? 'Loading...'
                                : 'Select a pipeline'
                          }
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
                  <FormLabel>Stage</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
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

        {/* Assignment */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Assignment</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="responsible_lawyer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsible Lawyer *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={lawyersLoading ? 'Loading...' : 'Select a lawyer'} />
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

            <FormField
              control={form.control}
              name="originating_lawyer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Originating Lawyer</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a lawyer (optional)" />
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

        {/* Billing */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Billing</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
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
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Status, Security & Dates */}
        <div>
          <h3 className="text-sm font-medium text-slate-900">Status, Security & Dates</h3>
          <Separator className="my-3" />
          <div className="space-y-4">
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

            {/* Visibility / Security */}
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
                    {VISIBILITY_OPTIONS.find(v => v.value === field.value)?.description}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="statute_of_limitations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statute of Limitations</FormLabel>
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
              name="next_deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Deadline</FormLabel>
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

// -------------------------------------------------------------------
// Additional Contacts Section (used in create mode)
// -------------------------------------------------------------------

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
