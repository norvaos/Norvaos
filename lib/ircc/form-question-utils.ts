/**
 * @deprecated — LEGACY Form Question Utilities.
 *
 * This file reads from the deprecated FORM_REGISTRY (form-field-registry.ts),
 * which now returns empty data. All form metadata should be fetched from the
 * DB (ircc_forms / ircc_form_sections / ircc_form_fields) instead.
 *
 * Do not add new call-sites — migrate existing consumers to the DB path.
 */

import { FORM_REGISTRY } from '@/lib/ircc/form-field-registry'
import type { IRCCFormSection } from '@/lib/types/ircc-profile'

/**
 * @deprecated Use DB-driven form data instead.
 * Check if a form code has question definitions in FORM_REGISTRY.
 */
export function hasQuestionDefinitions(formCode: string): boolean {
  return formCode in FORM_REGISTRY
}

/**
 * Get question stats for a form code.
 * Returns null if form code has no questions defined.
 */
export function getFormQuestionStats(formCode: string): {
  sectionCount: number
  fieldCount: number
  sections: IRCCFormSection[]
} | null {
  const sections = FORM_REGISTRY[formCode]
  if (!sections || sections.length === 0) return null

  const fieldCount = sections.reduce((sum, s) => sum + s.fields.length, 0)
  return { sectionCount: sections.length, fieldCount, sections }
}

/**
 * Given a list of form codes, return those that have question definitions.
 */
export function filterCodesWithQuestions(formCodes: string[]): string[] {
  return formCodes.filter((code) => code in FORM_REGISTRY)
}
