'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Json } from '@/lib/types/database'

// ── Types ────────────────────────────────────────────────────────────────────────

export interface RetainerPreset {
  id: string
  tenant_id: string
  category: string
  description: string
  amount: number // cents
  currency: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RetainerPresetCategory = 'professional_services' | 'government_fees' | 'disbursements'

// ── Query Keys ──────────────────────────────────────────────────────────────────

export const retainerPresetKeys = {
  all: ['retainer-presets'] as const,
  list: (tid: string) => [...retainerPresetKeys.all, 'list', tid] as const,
  byCategory: (tid: string, cat: string) => [...retainerPresetKeys.all, tid, cat] as const,
}

// ── Audit Helper ────────────────────────────────────────────────────────────────

async function logPresetAudit(
  tenantId: string,
  userId: string,
  activityType: string,
  title: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      activity_type: activityType,
      title,
      description,
      entity_type: 'retainer_preset',
      entity_id: tenantId,
      user_id: userId,
      metadata: (metadata ?? {}) as Json,
    })
  } catch {
    // Audit logging should never break the mutation
    console.error('Failed to log retainer preset audit event')
  }
}

// ── useRetainerPresets ──────────────────────────────────────────────────────────

export function useRetainerPresets(tenantId: string, category?: string) {
  return useQuery({
    queryKey: category
      ? retainerPresetKeys.byCategory(tenantId, category)
      : retainerPresetKeys.list(tenantId),
    queryFn: async (): Promise<RetainerPreset[]> => {
      const supabase = createClient()
      let query = supabase
        .from('retainer_presets')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')
        .order('description')

      if (category) {
        query = query.eq('category', category)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as RetainerPreset[]
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── useCreateRetainerPreset ─────────────────────────────────────────────────────

export function useCreateRetainerPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenant_id: string
      user_id: string
      category: string
      description: string
      amount: number // cents
      currency?: string
      sort_order?: number
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_presets')
        .insert({
          tenant_id: input.tenant_id,
          category: input.category,
          description: input.description,
          amount: input.amount,
          currency: input.currency ?? 'CAD',
          sort_order: input.sort_order ?? 0,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('A preset with this description already exists in this category')
        }
        throw error
      }

      // Audit log
      await logPresetAudit(
        input.tenant_id,
        input.user_id,
        'retainer_preset_created',
        `Retainer preset created: ${input.description}`,
        `Added "${input.description}" to ${input.category} ($${(input.amount / 100).toFixed(2)} ${input.currency ?? 'CAD'})`,
        { preset_id: data.id, category: input.category, description: input.description, amount: input.amount, currency: input.currency ?? 'CAD' }
      )

      return data as RetainerPreset
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: retainerPresetKeys.all })
      toast.success(`Preset "${data.description}" created`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create preset')
    },
  })
}

// ── useUpdateRetainerPreset ─────────────────────────────────────────────────────

export function useUpdateRetainerPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      tenant_id: string
      user_id: string
      description?: string
      amount?: number
      currency?: string
      sort_order?: number
    }) => {
      const supabase = createClient()
      const updates: Record<string, unknown> = {}
      if (input.description !== undefined) updates.description = input.description
      if (input.amount !== undefined) updates.amount = input.amount
      if (input.currency !== undefined) updates.currency = input.currency
      if (input.sort_order !== undefined) updates.sort_order = input.sort_order

      const { data, error } = await supabase
        .from('retainer_presets')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('A preset with this description already exists in this category')
        }
        throw error
      }

      await logPresetAudit(
        input.tenant_id,
        input.user_id,
        'retainer_preset_updated',
        `Retainer preset updated: ${data.description}`,
        `Updated preset in ${data.category}`,
        { preset_id: data.id, changes: updates }
      )

      return data as RetainerPreset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retainerPresetKeys.all })
      toast.success('Preset updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update preset')
    },
  })
}

// ── useDeleteRetainerPreset ─────────────────────────────────────────────────────

export function useDeleteRetainerPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      tenant_id: string
      user_id: string
      description: string
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('retainer_presets')
        .update({ is_active: false })
        .eq('id', input.id)

      if (error) throw error

      await logPresetAudit(
        input.tenant_id,
        input.user_id,
        'retainer_preset_deleted',
        `Retainer preset removed: ${input.description}`,
        `Deactivated preset "${input.description}"`,
        { preset_id: input.id, description: input.description }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retainerPresetKeys.all })
      toast.success('Preset removed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove preset')
    },
  })
}
