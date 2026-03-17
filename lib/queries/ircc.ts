import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import { readinessKeys } from '@/lib/queries/immigration-readiness'
import { toast } from 'sonner'
import {
  getMatterTypeFormIds,
  buildClientQuestionnaireFromDB,
} from '@/lib/ircc/questionnaire-engine-db'
import type { Questionnaire } from '@/lib/ircc/questionnaire-engine'

type IRCCFormTemplate = Database['public']['Tables']['ircc_form_templates']['Row']
type IRCCSession = Database['public']['Tables']['ircc_questionnaire_sessions']['Row']
type IRCCSessionInsert = Database['public']['Tables']['ircc_questionnaire_sessions']['Insert']

// ── Query Keys ──────────────────────────────────────────────────────────────

export const irccKeys = {
  all: ['ircc'] as const,
  templates: (tenantId: string) => [...irccKeys.all, 'templates', tenantId] as const,
  sessions: () => [...irccKeys.all, 'sessions'] as const,
  session: (id: string) => [...irccKeys.sessions(), id] as const,
  matterSession: (matterId: string) => [...irccKeys.sessions(), 'matter', matterId] as const,
  profile: (contactId: string) => [...irccKeys.all, 'profile', contactId] as const,
}

// ── Form Templates ──────────────────────────────────────────────────────────

export function useIRCCFormTemplates(tenantId: string) {
  return useQuery({
    queryKey: irccKeys.templates(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_form_templates')
        .select('id, tenant_id, form_code, form_name, form_version, description, is_active, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('form_code')

      if (error) throw error
      return data as IRCCFormTemplate[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // Templates rarely change
  })
}

// ── Questionnaire Sessions ──────────────────────────────────────────────────

export function useIRCCQuestionnaireSession(sessionId: string) {
  return useQuery({
    queryKey: irccKeys.session(sessionId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_questionnaire_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error) throw error
      return data as IRCCSession
    },
    enabled: !!sessionId,
  })
}

export function useIRCCMatterSession(matterId: string) {
  return useQuery({
    queryKey: irccKeys.matterSession(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_questionnaire_sessions')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as IRCCSession | null
    },
    enabled: !!matterId,
  })
}

export function useCreateIRCCSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (session: IRCCSessionInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_questionnaire_sessions')
        .insert(session)
        .select()
        .single()

      if (error) throw error
      return data as IRCCSession
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: irccKeys.sessions() })
      if (data.matter_id) {
        queryClient.invalidateQueries({ queryKey: irccKeys.matterSession(data.matter_id) })
      }
      toast.success('IRCC questionnaire session started')
    },
    onError: () => {
      toast.error('Failed to start questionnaire session')
    },
  })
}

export function useUpdateIRCCSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; progress?: unknown; completed_at?: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_questionnaire_sessions')
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as IRCCSession
    },
    onSuccess: (data) => {
      queryClient.setQueryData(irccKeys.session(data.id), data)
      if (data.matter_id) {
        queryClient.invalidateQueries({ queryKey: irccKeys.matterSession(data.matter_id) })
      }
    },
    onError: () => {
      toast.error('Failed to update session')
    },
  })
}

export function useCompleteIRCCSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_questionnaire_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single()

      if (error) throw error
      return data as IRCCSession
    },
    onSuccess: (data) => {
      queryClient.setQueryData(irccKeys.session(data.id), data)
      queryClient.invalidateQueries({ queryKey: irccKeys.sessions() })
      if (data.matter_id) {
        queryClient.invalidateQueries({ queryKey: irccKeys.matterSession(data.matter_id) })
      }
      toast.success('IRCC questionnaire completed')
    },
    onError: () => {
      toast.error('Failed to complete session')
    },
  })
}

// ── Profile field diff helper ────────────────────────────────────────────────

/**
 * Flattens a nested object into dot-notation paths.
 * { personal: { family_name: 'X' } } → { 'personal.family_name': 'X' }
 * Skips null/undefined leaves to avoid noise.
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v as Record<string, unknown>, path, out)
    } else {
      out[path] = v
    }
  }
  return out
}

// ── Client Profile (contacts.immigration_data) ──────────────────────────────

export function useIRCCClientProfile(contactId: string) {
  return useQuery({
    queryKey: irccKeys.profile(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, immigration_data')
        .eq('id', contactId)
        .single()

      if (error) throw error
      return (data?.immigration_data as Partial<IRCCProfile>) ?? {}
    },
    enabled: !!contactId,
  })
}

export function useUpdateIRCCProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      contactId,
      profile,
      changedBy,
    }: {
      contactId: string
      profile: Partial<IRCCProfile>
      /** When provided, readiness cache is invalidated immediately after save */
      matterId?: string
      /**
       * Who made this change — a user UUID for staff edits, or 'portal' for
       * client portal submissions. When omitted, history is not recorded.
       */
      changedBy?: string
    }) => {
      const supabase = createClient()

      // Fetch existing data + tenant_id for history recording
      const { data: existing, error: fetchError } = await supabase
        .from('contacts')
        .select('tenant_id, immigration_data')
        .eq('id', contactId)
        .single()

      if (fetchError) throw fetchError

      const existingData = (existing?.immigration_data as Record<string, unknown>) ?? {}
      const mergedData = deepMerge(existingData, profile as unknown as Record<string, unknown>)

      const { data, error } = await supabase
        .from('contacts')
        .update({ immigration_data: mergedData as unknown as Database['public']['Tables']['contacts']['Update']['immigration_data'] })
        .eq('id', contactId)
        .select('id, immigration_data')
        .single()

      if (error) throw error

      // Record which fields changed (fire-and-forget — non-blocking)
      if (changedBy && existing?.tenant_id) {
        const oldFlat = flattenObject(existingData)
        const newFlat = flattenObject(mergedData as Record<string, unknown>)
        const allPaths = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])
        const historyRows: {
          tenant_id: string
          contact_id: string
          profile_path: string
          old_value: unknown
          new_value: unknown
          changed_by: string
        }[] = []
        for (const path of allPaths) {
          if (JSON.stringify(oldFlat[path]) !== JSON.stringify(newFlat[path])) {
            historyRows.push({
              tenant_id: existing.tenant_id,
              contact_id: contactId,
              profile_path: path,
              old_value: oldFlat[path] ?? null,
              new_value: newFlat[path] ?? null,
              changed_by: changedBy,
            })
          }
        }
        if (historyRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void (supabase as any).from('profile_field_history').insert(historyRows)
        }
      }

      return data?.immigration_data as Partial<IRCCProfile>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: irccKeys.profile(variables.contactId) })
      // Invalidate readiness cache so header, action panel, sections update immediately
      if (variables.matterId) {
        queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
      }
    },
    onError: () => {
      toast.error('Failed to save profile data')
    },
  })
}

// ── DB-Driven Questionnaire ──────────────────────────────────────────────────

/**
 * Build a questionnaire from DB field mappings for a matter type.
 *
 * This is the "perfect link" path:
 *   Settings → Matter Type → ircc_stream_forms → ircc_form_fields → questions
 *
 * Returns null when the matter type has no forms configured in ircc_stream_forms.
 * The caller should fall back to the hardcoded registry in that case.
 */
export function useDBQuestionnaire(
  matterTypeId: string | null,
  existingProfile: Partial<IRCCProfile>,
) {
  return useQuery<Questionnaire | null>({
    queryKey: ['ircc', 'db-questionnaire', matterTypeId],
    queryFn: async () => {
      if (!matterTypeId) return null

      const supabase = createClient()

      // 1. Fetch form UUIDs from ircc_stream_forms for this matter type
      const formIds = await getMatterTypeFormIds(matterTypeId, supabase)
      if (formIds.length === 0) return null

      // 2. Build questionnaire from DB fields (is_client_visible = true)
      const questionnaire = await buildClientQuestionnaireFromDB(
        formIds,
        existingProfile,
        supabase,
      )

      // Return null if no sections were built (no mapped fields)
      if (questionnaire.sections.length === 0) return null

      return questionnaire
    },
    enabled: !!matterTypeId,
    staleTime: 60_000, // Form structure rarely changes
  })
}

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Deep merge two objects. Arrays are replaced, not concatenated.
 * Null/undefined values in source do NOT overwrite existing values.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = target[key]

    if (sourceVal === undefined || sourceVal === null) {
      continue // Don't overwrite with empty values
    }

    if (
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      result[key] = sourceVal
    }
  }

  return result
}
