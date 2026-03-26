/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Forms Engine  -  Answer Engine React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bridges the answer engine (saveAnswers, computeCompletionState, stale tracker)
 * to the React UI via TanStack Query hooks.
 *
 * Query hooks:  useInstanceAnswers, useCompletionState
 * Mutation hooks: useSaveAnswers, useClearStaleFlags, useVerifyAnswer
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { saveAnswers } from '@/lib/ircc/answer-engine'
import { clearStaleFlags } from '@/lib/ircc/stale-tracker'
import { createSupabaseAnswerEngineDataAccess } from '@/lib/ircc/answer-engine-data-access'
import type {
  AnswerMap,
  AnswerSource,
  CompletionState,
  SaveAnswersResult,
} from '@/lib/ircc/types/answers'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const answerEngineKeys = {
  all: ['answer-engine'] as const,
  instanceAnswers: (instanceId: string) =>
    [...answerEngineKeys.all, 'answers', instanceId] as const,
  completionState: (instanceId: string) =>
    [...answerEngineKeys.all, 'completion-state', instanceId] as const,
  staleFields: (instanceId: string) =>
    [...answerEngineKeys.all, 'stale-fields', instanceId] as const,
}

// ── Query: Instance Answers ──────────────────────────────────────────────────

/**
 * Fetch the answers JSONB column from matter_form_instances for a given instance.
 * Stale time is 30 seconds since answers change frequently during active editing.
 */
export function useInstanceAnswers(instanceId: string) {
  return useQuery({
    queryKey: answerEngineKeys.instanceAnswers(instanceId),
    enabled: !!instanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<AnswerMap> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('answers')
        .eq('id', instanceId)
        .single()

      if (error) throw new Error(error.message)

      return ((data as Record<string, unknown>)?.answers as AnswerMap) ?? {}
    },
  })
}

// ── Query: Completion State ──────────────────────────────────────────────────

/**
 * Fetch the completion_state JSONB column from matter_form_instances.
 */
export function useCompletionState(instanceId: string) {
  return useQuery({
    queryKey: answerEngineKeys.completionState(instanceId),
    enabled: !!instanceId,
    queryFn: async (): Promise<CompletionState | null> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('completion_state')
        .eq('id', instanceId)
        .single()

      if (error) throw new Error(error.message)

      return ((data as Record<string, unknown>)?.completion_state as CompletionState) ?? null
    },
  })
}

// ── Mutation: Save Answers ───────────────────────────────────────────────────

/**
 * Save answer updates to a form instance via the answer engine.
 * Handles source tracking, cross-form propagation, and stale invalidation.
 * Invalidates instanceAnswers and completionState queries on success.
 */
export function useSaveAnswers() {
  const qc = useQueryClient()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async (params: {
      instanceId: string
      updates: Record<string, unknown>
      source: AnswerSource
      sourceOrigin?: string
      changedBy?: string
    }): Promise<SaveAnswersResult> => {
      const supabase = createClient()
      const dataAccess = createSupabaseAnswerEngineDataAccess(supabase)

      const result = await saveAnswers(
        {
          instance_id: params.instanceId,
          updates: params.updates,
          source: params.source,
          source_origin: params.sourceOrigin,
          changed_by: params.changedBy,
        },
        dataAccess,
        tenant!.id
      )

      return result
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: answerEngineKeys.instanceAnswers(vars.instanceId) })
      qc.invalidateQueries({ queryKey: answerEngineKeys.completionState(vars.instanceId) })
      qc.invalidateQueries({ queryKey: answerEngineKeys.staleFields(vars.instanceId) })
    },
    onError: (err: Error) => {
      toast.error(`Failed to save answers: ${err.message}`)
    },
  })
}

// ── Mutation: Clear Stale Flags ──────────────────────────────────────────────

/**
 * Clear stale flags on specified profile paths (e.g. when a user re-confirms
 * an answer after a parent dependency changed). Reads the current answers,
 * applies clearStaleFlags from stale-tracker.ts, and writes back.
 */
export function useClearStaleFlags() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      instanceId: string
      profilePaths: string[]
    }): Promise<AnswerMap> => {
      const supabase = createClient()

      // 1. Read current answers
      const { data: row, error: readError } = await supabase
        .from('matter_form_instances' as never)
        .select('answers')
        .eq('id', params.instanceId)
        .single()

      if (readError) throw new Error(readError.message)

      const currentAnswers = ((row as Record<string, unknown>)?.answers as AnswerMap) ?? {}

      // 2. Apply stale flag clearing (pure function, no mutation)
      const updatedAnswers = clearStaleFlags(currentAnswers, params.profilePaths)

      // 3. Write updated answers back
      const { error: writeError } = await supabase
        .from('matter_form_instances' as never)
        .update({ answers: updatedAnswers } as never)
        .eq('id', params.instanceId)

      if (writeError) throw new Error(writeError.message)

      return updatedAnswers
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: answerEngineKeys.instanceAnswers(vars.instanceId) })
      qc.invalidateQueries({ queryKey: answerEngineKeys.completionState(vars.instanceId) })
      qc.invalidateQueries({ queryKey: answerEngineKeys.staleFields(vars.instanceId) })
      toast.success('Stale flags cleared')
    },
    onError: (err: Error) => {
      toast.error(`Failed to clear stale flags: ${err.message}`)
    },
  })
}

// ── Mutation: Verify Answer ──────────────────────────────────────────────────

/**
 * Mark a specific answer as verified by updating the answer record's
 * verified, verified_by, and verified_at fields in the answers JSONB.
 */
export function useVerifyAnswer() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      instanceId: string
      profilePath: string
      verifiedBy: string
    }): Promise<void> => {
      const supabase = createClient()

      // 1. Read current answers
      const { data: row, error: readError } = await supabase
        .from('matter_form_instances' as never)
        .select('answers')
        .eq('id', params.instanceId)
        .single()

      if (readError) throw new Error(readError.message)

      const currentAnswers = ((row as Record<string, unknown>)?.answers as AnswerMap) ?? {}

      // 2. Find the answer record for the specified profile path
      const existingRecord = currentAnswers[params.profilePath]
      if (!existingRecord) {
        throw new Error(`No answer found for profile path: ${params.profilePath}`)
      }

      // 3. Update verification fields
      const updatedAnswers: AnswerMap = {
        ...currentAnswers,
        [params.profilePath]: {
          ...existingRecord,
          verified: true,
          verified_by: params.verifiedBy,
          verified_at: new Date().toISOString(),
        },
      }

      // 4. Write back
      const { error: writeError } = await supabase
        .from('matter_form_instances' as never)
        .update({ answers: updatedAnswers } as never)
        .eq('id', params.instanceId)

      if (writeError) throw new Error(writeError.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: answerEngineKeys.instanceAnswers(vars.instanceId) })
      toast.success('Answer verified')
    },
    onError: (err: Error) => {
      toast.error(`Failed to verify answer: ${err.message}`)
    },
  })
}
