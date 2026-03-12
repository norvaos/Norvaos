import type { FieldCondition } from '@/lib/types/intake-field'
import type { PortalLocale } from '@/lib/utils/portal-translations'

/**
 * A single configurable kiosk check-in question.
 *
 * Stored in `tenants.settings.kiosk_config.kiosk_questions` (JSONB array).
 * Answers are stored in `check_in_sessions.metadata.answers` keyed by `id`.
 *
 * Supports conditional visibility via `FieldCondition` (reused from intake forms)
 * and per-locale translations for multi-language kiosks.
 */
export interface KioskQuestion {
  id: string
  field_type: 'select' | 'multi_select' | 'text' | 'textarea' | 'boolean'
  label: string
  description?: string
  placeholder?: string
  is_required: boolean
  options?: { label: string; value: string }[]
  sort_order: number
  condition?: FieldCondition

  /** Per-locale overrides for client-facing strings */
  translations?: Partial<
    Record<
      PortalLocale,
      {
        label?: string
        description?: string
        placeholder?: string
        options?: { label: string; value: string }[]
      }
    >
  >
}

/**
 * Info about the staff member associated with a returning client or lead.
 * Returned by the complete API after check-in finishes (Rule #8 safe).
 */
export interface ReturningInfo {
  /** 'client' = has responsible_lawyer, 'lead' = has assigned_to, 'appointment' = fallback to appointment owner */
  type: 'client' | 'lead' | 'appointment'
  staffName: string
  staffAvatarUrl: string | null
}
