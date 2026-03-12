/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Form Instance Engine — Type Definitions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Types for the form assignment template → matter form instance pipeline.
 * Maps to tables created in migration 074-form-assignment-engine.sql.
 */

import type { SlotConditions } from '@/lib/services/document-slot-engine'

// ── Assignment Template ─────────────────────────────────────────────────────

export type AssignmentTemplateStatus = 'draft' | 'published' | 'archived'

export interface FormAssignmentTemplate {
  id: string
  tenant_id: string
  matter_type_id: string | null
  case_type_id: string | null
  form_id: string
  sort_order: number
  is_required: boolean
  person_role_scope: string | null
  conditions: SlotConditions | null
  version: number
  status: AssignmentTemplateStatus
  effective_date: string | null
  published_at: string | null
  published_by: string | null
  archived_at: string | null
  archived_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FormAssignmentTemplateInsert {
  tenant_id: string
  form_id: string
  matter_type_id?: string | null
  case_type_id?: string | null
  sort_order?: number
  is_required?: boolean
  person_role_scope?: string | null
  conditions?: SlotConditions | null
  version?: number
  status?: AssignmentTemplateStatus
  effective_date?: string | null
}

// ── Matter Form Instance ────────────────────────────────────────────────────

export type FormInstanceStatus =
  | 'pending'
  | 'in_progress'
  | 'ready_for_review'
  | 'approved'
  | 'rejected'
  | 'generated'
  | 'submitted'

export interface MatterFormInstance {
  id: string
  tenant_id: string
  matter_id: string
  person_id: string | null
  assignment_template_id: string | null
  form_id: string
  form_code: string
  form_name: string
  form_version_at_creation: number
  form_checksum_at_creation: string | null
  person_role: string | null
  sort_order: number
  is_required: boolean
  status: FormInstanceStatus
  is_active: boolean
  deactivated_at: string | null
  created_at: string
  updated_at: string
}

export interface MatterFormInstanceInsert {
  tenant_id: string
  matter_id: string
  form_id: string
  form_code: string
  form_name: string
  person_id?: string | null
  assignment_template_id?: string | null
  form_version_at_creation?: number
  form_checksum_at_creation?: string | null
  person_role?: string | null
  sort_order?: number
  is_required?: boolean
  status?: FormInstanceStatus
  is_active?: boolean
  deactivated_at?: string | null
}

// ── Template History ────────────────────────────────────────────────────────

export type TemplateHistoryAction =
  | 'created'
  | 'published'
  | 'archived'
  | 'conditions_updated'
  | 'moved'

export interface FormAssignmentTemplateHistory {
  id: string
  tenant_id: string
  template_id: string
  version: number
  action: TemplateHistoryAction
  previous_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
  changed_by: string | null
  change_reason: string | null
  created_at: string
}

// ── Engine Params ───────────────────────────────────────────────────────────

export interface GenerateFormInstancesParams {
  supabase: import('@supabase/supabase-js').SupabaseClient<import('./database').Database>
  tenantId: string
  matterId: string
  matterTypeId?: string | null
  caseTypeId?: string | null
}

export interface RegenerateFormInstancesResult {
  added: { formCode: string; personRole: string | null }[]
  removed: { formCode: string; personRole: string | null }[]
  reactivated: { formCode: string; personRole: string | null }[]
  unchanged: number
}

// ── Enriched types for UI ───────────────────────────────────────────────────

export interface FormAssignmentTemplateWithForm extends FormAssignmentTemplate {
  form: {
    id: string
    form_code: string
    form_name: string
    description: string | null
    current_version: number
    checksum_sha256: string
  }
}
