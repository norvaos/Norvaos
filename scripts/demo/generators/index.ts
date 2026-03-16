/**
 * Demo Data Generator — Central Entry Point
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 *
 * Exports all individual generators and a convenience function that
 * produces a complete, linked demo dataset in a single call.
 */

export { generateFakeContacts } from './fake-contacts'
export { generateFakeMatters } from './fake-matters'
export { generateFakeTasks } from './fake-tasks'
export { generateFakeCalendarEvents } from './fake-calendar-events'
export { generateFakeTimeEntries } from './fake-time-entries'

export interface DemoDataset {
  contacts: ReturnType<typeof import('./fake-contacts').generateFakeContacts>
  matters: ReturnType<typeof import('./fake-matters').generateFakeMatters>
  tasks: ReturnType<typeof import('./fake-tasks').generateFakeTasks>
  calendarEvents: ReturnType<typeof import('./fake-calendar-events').generateFakeCalendarEvents>
  timeEntries: ReturnType<typeof import('./fake-time-entries').generateFakeTimeEntries>
}

/**
 * Generate a complete linked demo dataset for a single tenant.
 *
 * Contacts → Matters (linked by contact IDs) → Tasks, Calendar Events,
 * Time Entries (linked by matter IDs).
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 */
export async function generateFullDemoDataset(tenantId: string): Promise<DemoDataset> {
  const { generateFakeContacts } = await import('./fake-contacts')
  const { generateFakeMatters } = await import('./fake-matters')
  const { generateFakeTasks } = await import('./fake-tasks')
  const { generateFakeCalendarEvents } = await import('./fake-calendar-events')
  const { generateFakeTimeEntries } = await import('./fake-time-entries')

  const contacts = generateFakeContacts(tenantId)
  const contactIds = contacts.map((c) => c.id as string)

  const matters = generateFakeMatters(tenantId, contactIds)
  const matterIds = matters.map((m) => m.id as string)

  const tasks = generateFakeTasks(tenantId, matterIds)
  const calendarEvents = generateFakeCalendarEvents(tenantId, matterIds)
  const timeEntries = generateFakeTimeEntries(tenantId, matterIds)

  return { contacts, matters, tasks, calendarEvents, timeEntries }
}
