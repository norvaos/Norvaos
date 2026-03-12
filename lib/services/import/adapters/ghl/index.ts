import type { PlatformAdapter, ImportEntityType } from '../types'
import { ghlContactsAdapter } from './contacts'
import { ghlOpportunitiesAdapter } from './opportunities'
import { ghlPipelineStagesAdapter } from './pipeline-stages'
import { ghlTasksAdapter } from './tasks'
import { ghlNotesAdapter } from './notes'
import { ghlCalendarAdapter } from './calendar'
import { ghlConversationsAdapter } from './conversations'
import { ghlTagsAdapter } from './tags'
import { ghlCustomFieldsAdapter } from './custom-fields'
import { ghlInvoicesAdapter } from './invoices'
import { ghlCompaniesAdapter } from './companies'
import { ghlDocumentsAdapter } from './documents'
import { ghlFormsAdapter } from './forms'
import { ghlPaymentsAdapter } from './payments'
import { ghlSurveysAdapter } from './surveys'
import { ghlUsersAdapter } from './users'

export const ghlAdapter: PlatformAdapter = {
  platform: 'ghl',
  displayName: 'Go High Level',
  description: 'Import contacts, opportunities, calendar events, conversations, invoices, documents, and more from Go High Level.',
  entities: [
    // Import order: dependencies first
    ghlUsersAdapter,
    ghlTagsAdapter,
    ghlCustomFieldsAdapter,
    ghlContactsAdapter,
    ghlCompaniesAdapter,
    ghlPipelineStagesAdapter,
    ghlOpportunitiesAdapter,
    ghlCalendarAdapter,
    ghlTasksAdapter,
    ghlNotesAdapter,
    ghlConversationsAdapter,
    ghlDocumentsAdapter,
    ghlFormsAdapter,
    ghlSurveysAdapter,
    ghlInvoicesAdapter,
    ghlPaymentsAdapter,
  ],
  getEntityAdapter(entityType: ImportEntityType) {
    return this.entities.find((e) => e.entityType === entityType)
  },
}
