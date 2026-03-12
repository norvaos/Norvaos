import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { intakeKeys } from '@/lib/queries/matter-intake'
import { gatingKeys } from '@/lib/queries/matter-types'
import { toast } from 'sonner'

type MatterPerson = Database['public']['Tables']['matter_people']['Row']
type MatterPersonInsert = Database['public']['Tables']['matter_people']['Insert']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const peopleKeys = {
  all: ['matter_people'] as const,
  list: (matterId: string) => [...peopleKeys.all, matterId] as const,
}

// ─── Fetch People ───────────────────────────────────────────────────────────

/**
 * Fetch all active people for a matter, ordered by sort_order.
 */
export function useMatterPeople(matterId: string) {
  return useQuery({
    queryKey: peopleKeys.list(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_people')
        .select('*')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')

      if (error) throw error
      return data as MatterPerson[]
    },
    enabled: !!matterId,
  })
}

// ─── Create Person (via server-side API) ─────────────────────────────────────

/**
 * Add a new person to a matter. Routes through /api/matters/[id]/people
 * for server-side enforcement with auto-validation.
 */
export function useCreateMatterPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: MatterPersonInsert) => {
      const response = await fetch(`/api/matters/${input.matter_id}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add person')
      }
      return result
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.list(vars.matter_id) })
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matter_id) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matter_id) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success(`${result.person.first_name} ${result.person.last_name} added`)
    },
    onError: () => {
      toast.error('Failed to add person')
    },
  })
}

// ─── Update Person (via server-side API) ─────────────────────────────────────

/**
 * Update an existing person's data. Routes through /api/matters/[id]/people/[personId]
 * for server-side enforcement with before/after audit and auto-validation.
 */
export function useUpdateMatterPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterId,
      tenantId,
      updates,
    }: {
      id: string
      matterId: string
      tenantId: string
      updates: Partial<MatterPerson>
    }) => {
      const response = await fetch(`/api/matters/${matterId}/people/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update person')
      }
      return result
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.list(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success(`${result.person.first_name} ${result.person.last_name} updated`)
    },
    onError: () => {
      toast.error('Failed to update person')
    },
  })
}

// ─── Delete (Soft) Person (via server-side API) ──────────────────────────────

/**
 * Soft-delete a person (set is_active = false). Routes through
 * /api/matters/[id]/people/[personId] for server-side enforcement with auto-validation.
 */
export function useDeleteMatterPerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterId,
      tenantId,
      personName,
    }: {
      id: string
      matterId: string
      tenantId: string
      personName: string
    }) => {
      const response = await fetch(`/api/matters/${matterId}/people/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to remove person')
      }
      return result
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.list(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success(`${vars.personName} removed`)
    },
    onError: () => {
      toast.error('Failed to remove person')
    },
  })
}
