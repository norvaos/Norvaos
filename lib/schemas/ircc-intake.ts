/**
 * IRCC Intake Validation Schemas  -  Zod v4
 *
 * Validates client-submitted intake data to prevent:
 * - XSS injection via HTML tags in text fields
 * - Oversized values exceeding max_length
 * - Invalid field types (string for number, etc.)
 * - Arbitrary profile paths not in the form definition
 */

import { z } from 'zod'

// ── Sanitised string (strips HTML tags) ──────────────────────────────────────

const sanitisedString = z.string().transform((val) =>
  val.replace(/<[^>]*>/g, '').trim(),
)

// ── Intake answer update schema ─────────────────────────────────────────────

export const intakeAnswerUpdateSchema = z.object({
  updates: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_.]*$/i, 'Invalid profile path format'),
      z.union([
        sanitisedString,
        z.number(),
        z.boolean(),
        z.null(),
        z.array(z.unknown()),
      ]),
    )
    .refine(
      (updates) => Object.keys(updates).length > 0,
      'At least one field update is required',
    )
    .refine(
      (updates) => Object.keys(updates).length <= 50,
      'Maximum 50 field updates per save',
    ),
})

// ── Profile path validation (allowed domains) ───────────────────────────────

const ALLOWED_DOMAINS = new Set([
  'personal',
  'passport',
  'marital',
  'contact_info',
  'language',
  'background',
  'family',
  'education',
  'employment',
  'visit',
  'study_program',
  'travel_doc',
  'sponsor',
  'work_permit',
  'schedule1',
  'family_info',
])

export function validateProfilePaths(
  updates: Record<string, unknown>,
): { valid: boolean; invalidPaths: string[] } {
  const invalidPaths: string[] = []

  for (const key of Object.keys(updates)) {
    const domain = key.split('.')[0]
    if (!ALLOWED_DOMAINS.has(domain)) {
      invalidPaths.push(key)
    }
  }

  return {
    valid: invalidPaths.length === 0,
    invalidPaths,
  }
}

// ── Max length enforcement ──────────────────────────────────────────────────

export function enforceMaxLengths(
  updates: Record<string, unknown>,
  fieldMaxLengths: Map<string, number>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(updates)) {
    const maxLen = fieldMaxLengths.get(key)
    if (maxLen && typeof value === 'string' && value.length > maxLen) {
      result[key] = value.slice(0, maxLen)
    } else {
      result[key] = value
    }
  }

  return result
}

export type IntakeAnswerUpdate = z.infer<typeof intakeAnswerUpdateSchema>
