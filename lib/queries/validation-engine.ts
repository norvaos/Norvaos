/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Forms Engine — Validation Engine React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bridges the validation rules engine (validateFormInstance, checkGenerationReadiness)
 * and composite validation rules to the React UI via TanStack Query hooks.
 *
 * Query hooks: useFormValidation, useGenerationReadiness, useCompositeRules
 */

import { useQuery } from '@tanstack/react-query'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { createSupabaseValidationDataAccess } from '@/lib/ircc/answer-engine-data-access'
import { validateFormInstance, checkGenerationReadiness } from '@/lib/ircc/validation-rules-engine'
import type { ValidationResult } from '@/lib/ircc/validation-rules-engine'
import type { AnswerMap } from '@/lib/ircc/types/answers'
import type { CompositeValidationRule } from '@/lib/ircc/types/reuse'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const validationKeys = {
  all: ['validation'] as const,
  formValidation: (instanceId: string) =>
    [...validationKeys.all, 'form', instanceId] as const,
  generationReadiness: (instanceId: string) =>
    [...validationKeys.all, 'readiness', instanceId] as const,
  compositeRules: (formId: string) =>
    [...validationKeys.all, 'composite', formId] as const,
}

// ── Helper: Fetch instance row ───────────────────────────────────────────────

interface InstanceRow {
  id: string
  form_id: string
  matter_id: string
  person_id: string | null
  answers: AnswerMap
}

async function fetchInstanceRow(instanceId: string): Promise<InstanceRow> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('matter_form_instances' as never)
    .select('id, form_id, matter_id, person_id, answers')
    .eq('id', instanceId)
    .single()

  if (error) throw new Error(`Failed to fetch instance ${instanceId}: ${error.message}`)

  const row = data as unknown as InstanceRow
  return {
    ...row,
    answers: row.answers ?? {},
  }
}

// ── Query: Form Validation ───────────────────────────────────────────────────

/**
 * Runs validateFormInstance in 'final' mode and returns the full ValidationResult.
 * Stale time is 10 seconds because validation changes when answers change.
 */
export function useFormValidation(instanceId: string) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery<ValidationResult>({
    queryKey: validationKeys.formValidation(instanceId),
    enabled: !!instanceId && !!tenantId,
    staleTime: 10_000,
    queryFn: async () => {
      const supabase = createClient()
      const dataAccess = createSupabaseValidationDataAccess(supabase)
      const instance = await fetchInstanceRow(instanceId)

      return validateFormInstance(
        instanceId,
        instance.form_id,
        instance.answers,
        'final',
        dataAccess,
        tenantId!,
        instance.matter_id
      )
    },
  })
}

// ── Query: Generation Readiness ──────────────────────────────────────────────

/**
 * Runs checkGenerationReadiness and returns the full readiness payload including
 * blockers, stale count, unresolved conflicts, and composite failures.
 * Stale time is 10 seconds to stay responsive to answer edits.
 */
export function useGenerationReadiness(instanceId: string) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery({
    queryKey: validationKeys.generationReadiness(instanceId),
    enabled: !!instanceId && !!tenantId,
    staleTime: 10_000,
    queryFn: async () => {
      const supabase = createClient()
      const dataAccess = createSupabaseValidationDataAccess(supabase)
      const instance = await fetchInstanceRow(instanceId)

      return checkGenerationReadiness(
        instanceId,
        instance.form_id,
        instance.answers,
        dataAccess,
        tenantId!,
        instance.matter_id,
        instance.person_id
      )
    },
  })
}

// ── Query: Composite Rules ───────────────────────────────────────────────────

/**
 * Fetches composite_validation_rules for a given form (and global rules where
 * form_id IS NULL). Stale time is 5 minutes since rules change infrequently.
 */
export function useCompositeRules(formId: string | null) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery<CompositeValidationRule[]>({
    queryKey: validationKeys.compositeRules(formId ?? ''),
    enabled: !!formId && !!tenantId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const supabase = createClient()
      const dataAccess = createSupabaseValidationDataAccess(supabase)

      return dataAccess.getCompositeRules(formId!, tenantId!)
    },
  })
}
