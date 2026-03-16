// ALL DATA IS SYNTHETIC — NOT REAL CLIENT DATA

const EVENT_TEMPLATES = [
  { title: 'Initial Consultation — Immigration Matter', type: 'consultation', duration: 60 },
  { title: 'IRCC Biometrics Appointment', type: 'appointment', duration: 30 },
  { title: 'Refugee Board Hearing', type: 'hearing', duration: 120 },
  { title: 'Document Review Meeting', type: 'meeting', duration: 45 },
  { title: 'Application Filing Deadline', type: 'deadline', duration: 0 },
  { title: 'Family Court Hearing — Custody', type: 'hearing', duration: 90 },
  { title: 'Settlement Conference', type: 'meeting', duration: 120 },
  { title: 'Medical Exam Appointment', type: 'appointment', duration: 60 },
  { title: 'Client Debrief — Post-Decision', type: 'meeting', duration: 30 },
  { title: 'Spousal Sponsorship Interview', type: 'interview', duration: 60 },
]

import { randomUUID } from 'crypto'

const LOCATIONS = [
  'Toronto Immigration Office, 55 St. Clair Ave E',
  'Video Conference (Zoom)',
  'Ontario Superior Court of Justice, 361 University Ave',
  'Client Office',
]

export interface FakeCalendarEvent {
  id: string
  tenant_id: string
  matter_id: string
  title: string
  description: string
  event_type: string
  start_time: string // ISO
  end_time: string // ISO
  location: string | null
  is_all_day: boolean
}

export function generateFakeCalendarEvents(
  tenantId: string,
  matterIds: string[],
  count = 10,
): FakeCalendarEvent[] {
  const events: FakeCalendarEvent[] = []

  for (let i = 0; i < count; i++) {
    const template = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length]
    const daysFromNow = 3 + i * 6 // spread across next 60 days
    const startDate = new Date(Date.now() + daysFromNow * 86_400_000)
    startDate.setHours(9 + (i % 8), 0, 0, 0)

    const endDate = new Date(startDate.getTime() + template.duration * 60_000)
    const isAllDay = template.type === 'deadline'

    events.push({
      id: randomUUID(),
      tenant_id: tenantId,
      matter_id: matterIds[i % matterIds.length],
      title: template.title,
      description: `Demo calendar event ${i + 1} — synthetic data for demonstration purposes only.`,
      event_type: template.type,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      location: isAllDay ? null : LOCATIONS[i % LOCATIONS.length],
      is_all_day: isAllDay,
    })
  }

  return events
}
