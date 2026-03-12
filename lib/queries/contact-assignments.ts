import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type ContactAssignment = Database['public']['Tables']['contact_assignments']['Row']

// ─── Enriched type with user details ────────────────────────────────────────

export interface ContactAssignmentWithUser extends ContactAssignment {
  user_first_name: string | null
  user_last_name: string | null
  user_email: string
  user_avatar_url: string | null
}

// ─── Assignment roles ───────────────────────────────────────────────────────

export const ASSIGNMENT_ROLES = [
  { value: 'responsible', label: 'Responsible Lawyer' },
  { value: 'supporting', label: 'Supporting Lawyer' },
  { value: 'paralegal', label: 'Paralegal' },
  { value: 'clerk', label: 'Clerk' },
  { value: 'supervisor', label: 'Supervisor' },
] as const

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number]['value']

export function getAssignmentRoleLabel(role: string): string {
  return ASSIGNMENT_ROLES.find((r) => r.value === role)?.label ?? role
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const assignmentKeys = {
  all: ['contact-assignments'] as const,
  byContact: (contactId: string) => [...assignmentKeys.all, 'contact', contactId] as const,
  byUser: (userId: string) => [...assignmentKeys.all, 'user', userId] as const,
}

// ─── Fetch assignments for a contact ────────────────────────────────────────

export function useContactAssignments(contactId: string) {
  return useQuery({
    queryKey: assignmentKeys.byContact(contactId),
    queryFn: async (): Promise<ContactAssignmentWithUser[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contact_assignments')
        .select('*, users!contact_assignments_user_id_fkey(first_name, last_name, email, avatar_url)')
        .eq('contact_id', contactId)
        .order('is_primary', { ascending: false })
        .order('assigned_at', { ascending: true })

      if (error) {
        // Fallback: if the join fails (FK name issue), try without join
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('contact_assignments')
          .select('*')
          .eq('contact_id', contactId)
          .order('is_primary', { ascending: false })
          .order('assigned_at', { ascending: true })

        if (fallbackError) throw fallbackError

        // Manually enrich with user data
        if (!fallbackData || fallbackData.length === 0) return []

        const userIds = [...new Set(fallbackData.map((a) => a.user_id))]
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, avatar_url')
          .in('id', userIds)

        const userMap = new Map((users ?? []).map((u) => [u.id, u]))

        return fallbackData.map((a) => {
          const user = userMap.get(a.user_id)
          return {
            ...a,
            user_first_name: user?.first_name ?? null,
            user_last_name: user?.last_name ?? null,
            user_email: user?.email ?? '',
            user_avatar_url: user?.avatar_url ?? null,
          }
        })
      }

      // Map joined data
      return (data ?? []).map((row: any) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        contact_id: row.contact_id,
        user_id: row.user_id,
        role: row.role,
        is_primary: row.is_primary,
        notes: row.notes,
        assigned_at: row.assigned_at,
        assigned_by: row.assigned_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_first_name: row.users?.first_name ?? null,
        user_last_name: row.users?.last_name ?? null,
        user_email: row.users?.email ?? '',
        user_avatar_url: row.users?.avatar_url ?? null,
      }))
    },
    enabled: !!contactId,
  })
}

// ─── Add team member ────────────────────────────────────────────────────────

export function useAddContactAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      contactId: string
      userId: string
      role: string
      isPrimary?: boolean
      assignedBy?: string
    }) => {
      const supabase = createClient()

      // If setting as primary, unset any existing primary first
      if (params.isPrimary) {
        await supabase
          .from('contact_assignments')
          .update({ is_primary: false })
          .eq('contact_id', params.contactId)
          .eq('is_primary', true)
      }

      const { data, error } = await supabase
        .from('contact_assignments')
        .insert({
          tenant_id: params.tenantId,
          contact_id: params.contactId,
          user_id: params.userId,
          role: params.role,
          is_primary: params.isPrimary ?? false,
          assigned_by: params.assignedBy,
        })
        .select()
        .single()

      if (error) throw error

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.byContact(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts', 'detail', variables.contactId] })
      toast.success('Team member assigned')
    },
    onError: (error: Error) => {
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        toast.error('This person is already assigned with that role')
      } else {
        toast.error(error.message || 'Failed to assign team member')
      }
    },
  })
}

// ─── Remove team member ─────────────────────────────────────────────────────

export function useRemoveContactAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { assignmentId: string; contactId: string }) => {
      const supabase = createClient()

      const { error } = await supabase
        .from('contact_assignments')
        .delete()
        .eq('id', params.assignmentId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.byContact(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Team member removed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove team member')
    },
  })
}

// ─── Set primary handler ────────────────────────────────────────────────────

export function useSetPrimaryAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { assignmentId: string; contactId: string; userId: string }) => {
      const supabase = createClient()

      // Unset all other primaries for this contact
      await supabase
        .from('contact_assignments')
        .update({ is_primary: false })
        .eq('contact_id', params.contactId)
        .eq('is_primary', true)

      // Set this one as primary
      const { error } = await supabase
        .from('contact_assignments')
        .update({ is_primary: true })
        .eq('id', params.assignmentId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.byContact(variables.contactId) })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Primary handler updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update primary handler')
    },
  })
}
