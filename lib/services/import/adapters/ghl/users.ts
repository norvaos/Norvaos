import type { EntityAdapter } from '../types'

export const ghlUsersAdapter: EntityAdapter = {
  entityType: 'users',
  targetTable: 'import_id_map',
  displayName: 'Team Members',
  sourceDisplayName: 'GHL Team Members',
  description: 'Import team member roster from Go High Level for assignment resolution during other imports.',
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: true,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'display_name',
      required: false,
      aliases: ['Name', 'full_name', 'Full Name'],
    },
    {
      sourceColumn: 'email',
      targetColumn: 'email',
      required: false,
      aliases: ['Email'],
    },
    {
      sourceColumn: 'role',
      targetColumn: 'role',
      required: false,
      aliases: ['Role'],
    },
  ],
}
