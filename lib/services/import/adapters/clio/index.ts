import type { PlatformAdapter, ImportEntityType } from '../types'
import { clioContactsAdapter } from './contacts'
import { clioMattersAdapter } from './matters'
import { clioTasksAdapter } from './tasks'
import { clioNotesAdapter } from './notes'
import { clioTimeEntriesAdapter } from './time-entries'
import { clioDocumentsAdapter } from './documents'
import { clioCalendarAdapter } from './calendar'
import { clioCommunicationsAdapter } from './communications'
import { clioBillsAdapter } from './bills'
import { clioCustomFieldsAdapter } from './custom-fields'
import { clioPracticeAreasAdapter } from './practice-areas'
import { clioRelationshipsAdapter } from './relationships'

export const clioAdapter: PlatformAdapter = {
  platform: 'clio',
  displayName: 'Clio',
  description: 'Import contacts, matters, tasks, notes, time entries, documents, calendar, communications, bills, and more from Clio.',
  entities: [
    // Import order: dependencies first
    clioPracticeAreasAdapter,
    clioCustomFieldsAdapter,
    clioContactsAdapter,
    clioMattersAdapter,
    clioRelationshipsAdapter,
    clioCalendarAdapter,
    clioTasksAdapter,
    clioNotesAdapter,
    clioCommunicationsAdapter,
    clioDocumentsAdapter,
    clioTimeEntriesAdapter,
    clioBillsAdapter,
  ],
  getEntityAdapter(entityType: ImportEntityType) {
    return this.entities.find((e) => e.entityType === entityType)
  },
}
