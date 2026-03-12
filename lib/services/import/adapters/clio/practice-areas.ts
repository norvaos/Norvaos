import type { EntityAdapter } from '../types'

export const clioPracticeAreasAdapter: EntityAdapter = {
  entityType: 'tags',
  targetTable: 'practice_areas',
  displayName: 'Practice Areas',
  sourceDisplayName: 'Clio Practice Areas',
  description: 'Import practice areas from Clio for matter categorisation.',
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
      aliases: ['Name', 'practice_area', 'Practice Area'],
    },
    {
      sourceColumn: 'code',
      targetColumn: 'code',
      required: false,
      aliases: ['Code'],
    },
    {
      sourceColumn: 'category',
      targetColumn: 'category',
      required: false,
      aliases: ['Category'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.name) {
      errors.push('Practice area name is required.')
    }
    return errors
  },
}
