/**
 * Zod schemas for all workflow action inputs.
 * Server-side validation  -  these enforce Rule #3 and #12.
 */

import { z } from 'zod/v4'

// ─── Lead Actions ───────────────────────────────────────────────────────────

export const markContactedSchema = z.object({
  leadId: z.string().uuid(),
  callNotes: z.string().min(10, 'Call notes must be at least 10 characters'),
  outcome: z.enum(['connected', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'follow_up_needed']),
  nextFollowUp: z.string().datetime().optional(),
})

export const logCallSchema = z.object({
  leadId: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  outcome: z.enum(['connected', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'follow_up_needed']),
  durationMinutes: z.number().min(0).max(480).nullable(),
  notes: z.string().min(10, 'Call notes must be at least 10 characters'),
  contactPhone: z.string().optional(),
})

export const sendFollowUpSchema = z.object({
  leadId: z.string().uuid(),
  method: z.enum(['email', 'sms']),
  templateId: z.string().uuid().optional(),
  customMessage: z.string().min(10, 'Message must be at least 10 characters').optional(),
  subject: z.string().min(1).optional(),
})

export const markNoAnswerSchema = z.object({
  leadId: z.string().uuid(),
  notes: z.string().optional(),
})

// ─── Matter Actions ─────────────────────────────────────────────────────────

export const recordMeetingOutcomeSchema = z.object({
  matterId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  outcomeType: z.enum([
    'retainer_sent',
    'retainer_signed',
    'follow_up_required',
    'declined',
    'consultation_complete',
    'additional_docs_needed',
    'referred_out',
    'no_show',
  ]),
  outcomeData: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().optional(),
})

export const advanceMatterStageSchema = z.object({
  matterId: z.string().uuid(),
  targetStageId: z.string().uuid(),
})

// ─── Check-In Actions ───────────────────────────────────────────────────────

export const startCheckInSchema = z.object({
  kioskToken: z.string().min(1),
  searchQuery: z.string().optional(),
  searchType: z.enum(['name', 'email', 'phone']).optional(),
})

export const verifyIdentitySchema = z.object({
  sessionId: z.string().uuid(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
})

export const completeCheckInSchema = z.object({
  sessionId: z.string().uuid(),
  dataSafetyAcknowledged: z.literal(true, { message: 'Data safety notice must be acknowledged' }),
})

// ─── Front Desk Actions ────────────────────────────────────────────────────

export const frontDeskNoteSchema = z.object({
  entityType: z.enum(['appointment', 'contact', 'check_in']),
  entityId: z.string().uuid(),
  note: z.string().min(5, 'Note must be at least 5 characters').max(500),
})

export const frontDeskLogCallSchema = z.object({
  contactId: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  outcome: z.enum(['connected', 'no_answer', 'voicemail', 'busy', 'wrong_number']),
  durationMinutes: z.number().min(0).max(480).nullable().optional(),
  // notes is optional  -  Quick Call buttons log outcomes in one click with no note
  notes: z.string().max(1000).optional().or(z.literal('')),
})

export const frontDeskLogEmailSchema = z.object({
  contactId: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  subject: z.string().min(1, 'Subject is required').max(200),
  notes: z.string().max(1000).optional().or(z.literal('')),
})

export const frontDeskLogMeetingSchema = z.object({
  contactId: z.string().uuid(),
  meetingType: z.enum(['in_person', 'video', 'phone']),
  durationMinutes: z.number().min(0).max(480).nullable().optional(),
  attendees: z.string().max(500).optional(),
  matterId: z.string().uuid().optional(),
  notes: z.string().min(1, 'Notes are required').max(1000),
})

export const frontDeskCompleteTaskSchema = z.object({
  taskId: z.string().uuid(),
  outcomeCode: z.enum(['completed', 'left_voicemail', 'client_will_call_back', 'escalated']),
  notes: z.string().optional(),
  spawnNextTaskTemplateId: z.string().uuid().optional(),
})

export const frontDeskCreateIntakeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email().optional().or(z.literal('')),
  preferredContactMethod: z.enum(['phone', 'email', 'text']).default('phone'),
  language: z.string().default('English'),
  source: z.string().optional(),
  appointmentRequested: z.boolean().default(false),
  entityType: z.enum(['lead', 'contact']),
  practiceAreaId: z.string().uuid().optional(),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  reason: z.string().optional().default(''),
  screeningAnswers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})

export const frontDeskBookAppointmentSchema = z.object({
  contactId: z.string().uuid(),
  staffUserId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  durationMinutes: z.number().min(15).max(480).default(60),
  appointmentTypeId: z.string().uuid().optional(),
  matterId: z.string().uuid().optional(),
  room: z.string().optional(),
  intakeLinkRequested: z.boolean().default(false),
  notes: z.string().optional(),
})

export const frontDeskRescheduleSchema = z.object({
  appointmentId: z.string().uuid(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  reason: z.string().min(5, 'Reason is required'),
})

export const frontDeskCancelNoShowSchema = z.object({
  appointmentId: z.string().uuid(),
  action: z.enum(['cancel', 'no_show']),
  reason: z.string().min(5, 'Reason is required'),
})

export const frontDeskUploadDocumentSchema = z.object({
  contactId: z.string().uuid(),
  documentType: z.string().min(1, 'Document type is required'),
  fileName: z.string().min(1, 'File name is required'),
  storagePath: z.string().min(1, 'Storage path is required'),
  storageBucket: z.string().optional(),
  fileSize: z.number().min(0).optional(),
  matterId: z.string().uuid().optional(),
})

export const frontDeskCreateTaskSchema = z.object({
  contactId: z.string().uuid().optional(),
  matterId: z.string().uuid().optional(),
  title: z.string().min(5, 'Title must be at least 5 characters'),
  assignToUserId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
})

export const frontDeskRequestContactEditSchema = z.object({
  contactId: z.string().uuid(),
  requestedChanges: z.string().min(10, 'Describe the requested changes'),
  fieldToEdit: z.enum(['phone', 'email', 'name', 'address', 'other']),
})

export const frontDeskNotifyStaffSchema = z.object({
  recipientUserId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  checkInSessionId: z.string().uuid().optional(),
  message: z.string().min(5, 'Message must be at least 5 characters').max(200),
})

export const frontDeskCheckInSchema = z.object({
  appointmentId: z.string().uuid(),
  method: z.enum(['kiosk', 'receptionist']),
  notes: z.string().optional(),
})

export const lawyerAcknowledgeCheckInSchema = z.object({
  appointmentId: z.string().uuid(),
})

// ─── IRCC Form Pack Actions ────────────────────────────────────────────────

export const generateFormPackSchema = z.object({
  matterId: z.string().uuid(),
  packType: z.enum(['IMM5406', 'IMM5476E', 'IMM5257E']),
})

export const approveFormPackSchema = z.object({
  matterId: z.string().uuid(),
  packVersionId: z.string().uuid(),
})

export const exportFormPackSchema = z.object({
  matterId: z.string().uuid(),
  packVersionId: z.string().uuid(),
})

export const logFormAccessSchema = z.object({
  artifactId: z.string().uuid(),
  matterId: z.string().uuid(),
  accessType: z.enum(['view', 'download', 'print']),
})

// ─── Type Exports ───────────────────────────────────────────────────────────

export type MarkContactedInput = z.infer<typeof markContactedSchema>
export type LogCallInput = z.infer<typeof logCallSchema>
export type SendFollowUpInput = z.infer<typeof sendFollowUpSchema>
export type MarkNoAnswerInput = z.infer<typeof markNoAnswerSchema>
export type RecordMeetingOutcomeInput = z.infer<typeof recordMeetingOutcomeSchema>
export type AdvanceMatterStageInput = z.infer<typeof advanceMatterStageSchema>
export type StartCheckInInput = z.infer<typeof startCheckInSchema>
export type VerifyIdentityInput = z.infer<typeof verifyIdentitySchema>
export type CompleteCheckInInput = z.infer<typeof completeCheckInSchema>

// Front Desk
export type FrontDeskNoteInput = z.infer<typeof frontDeskNoteSchema>
export type FrontDeskCompleteTaskInput = z.infer<typeof frontDeskCompleteTaskSchema>
export type FrontDeskCreateIntakeInput = z.infer<typeof frontDeskCreateIntakeSchema>
export type FrontDeskBookAppointmentInput = z.infer<typeof frontDeskBookAppointmentSchema>
export type FrontDeskRescheduleInput = z.infer<typeof frontDeskRescheduleSchema>
export type FrontDeskCancelNoShowInput = z.infer<typeof frontDeskCancelNoShowSchema>
export type FrontDeskUploadDocumentInput = z.infer<typeof frontDeskUploadDocumentSchema>
export type FrontDeskCreateTaskInput = z.infer<typeof frontDeskCreateTaskSchema>
export type FrontDeskRequestContactEditInput = z.infer<typeof frontDeskRequestContactEditSchema>
export type FrontDeskNotifyStaffInput = z.infer<typeof frontDeskNotifyStaffSchema>
export type FrontDeskCheckInInput = z.infer<typeof frontDeskCheckInSchema>
export type LawyerAcknowledgeCheckInInput = z.infer<typeof lawyerAcknowledgeCheckInSchema>
export type FrontDeskLogCallInput = z.infer<typeof frontDeskLogCallSchema>
export type FrontDeskLogEmailInput = z.infer<typeof frontDeskLogEmailSchema>
export type FrontDeskLogMeetingInput = z.infer<typeof frontDeskLogMeetingSchema>

// ─── Front Desk Shift Actions ──────────────────────────────────────────────

export const frontDeskStartShiftSchema = z.object({})

export const frontDeskEndShiftSchema = z.object({
  reason: z.enum(['manual', 'auto_12h', 'admin_force', 'session_expired']).default('manual'),
})

export type FrontDeskStartShiftInput = z.infer<typeof frontDeskStartShiftSchema>
export type FrontDeskEndShiftInput = z.infer<typeof frontDeskEndShiftSchema>

// IRCC Form Packs
export type GenerateFormPackInput = z.infer<typeof generateFormPackSchema>
export type ApproveFormPackInput = z.infer<typeof approveFormPackSchema>
export type ExportFormPackInput = z.infer<typeof exportFormPackSchema>
export type LogFormAccessInput = z.infer<typeof logFormAccessSchema>
