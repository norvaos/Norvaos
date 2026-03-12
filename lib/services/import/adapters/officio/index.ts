import type { PlatformAdapter, ImportEntityType } from '../types'
import { officioClientsAdapter } from './clients'
import { officioCasesAdapter } from './cases'
import { officioTasksAdapter } from './tasks'
import { officioNotesAdapter } from './notes'
import { officioDocumentsAdapter } from './documents'

export const officioAdapter: PlatformAdapter = {
  platform: 'officio',
  displayName: 'Officio',
  description: 'Import clients, cases, tasks, notes, and documents from Officio.',
  entities: [
    officioClientsAdapter,
    officioCasesAdapter,
    officioTasksAdapter,
    officioNotesAdapter,
    officioDocumentsAdapter,
  ],
  getEntityAdapter(entityType: ImportEntityType) {
    return this.entities.find((e) => e.entityType === entityType)
  },
}
