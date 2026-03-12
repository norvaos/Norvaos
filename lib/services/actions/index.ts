/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Action Registry — Single Source of Truth for All Workflow Actions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every action that can change state must be registered here.
 * Rule #1: No direct state changes outside the Action Executor.
 *
 * Usage:
 *   import { getAction, getAllActions } from '@/lib/services/actions'
 *   const def = getAction('mark_contacted')
 */

import type { ActionDefinition } from './types'

// ─── Lead Actions ───────────────────────────────────────────────────────────
import { markContactedAction } from './lead/mark-contacted'
import { logCallAction } from './lead/log-call'
import { sendFollowUpAction } from './lead/send-follow-up'
import { markNoAnswerAction } from './lead/mark-no-answer'

// ─── Matter Actions ─────────────────────────────────────────────────────────
import { recordMeetingOutcomeAction } from './matter/record-meeting-outcome'
import { advanceStageAction } from './matter/advance-stage-action'

// ─── Check-In Actions ───────────────────────────────────────────────────────
import { startCheckInAction } from './checkin/start-session'
import { verifyIdentityAction } from './checkin/verify-identity'
import { completeCheckInAction } from './checkin/complete-checkin'

// ─── Front Desk Actions ────────────────────────────────────────────────────
import { frontDeskNoteAction } from './frontdesk/front-desk-note'
import { frontDeskCompleteTaskAction } from './frontdesk/front-desk-complete-task'
import { frontDeskCreateIntakeAction } from './frontdesk/front-desk-create-intake'
import { frontDeskBookAppointmentAction } from './frontdesk/front-desk-book-appointment'
import { frontDeskRescheduleAction } from './frontdesk/front-desk-reschedule'
import { frontDeskCancelNoShowAction } from './frontdesk/front-desk-cancel-no-show'
import { frontDeskUploadDocumentAction } from './frontdesk/front-desk-upload-document'
import { frontDeskCreateTaskAction } from './frontdesk/front-desk-create-task'
import { frontDeskRequestContactEditAction } from './frontdesk/front-desk-request-edit'
import { frontDeskNotifyStaffAction } from './frontdesk/front-desk-notify-staff'
import { frontDeskCheckInAction } from './frontdesk/front-desk-check-in'
import { lawyerAcknowledgeCheckInAction } from './frontdesk/lawyer-acknowledge-checkin'
import { frontDeskLogCallAction } from './frontdesk/front-desk-log-call'
import { frontDeskLogEmailAction } from './frontdesk/front-desk-log-email'
import { frontDeskLogMeetingAction } from './frontdesk/front-desk-log-meeting'
import { frontDeskStartShiftAction } from './frontdesk/front-desk-start-shift'
import { frontDeskEndShiftAction } from './frontdesk/front-desk-end-shift'

// ─── IRCC Form Pack Actions ────────────────────────────────────────────────
import { generateFormPackAction } from './ircc/generate-form-pack'
import { approveFormPackAction } from './ircc/approve-form-pack'
import { exportFormPackAction } from './ircc/export-form-pack'
import { logFormAccessAction } from './ircc/log-form-access'

// ─── Registry ───────────────────────────────────────────────────────────────

const ACTION_REGISTRY: Record<string, ActionDefinition<unknown, unknown>> = {
  // Lead
  mark_contacted: markContactedAction as ActionDefinition<unknown, unknown>,
  log_call: logCallAction as ActionDefinition<unknown, unknown>,
  send_follow_up: sendFollowUpAction as ActionDefinition<unknown, unknown>,
  mark_no_answer: markNoAnswerAction as ActionDefinition<unknown, unknown>,

  // Matter
  record_meeting_outcome: recordMeetingOutcomeAction as ActionDefinition<unknown, unknown>,
  advance_matter_stage: advanceStageAction as ActionDefinition<unknown, unknown>,

  // Check-In (Kiosk)
  start_check_in: startCheckInAction as ActionDefinition<unknown, unknown>,
  verify_identity: verifyIdentityAction as ActionDefinition<unknown, unknown>,
  complete_check_in: completeCheckInAction as ActionDefinition<unknown, unknown>,

  // Front Desk
  front_desk_note: frontDeskNoteAction as ActionDefinition<unknown, unknown>,
  front_desk_complete_task: frontDeskCompleteTaskAction as ActionDefinition<unknown, unknown>,
  front_desk_create_intake: frontDeskCreateIntakeAction as ActionDefinition<unknown, unknown>,
  front_desk_book_appointment: frontDeskBookAppointmentAction as ActionDefinition<unknown, unknown>,
  front_desk_reschedule: frontDeskRescheduleAction as ActionDefinition<unknown, unknown>,
  front_desk_cancel_no_show: frontDeskCancelNoShowAction as ActionDefinition<unknown, unknown>,
  front_desk_upload_document: frontDeskUploadDocumentAction as ActionDefinition<unknown, unknown>,
  front_desk_create_task: frontDeskCreateTaskAction as ActionDefinition<unknown, unknown>,
  front_desk_request_contact_edit: frontDeskRequestContactEditAction as ActionDefinition<unknown, unknown>,
  front_desk_notify_staff: frontDeskNotifyStaffAction as ActionDefinition<unknown, unknown>,
  front_desk_check_in: frontDeskCheckInAction as ActionDefinition<unknown, unknown>,
  lawyer_acknowledge_checkin: lawyerAcknowledgeCheckInAction as ActionDefinition<unknown, unknown>,
  front_desk_log_call: frontDeskLogCallAction as ActionDefinition<unknown, unknown>,
  front_desk_log_email: frontDeskLogEmailAction as ActionDefinition<unknown, unknown>,
  front_desk_log_meeting: frontDeskLogMeetingAction as ActionDefinition<unknown, unknown>,

  // Front Desk Shifts
  front_desk_start_shift: frontDeskStartShiftAction as ActionDefinition<unknown, unknown>,
  front_desk_end_shift: frontDeskEndShiftAction as ActionDefinition<unknown, unknown>,

  // IRCC Form Packs
  generate_form_pack: generateFormPackAction as ActionDefinition<unknown, unknown>,
  approve_form_pack: approveFormPackAction as ActionDefinition<unknown, unknown>,
  export_form_pack: exportFormPackAction as ActionDefinition<unknown, unknown>,
  log_form_access: logFormAccessAction as ActionDefinition<unknown, unknown>,
}

/**
 * Get an action definition by its type key.
 * Returns undefined if not found.
 */
export function getAction(actionType: string): ActionDefinition<unknown, unknown> | undefined {
  return ACTION_REGISTRY[actionType]
}

/**
 * Get all registered action types.
 */
export function getAllActionTypes(): string[] {
  return Object.keys(ACTION_REGISTRY)
}

/**
 * Get all registered actions.
 */
export function getAllActions(): Record<string, ActionDefinition<unknown, unknown>> {
  return { ...ACTION_REGISTRY }
}

/**
 * Check if an action type is registered.
 */
export function isRegisteredAction(actionType: string): boolean {
  return actionType in ACTION_REGISTRY
}
