/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Command Centre — React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Query and mutation hooks for:
 *   1. Live Intake Sessions (transcription, entity extraction, stream recommendation)
 *   2. Compliance Bypass Log (retainer gate bypass audit)
 *   3. Onboarding Runs (one-click matter initialisation tracking)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database, Json } from '@/lib/types/database'
import { toast } from 'sonner'

type IntakeSession = Database['public']['Tables']['intake_sessions']['Row']
type IntakeSessionInsert = Database['public']['Tables']['intake_sessions']['Insert']
type ComplianceBypassLog = Database['public']['Tables']['compliance_bypass_log']['Row']
type OnboardingRun = Database['public']['Tables']['onboarding_runs']['Row']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const commandCentreKeys = {
  all: ['command-centre'] as const,
  intakeSessions: (leadId: string) => [...commandCentreKeys.all, 'intake-sessions', leadId] as const,
  intakeSession: (id: string) => [...commandCentreKeys.all, 'intake-session', id] as const,
  complianceBypasses: (leadId: string) => [...commandCentreKeys.all, 'compliance-bypasses', leadId] as const,
  onboardingRun: (matterId: string) => [...commandCentreKeys.all, 'onboarding-run', matterId] as const,
}

// ─── 1. Intake Sessions ─────────────────────────────────────────────────────

/** Fetch all intake sessions for a lead */
export function useIntakeSessions(leadId: string) {
  return useQuery({
    queryKey: commandCentreKeys.intakeSessions(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_sessions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as IntakeSession[]
    },
    enabled: !!leadId,
  })
}

/** Fetch a single intake session */
export function useIntakeSession(id: string) {
  return useQuery({
    queryKey: commandCentreKeys.intakeSession(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_sessions')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as IntakeSession
    },
    enabled: !!id,
  })
}

/** Start a new intake session */
export function useStartIntakeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      leadId,
      userId,
    }: {
      tenantId: string
      leadId: string
      userId: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_sessions')
        .insert({
          tenant_id: tenantId,
          lead_id: leadId,
          user_id: userId,
          status: 'active',
        } as IntakeSessionInsert)
        .select()
        .single()

      if (error) throw error
      return data as IntakeSession
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.intakeSessions(data.lead_id) })
      toast.success('Intake session started')
    },
    onError: () => {
      toast.error('Failed to start intake session')
    },
  })
}

/** Update an intake session (transcript, entities, summary, status) */
export function useUpdateIntakeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      leadId,
      ...updates
    }: {
      id: string
      leadId: string
      transcript?: string
      summary?: string
      extracted_entities?: Json
      suggested_stream?: string
      suggested_matter_type_id?: string
      recommendation_confidence?: number
      status?: string
      finalised_at?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_sessions')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { ...data, leadId } as IntakeSession & { leadId: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.intakeSessions(data.leadId) })
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.intakeSession(data.id) })
    },
    onError: () => {
      toast.error('Failed to update intake session')
    },
  })
}

/** Finalise an intake session — applies extracted entities to lead_metadata */
export function useFinaliseIntakeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sessionId,
      leadId,
      extractedEntities,
      summary,
    }: {
      sessionId: string
      leadId: string
      extractedEntities: Record<string, unknown>
      summary: string
    }) => {
      const supabase = createClient()

      // 1. Finalise the session
      const { error: sessionError } = await supabase
        .from('intake_sessions')
        .update({
          status: 'finalised',
          finalised_at: new Date().toISOString(),
          summary,
          extracted_entities: extractedEntities as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)

      if (sessionError) throw sessionError

      // 2. Merge extracted entities into lead_metadata
      const { data: lead } = await supabase
        .from('leads')
        .select('lead_metadata')
        .eq('id', leadId)
        .single()

      const existingMetadata = (lead?.lead_metadata as Record<string, unknown>) ?? {}
      const mergedMetadata = { ...existingMetadata, ...extractedEntities }

      const { error: leadError } = await supabase
        .from('leads')
        .update({
          lead_metadata: mergedMetadata as unknown as Json,
          notes: summary,
        })
        .eq('id', leadId)

      if (leadError) throw leadError

      return { sessionId, leadId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.intakeSessions(data.leadId) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Intake session finalised — lead data updated')
    },
    onError: () => {
      toast.error('Failed to finalise intake session')
    },
  })
}

// ─── 2. Compliance Bypass ───────────────────────────────────────────────────

/** Fetch compliance bypass history for a lead */
export function useComplianceBypasses(leadId: string) {
  return useQuery({
    queryKey: commandCentreKeys.complianceBypasses(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('compliance_bypass_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as ComplianceBypassLog[]
    },
    enabled: !!leadId,
  })
}

/** Log a compliance gate bypass */
export function useLogComplianceBypass() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      leadId: string
      matterId?: string
      userId: string
      gateName: string
      bypassReason: string
      userRole: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('compliance_bypass_log')
        .insert({
          tenant_id: params.tenantId,
          lead_id: params.leadId,
          matter_id: params.matterId ?? null,
          user_id: params.userId,
          gate_name: params.gateName,
          bypass_reason: params.bypassReason,
          user_role: params.userRole,
        })
        .select()
        .single()

      if (error) throw error
      return data as ComplianceBypassLog
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.complianceBypasses(data.lead_id) })
    },
    onError: () => {
      toast.error('Failed to log compliance bypass')
    },
  })
}

// ─── 3. Onboarding Runs ─────────────────────────────────────────────────────

/** Fetch the onboarding run for a matter */
export function useOnboardingRun(matterId: string) {
  return useQuery({
    queryKey: commandCentreKeys.onboardingRun(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('onboarding_runs')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as OnboardingRun | null
    },
    enabled: !!matterId,
  })
}

/** Trigger the one-click onboarding sequence via API */
export function useRunOnboarding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      leadId?: string
    }) => {
      const res = await fetch(`/api/matters/${params.matterId}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: params.leadId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Onboarding failed')
      }

      return res.json() as Promise<{ success: boolean; onboardingRunId: string }>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: commandCentreKeys.onboardingRun(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success('One-click onboarding complete')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Onboarding failed')
    },
  })
}
