import {
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Activity,
  PhoneIncoming,
  PhoneOutgoing,
  MailPlus,
  CalendarPlus,
  MessageSquarePlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Interaction Group Definitions ──────────────────────────────────
// Each group aggregates related activity_type values for the grouped timeline

export interface InteractionGroup {
  key: string
  label: string
  icon: LucideIcon
  activityTypes: string[]
  color: string          // tailwind color name (blue, purple, green, amber, slate)
  bgClass: string        // icon bg + text color classes
}

export const INTERACTION_GROUPS: InteractionGroup[] = [
  {
    key: 'phone_calls',
    label: 'Phone Calls',
    icon: Phone,
    activityTypes: ['phone_inbound', 'phone_outbound', 'phone_call'],
    color: 'blue',
    bgClass: 'bg-blue-50 text-blue-600',
  },
  {
    key: 'emails',
    label: 'Emails',
    icon: Mail,
    activityTypes: ['email_sent', 'email_received'],
    color: 'purple',
    bgClass: 'bg-purple-50 text-purple-600',
  },
  {
    key: 'meetings',
    label: 'Meetings',
    icon: Calendar,
    activityTypes: [
      'meeting', 'consultation', 'booking_created', 'booking_rescheduled',
      'appointment_started', 'appointment_checked_in', 'appointment_completed',
    ],
    color: 'green',
    bgClass: 'bg-green-50 text-green-600',
  },
  {
    key: 'sms',
    label: 'SMS',
    icon: MessageSquare,
    activityTypes: ['sms_sent', 'sms_received'],
    color: 'amber',
    bgClass: 'bg-amber-50 text-amber-600',
  },
  {
    key: 'other',
    label: 'Other Interactions',
    icon: Activity,
    activityTypes: [
      'note_added', 'form_submission', 'portal_questionnaire_submitted',
      'portal_ircc_questionnaire_completed', 'portal_upload', 'portal_slot_upload',
      'document_request_sent', 'matter_created', 'lead_converted',
    ],
    color: 'slate',
    bgClass: 'bg-slate-50 text-slate-600',
  },
]

// ─── Quick Action Button Config ─────────────────────────────────────

export type DialogType = 'call' | 'email' | 'meeting' | 'sms'

export interface QuickAction {
  key: string
  label: string
  icon: LucideIcon
  dialog: DialogType
  defaultDirection?: 'inbound' | 'outbound' | 'sent' | 'received'
  color: string       // button border/text color classes
}

export const INTERACTION_QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'phone_inbound',
    label: 'Inbound Call',
    icon: PhoneIncoming,
    dialog: 'call',
    defaultDirection: 'inbound',
    color: 'text-green-600 border-green-200 hover:bg-green-50',
  },
  {
    key: 'phone_outbound',
    label: 'Outbound Call',
    icon: PhoneOutgoing,
    dialog: 'call',
    defaultDirection: 'outbound',
    color: 'text-blue-600 border-blue-200 hover:bg-blue-50',
  },
  {
    key: 'email_sent',
    label: 'Email',
    icon: MailPlus,
    dialog: 'email',
    defaultDirection: 'sent',
    color: 'text-purple-600 border-purple-200 hover:bg-purple-50',
  },
  {
    key: 'meeting',
    label: 'Meeting',
    icon: CalendarPlus,
    dialog: 'meeting',
    color: 'text-green-600 border-green-200 hover:bg-green-50',
  },
  {
    key: 'sms_sent',
    label: 'SMS',
    icon: MessageSquarePlus,
    dialog: 'sms',
    defaultDirection: 'sent',
    color: 'text-amber-600 border-amber-200 hover:bg-amber-50',
  },
]

// ─── Flat list of all interaction activity types ────────────────────

export const ALL_INTERACTION_TYPES = INTERACTION_GROUPS.flatMap((g) => g.activityTypes)

// ─── Activity type → display info helpers ───────────────────────────

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  phone_inbound: 'Inbound Call',
  phone_outbound: 'Outbound Call',
  phone_call: 'Phone Call',
  email_sent: 'Email Sent',
  email_received: 'Email Received',
  sms_sent: 'SMS Sent',
  sms_received: 'SMS Received',
  meeting: 'Meeting',
  consultation: 'Consultation',
  booking_created: 'Booking Created',
  booking_rescheduled: 'Booking Rescheduled',
  appointment_started: 'Appointment Started',
  appointment_checked_in: 'Check-In',
  appointment_completed: 'Appointment Completed',
  note_added: 'Note Added',
  form_submission: 'Form Submission',
  portal_questionnaire_submitted: 'Questionnaire Submitted',
  portal_ircc_questionnaire_completed: 'IRCC Questionnaire',
  portal_upload: 'Portal Upload',
  portal_slot_upload: 'Slot Upload',
  document_request_sent: 'Document Request',
  matter_created: 'Matter Created',
  lead_converted: 'Lead Converted',
}

export function getActivityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
