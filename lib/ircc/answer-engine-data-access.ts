/**
 * IRCC Forms Engine  -  Supabase DataAccess Implementations
 *
 * Bridges the pure-logic engine modules (answer-engine, prefill-resolver,
 * validation-rules-engine) to the Supabase database. Each factory function
 * returns an implementation of the corresponding DataAccess interface,
 * keeping all SQL/network concerns out of the engine modules.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnswerEngineDataAccess } from './answer-engine'
import type { PrefillDataAccess } from './prefill-resolver'
import type { ValidationDataAccess } from './validation-rules-engine'
import type {
  AnswerMap,
  AnswerRecord,
  AnswerSource,
  CompletionState,
  OnParentChange,
  PropagationMode,
} from './types/answers'
import type { CompositeValidationRule } from './types/reuse'

// ---------------------------------------------------------------------------
// AnswerEngineDataAccess
// ---------------------------------------------------------------------------

/** Create a Supabase-backed AnswerEngineDataAccess implementation. */
export function createSupabaseAnswerEngineDataAccess(
  supabase: SupabaseClient
): AnswerEngineDataAccess {
  return {
    async getInstanceAnswers(instanceId: string): Promise<AnswerMap> {
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('answers')
        .eq('id', instanceId)
        .single()

      if (error) {
        throw new Error(
          `Failed to get instance answers for ${instanceId}: ${error.message}`
        )
      }

      const row = data as unknown as { answers: AnswerMap | null }
      return row.answers ?? {}
    },

    async updateInstanceAnswers(
      instanceId: string,
      answers: AnswerMap,
      completionState: CompletionState,
      counts: {
        blocker_count: number
        stale_count: number
        missing_required_count: number
      }
    ): Promise<void> {
      const { error } = await supabase
        .from('matter_form_instances' as never)
        .update({
          answers,
          completion_state: completionState,
          blocker_count: counts.blocker_count,
          stale_count: counts.stale_count,
          missing_required_count: counts.missing_required_count,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', instanceId)

      if (error) {
        throw new Error(
          `Failed to update instance answers for ${instanceId}: ${error.message}`
        )
      }
    },

    async getSiblingInstances(
      instanceId: string
    ): Promise<
      Array<{
        id: string
        form_id: string
        status: string
        answers: AnswerMap
        person_id: string | null
      }>
    > {
      // First get the matter_id for this instance
      const { data: instance, error: instanceError } = await supabase
        .from('matter_form_instances' as never)
        .select('matter_id')
        .eq('id', instanceId)
        .single()

      if (instanceError) {
        throw new Error(
          `Failed to get matter_id for instance ${instanceId}: ${instanceError.message}`
        )
      }

      const { matter_id } = instance as unknown as { matter_id: string }

      // Then fetch all active instances in the same matter
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('id, form_id, status, answers, person_id')
        .eq('matter_id', matter_id)
        .eq('is_active', true)

      if (error) {
        throw new Error(
          `Failed to get sibling instances for matter ${matter_id}: ${error.message}`
        )
      }

      return (data as unknown as Array<{
        id: string
        form_id: string
        status: string
        answers: AnswerMap | null
        person_id: string | null
      }>).map((row) => ({
        ...row,
        answers: row.answers ?? {},
      }))
    },

    async getFormFields(
      formId: string
    ): Promise<
      Array<{
        id: string
        profile_path: string | null
        field_type: string | null
        is_required: boolean
        is_client_visible: boolean
        is_mapped: boolean
        is_meta_field: boolean
        show_when: unknown
        required_condition: unknown
        on_parent_change: OnParentChange
        propagation_mode: PropagationMode
        section_id: string | null
        min_length: number | null
        max_length: number | null
        validation_pattern: string | null
        is_blocking: boolean
        options: Array<{ label: string; value: string }> | null
      }>
    > {
      const { data, error } = await supabase
        .from('ircc_form_fields' as never)
        .select(
          'id, profile_path, field_type, is_required, is_client_visible, is_mapped, is_meta_field, show_when, required_condition, on_parent_change, propagation_mode, section_id, min_length, max_length, validation_pattern, is_blocking, options'
        )
        .eq('form_id', formId)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(
          `Failed to get form fields for form ${formId}: ${error.message}`
        )
      }

      return (data ?? []) as unknown as Array<{
        id: string
        profile_path: string | null
        field_type: string | null
        is_required: boolean
        is_client_visible: boolean
        is_mapped: boolean
        is_meta_field: boolean
        show_when: unknown
        required_condition: unknown
        on_parent_change: OnParentChange
        propagation_mode: PropagationMode
        section_id: string | null
        min_length: number | null
        max_length: number | null
        validation_pattern: string | null
        is_blocking: boolean
        options: Array<{ label: string; value: string }> | null
      }>
    },

    async getInstanceFormId(instanceId: string): Promise<string> {
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('form_id')
        .eq('id', instanceId)
        .single()

      if (error) {
        throw new Error(
          `Failed to get form_id for instance ${instanceId}: ${error.message}`
        )
      }

      const row = data as unknown as { form_id: string }
      return row.form_id
    },

    async logAnswerChange(entry: {
      tenant_id: string
      form_instance_id: string
      profile_path: string
      old_value: unknown
      new_value: unknown
      source: AnswerSource
      source_origin?: string
      changed_by?: string
      stale_triggered: boolean
    }): Promise<void> {
      const { error } = await supabase
        .from('form_instance_answer_history' as never)
        .insert({
          tenant_id: entry.tenant_id,
          form_instance_id: entry.form_instance_id,
          profile_path: entry.profile_path,
          old_value: entry.old_value,
          new_value: entry.new_value,
          source: entry.source,
          source_origin: entry.source_origin ?? null,
          changed_by: entry.changed_by ?? null,
          stale_triggered: entry.stale_triggered,
        } as never)

      if (error) {
        throw new Error(
          `Failed to log answer change for ${entry.form_instance_id}/${entry.profile_path}: ${error.message}`
        )
      }
    },

    async logReuseEvent(entry: {
      tenant_id: string
      reuse_type: 'cross_form'
      target_instance_id: string
      target_profile_path: string
      source_instance_id: string
      value: unknown
    }): Promise<void> {
      const { error } = await supabase
        .from('reuse_log' as never)
        .insert({
          tenant_id: entry.tenant_id,
          reuse_type: entry.reuse_type,
          target_instance_id: entry.target_instance_id,
          target_profile_path: entry.target_profile_path,
          source_instance_id: entry.source_instance_id,
          value: entry.value,
        } as never)

      if (error) {
        throw new Error(
          `Failed to log reuse event for ${entry.target_instance_id}/${entry.target_profile_path}: ${error.message}`
        )
      }
    },
  }
}

// ---------------------------------------------------------------------------
// PrefillDataAccess
// ---------------------------------------------------------------------------

/** Create a Supabase-backed PrefillDataAccess implementation. */
export function createSupabasePrefillDataAccess(
  supabase: SupabaseClient
): PrefillDataAccess {
  return {
    async getInstanceAnswers(instanceId: string): Promise<AnswerMap> {
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('answers')
        .eq('id', instanceId)
        .single()

      if (error) {
        throw new Error(
          `Failed to get instance answers for ${instanceId}: ${error.message}`
        )
      }

      const row = data as unknown as { answers: AnswerMap | null }
      return row.answers ?? {}
    },

    async getCanonicalFields(
      contactId: string
    ): Promise<
      Array<{
        id: string
        domain: string
        field_key: string
        value: unknown
        verification_status:
          | 'pending'
          | 'verified'
          | 'client_submitted'
          | 'conflict'
        effective_from: string
        source: string
      }>
    > {
      const { data, error } = await supabase
        .from('canonical_profile_fields' as never)
        .select(
          'id, domain, field_key, value, verification_status, effective_from, source'
        )
        .eq('contact_id', contactId)
        .order('effective_from', { ascending: false })

      if (error) {
        throw new Error(
          `Failed to get canonical fields for contact ${contactId}: ${error.message}`
        )
      }

      return (data ?? []) as unknown as Array<{
        id: string
        domain: string
        field_key: string
        value: unknown
        verification_status:
          | 'pending'
          | 'verified'
          | 'client_submitted'
          | 'conflict'
        effective_from: string
        source: string
      }>
    },

    async getContactFields(
      contactId: string
    ): Promise<Record<string, unknown>> {
      const { data, error } = await supabase
        .from('contacts' as never)
        .select(
          'first_name, last_name, email, phone, date_of_birth, gender, nationality, marital_status, country_of_residence, country_of_birth'
        )
        .eq('id', contactId)
        .single()

      if (error) {
        throw new Error(
          `Failed to get contact fields for ${contactId}: ${error.message}`
        )
      }

      return (data ?? {}) as Record<string, unknown>
    },

    async getCrossFormAnswers(
      matterId: string,
      instanceId: string,
      profilePaths: string[]
    ): Promise<Record<string, AnswerRecord>> {
      if (profilePaths.length === 0) return {}

      // Get all active sibling instances in the same matter (excluding self)
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('id, answers')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .neq('id', instanceId)

      if (error) {
        throw new Error(
          `Failed to get cross-form answers for matter ${matterId}: ${error.message}`
        )
      }

      const siblings = (data ?? []) as unknown as Array<{
        id: string
        answers: AnswerMap | null
      }>

      // Collect the most recent answer for each requested profile_path
      const result: Record<string, AnswerRecord> = {}

      for (const sibling of siblings) {
        if (!sibling.answers) continue

        for (const path of profilePaths) {
          const record = sibling.answers[path]
          if (!record || record.value === null || record.value === undefined) {
            continue
          }

          // Keep the most recently updated value
          const existing = result[path]
          if (
            !existing ||
            new Date(record.updated_at) > new Date(existing.updated_at)
          ) {
            result[path] = record
          }
        }
      }

      return result
    },
  }
}

// ---------------------------------------------------------------------------
// ValidationDataAccess
// ---------------------------------------------------------------------------

/** Create a Supabase-backed ValidationDataAccess implementation. */
export function createSupabaseValidationDataAccess(
  supabase: SupabaseClient
): ValidationDataAccess {
  return {
    async getFormFields(
      formId: string
    ): Promise<
      Array<{
        id: string
        profile_path: string | null
        label: string | null
        field_type: string | null
        is_required: boolean
        is_mapped: boolean
        is_meta_field: boolean
        is_blocking: boolean
        min_length: number | null
        max_length: number | null
        validation_pattern: string | null
        validation_message: string | null
        options: Array<{ label: string; value: string }> | null
        show_when: unknown
        required_condition: unknown
        section_id: string | null
      }>
    > {
      const { data, error } = await supabase
        .from('ircc_form_fields' as never)
        .select(
          'id, profile_path, label, field_type, is_required, is_mapped, is_meta_field, is_blocking, min_length, max_length, validation_pattern, validation_message, options, show_when, required_condition, section_id'
        )
        .eq('form_id', formId)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(
          `Failed to get form fields for form ${formId}: ${error.message}`
        )
      }

      return (data ?? []) as unknown as Array<{
        id: string
        profile_path: string | null
        label: string | null
        field_type: string | null
        is_required: boolean
        is_mapped: boolean
        is_meta_field: boolean
        is_blocking: boolean
        min_length: number | null
        max_length: number | null
        validation_pattern: string | null
        validation_message: string | null
        options: Array<{ label: string; value: string }> | null
        show_when: unknown
        required_condition: unknown
        section_id: string | null
      }>
    },

    async getCompositeRules(
      formId: string,
      tenantId: string
    ): Promise<CompositeValidationRule[]> {
      // Fetch rules that apply to this specific form OR are global (form_id IS NULL)
      const { data, error } = await supabase
        .from('composite_validation_rules' as never)
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`form_id.eq.${formId},form_id.is.null`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(
          `Failed to get composite rules for form ${formId}: ${error.message}`
        )
      }

      return (data ?? []) as unknown as CompositeValidationRule[]
    },

    async getMatterInstances(
      matterId: string
    ): Promise<
      Array<{
        id: string
        form_id: string
        person_id: string | null
        answers: AnswerMap
      }>
    > {
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('id, form_id, person_id, answers')
        .eq('matter_id', matterId)
        .eq('is_active', true)

      if (error) {
        throw new Error(
          `Failed to get matter instances for matter ${matterId}: ${error.message}`
        )
      }

      return (
        (data ?? []) as unknown as Array<{
          id: string
          form_id: string
          person_id: string | null
          answers: AnswerMap | null
        }>
      ).map((row) => ({
        ...row,
        answers: row.answers ?? {},
      }))
    },
  }
}
