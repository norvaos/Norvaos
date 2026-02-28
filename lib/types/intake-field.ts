/**
 * Shared types for the intake forms system.
 * Used by the form builder, public renderer, and submission API.
 */

// ---------------------------------------------------------------------------
// Conditional visibility
// ---------------------------------------------------------------------------

export interface FieldCondition {
  /** The field whose value determines visibility */
  field_id: string
  /** Comparison operator */
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_truthy' | 'is_falsy'
  /** Value(s) to compare against. Not used for is_truthy / is_falsy. */
  value?: string | string[]
}

// ---------------------------------------------------------------------------
// Form sections (multi-step wizard)
// ---------------------------------------------------------------------------

export interface FormSection {
  id: string
  title: string
  description?: string
  sort_order: number
  /** If set, the section is only shown when this condition evaluates to true */
  condition?: FieldCondition
}

// ---------------------------------------------------------------------------
// Intake field definition (stored in JSONB `fields` column)
// ---------------------------------------------------------------------------

export interface IntakeField {
  id: string
  field_type:
    | 'text'
    | 'email'
    | 'phone'
    | 'textarea'
    | 'select'
    | 'multi_select'
    | 'number'
    | 'date'
    | 'boolean'
    | 'url'
    | 'file'
  label: string
  placeholder?: string
  description?: string
  is_required: boolean
  options?: { label: string; value: string }[]
  sort_order: number
  mapping?: string
  allow_other?: boolean
  accept?: string
  /** Which section this field belongs to (for multi-step forms) */
  section_id?: string
  /** If set, the field is only shown when this condition evaluates to true */
  condition?: FieldCondition
}

// ---------------------------------------------------------------------------
// Form-level settings (stored in JSONB `settings` column)
// ---------------------------------------------------------------------------

export interface IntakeFormSettings {
  success_message?: string
  redirect_url?: string
  /** Section definitions for multi-step wizard. If empty, form renders as single page. */
  sections?: FormSection[]
  /** Email address to notify when a new submission is received */
  notify_email?: string
  /** User ID to auto-assign created leads to */
  auto_assign_to?: string
}
