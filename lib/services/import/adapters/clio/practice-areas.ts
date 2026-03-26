import type { EntityAdapter } from '../types'

export const clioPracticeAreasAdapter: EntityAdapter = {
  entityType: 'tags',
  targetTable: 'practice_areas',
  displayName: 'Practice Areas',
  sourceDisplayName: 'Clio Practice Areas',
  description: 'Import practice areas from Clio for matter categorisation.',
  omitEngineFields: ['created_by'],
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
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.name) {
      errors.push('Practice area name is required.')
    }
    return errors
  },
}
