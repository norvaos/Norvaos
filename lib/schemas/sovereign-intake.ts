import { z } from 'zod/v4'

/**
 * Step 1: Conflict Search  -  just name fields
 */
export const conflictSearchSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
})

export type ConflictSearchValues = z.infer<typeof conflictSearchSchema>

/**
 * Step 2: Contact Details  -  minimal collection
 */
export const contactDetailsSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email_primary: z.email('Invalid email address').optional().or(z.literal('')),
  phone_primary: z.string().max(30).optional().or(z.literal('')),
  source: z.string().max(100).optional(),
})

export type ContactDetailsValues = z.infer<typeof contactDetailsSchema>

/**
 * Full intake state passed between steps
 */
export const intakeStateSchema = z.object({
  conflictCleared: z.boolean(),
  conflictScanId: z.string().nullable(),
  conflictSearchedAt: z.string().nullable(),
  contactId: z.string().nullable(),
  leadId: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
})

export type IntakeState = z.infer<typeof intakeStateSchema>

/**
 * Default initial state for the stepper
 */
export const DEFAULT_INTAKE_STATE: IntakeState = {
  conflictCleared: false,
  conflictScanId: null,
  conflictSearchedAt: null,
  contactId: null,
  leadId: null,
  firstName: '',
  lastName: '',
}
