/**
 * =============================================================================
 * Contact Field Change History — TanStack Query Hooks
 * =============================================================================
 * Directive: Data Evolution — Verification & Historical Snapshot Engine
 *
 * Tracks all changes to contact fields with old/new values, evidence links,
 * and user stamps. High-security fields require verification evidence.
 * =============================================================================
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type FieldChangeRow = Database['public']['Tables']['contact_field_changes']['Row']
type FieldChangeInsert = Database['public']['Tables']['contact_field_changes']['Insert']

// ── High-Security Field Registry ─────────────────────────────────────────────

export const HIGH_SECURITY_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'passport_number',
  'national_id',
  'uci',
] as const

export type HighSecurityField = typeof HIGH_SECURITY_FIELDS[number]

export function isHighSecurityField(fieldName: string): boolean {
  return (HIGH_SECURITY_FIELDS as readonly string[]).includes(fieldName)
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useContactFieldHistory(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-field-history', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contact_field_changes')
        .select('*')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('changed_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return data as FieldChangeRow[]
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useLogFieldChange() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: FieldChangeInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contact_field_changes')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data as FieldChangeRow
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['contact-field-history', variables.contact_id] })
    },
  })
}

/**
 * Logs multiple field changes in a single batch.
 * Used during pre-population verification when multiple fields change at once.
 */
export function useLogFieldChangeBatch() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (inputs: FieldChangeInsert[]) => {
      if (inputs.length === 0) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contact_field_changes')
        .insert(inputs)
        .select()

      if (error) throw error
      return data as FieldChangeRow[]
    },
    onSuccess: (_data, variables) => {
      const contactIds = [...new Set(variables.map(v => v.contact_id))]
      contactIds.forEach(id => {
        qc.invalidateQueries({ queryKey: ['contact-field-history', id] })
      })
    },
  })
}
