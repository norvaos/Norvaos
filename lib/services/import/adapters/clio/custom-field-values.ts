import type { EntityAdapter } from '../types'

/**
 * Maps Clio custom field VALUES into matter_custom_data.
 *
 * Unlike custom-fields.ts (which imports field DEFINITIONS into custom_field_definitions),
 * this adapter imports the actual values that matters/contacts have for those fields.
 *
 * Clio structure: each matter has a list of custom_field_values, each with:
 *   { id, field_name, value, custom_field: { id, name, field_type } }
 *
 * Norva structure: matter_custom_data stores a single JSONB blob per matter:
 *   { data: { field_key: value, ... }, schema_version: 1, is_valid: true }
 *
 * This adapter produces one row per matter with all custom field values merged
 * into a single JSONB data column.
 *
 * Depends on: matters (need matter_id linkage), custom_fields (for field definitions)
 */
export const clioCustomFieldValuesAdapter: EntityAdapter = {
  entityType: 'forms', // reusing 'forms' slot for custom field values
  targetTable: 'matter_custom_data',
  displayName: 'Custom Field Values',
  sourceDisplayName: 'Clio Custom Field Values',
  description: 'Import custom field values from Clio matters into Norva matter custom data.',
  dependsOn: ['custom_fields', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: true,
      aliases: ['matter_id', 'Matter ID', 'Matter'],
    },
    {
      sourceColumn: 'matterTypeId',
      targetColumn: 'matter_type_id',
      required: false,
      aliases: ['matter_type_id', 'Matter Type ID'],
    },
    {
      sourceColumn: 'data',
      targetColumn: 'data',
      required: true,
      aliases: ['custom_fields', 'Custom Fields', 'fields'],
      transform: (val) => {
        // If already a JSON string, return as-is
        if (typeof val === 'string') {
          try {
            JSON.parse(val)
            return val
          } catch {
            return JSON.stringify({})
          }
        }
        return JSON.stringify(val ?? {})
      },
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.__matter_source_id && !row.matter_id) {
      errors.push('Matter ID is required for custom field value import.')
    }
    return errors
  },
  postProcess: (rows) => {
    // Ensure each row has schema_version and is_valid defaults
    return rows.map((row) => ({
      ...row,
      schema_version: 1,
      is_valid: true,
      validation_errors: null,
    }))
  },
}
