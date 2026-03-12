import type { EntityAdapter } from '../types'

export const clioRelationshipsAdapter: EntityAdapter = {
  entityType: 'companies',
  targetTable: 'matter_people',
  displayName: 'Relationships',
  sourceDisplayName: 'Clio Relationships',
  description: 'Import matter relationships (roles on matters) from Clio.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'description',
      targetColumn: 'role',
      required: false,
      aliases: ['Description', 'role', 'Role'],
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Contact ID'],
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter_id', 'Matter ID'],
    },
  ],
}
