/**
 * Form Field Registry
 *
 * All form data is now managed via the DB (ircc_forms, ircc_form_sections,
 * ircc_form_fields tables). No forms or fields are hardcoded here.
 *
 * Legacy consumers (questionnaire-engine.ts, pdf-filler.ts, form-question-utils.ts)
 * will receive empty results until migrated to the DB-driven path.
 */

import type { IRCCFormSection } from '@/lib/types/ircc-profile'

export const FORM_REGISTRY: Record<string, IRCCFormSection[]> = {}

export const CASE_TYPE_FORM_MAP: Record<string, string[]> = {}

export function mergeFormFields(_formCodes: string[]): IRCCFormSection[] {
  return []
}
