/**
 * @deprecated  -  LEGACY Form Field Registry.
 *
 * All form data is now managed via the DB (ircc_forms, ircc_form_sections,
 * ircc_form_fields tables). No forms or fields are hardcoded here.
 *
 * This file is retained only because 3 legacy consumers still import from it:
 *   - lib/ircc/questionnaire-engine.ts  (replaced by questionnaire-engine-db.ts)
 *   - lib/ircc/pdf-filler.ts            (replaced by xfa-filler-db-server.ts)
 *   - lib/ircc/form-question-utils.ts   (utility for this legacy registry)
 *
 * All exports return empty/no-op values. Runtime access will log a warning
 * so any remaining call-sites can be identified and removed.
 *
 * DO NOT add new code here. Use the DB-driven pipeline instead.
 */

import type { IRCCFormSection } from '@/lib/types/ircc-profile'

// ── Runtime throw guards ────────────────────────────────────────────────────

const _FORM_REGISTRY: Record<string, IRCCFormSection[]> = {}

/**
 * @deprecated Use DB-driven form data instead. Access logs a warning.
 */
export const FORM_REGISTRY: Record<string, IRCCFormSection[]> = new Proxy(
  _FORM_REGISTRY,
  {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop !== 'toJSON' && prop !== 'then') {
        console.warn(
          `[DEPRECATED] FORM_REGISTRY accessed with key "${prop}". ` +
            'Migrate to DB-driven ircc_form_fields. This export will be removed.',
        )
      }
      return Reflect.get(target, prop, receiver)
    },
  },
)

/**
 * @deprecated Use DB-driven form data instead. Access logs a warning.
 */
export const CASE_TYPE_FORM_MAP: Record<string, string[]> = {}

/**
 * @deprecated Use DB-driven form data instead. Calling this logs a warning.
 */
export function mergeFormFields(_formCodes: string[]): IRCCFormSection[] {
  console.warn(
    '[DEPRECATED] mergeFormFields() called. ' +
      'Migrate to DB-driven ircc_form_sections. This function will be removed.',
  )
  return []
}
