import type { EntityAdapter } from '../types'

export const ghlTagsAdapter: EntityAdapter = {
  entityType: 'tags',
  targetTable: 'tags',
  displayName: 'Tags',
  sourceDisplayName: 'GHL Tags',
  description: 'Import tags from Go High Level for categorising contacts and entities.',
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'name',
      required: true,
      aliases: ['Name', 'tag', 'Tag', 'label', 'Label'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.name) {
      errors.push('Tag name is required.')
    }
    return errors
  },
}
