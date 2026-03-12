import type { EntityAdapter } from '../types'

export const ghlCustomFieldsAdapter: EntityAdapter = {
  entityType: 'custom_fields',
  targetTable: 'custom_field_definitions',
  displayName: 'Custom Fields',
  sourceDisplayName: 'GHL Custom Fields',
  description: 'Import custom field definitions from Go High Level.',
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'label',
      required: true,
      aliases: ['Name', 'label', 'Label', 'field_name'],
    },
    {
      sourceColumn: 'fieldKey',
      targetColumn: 'field_key',
      required: false,
      aliases: ['field_key', 'key', 'Key'],
    },
    {
      sourceColumn: 'dataType',
      targetColumn: 'field_type',
      required: false,
      aliases: ['data_type', 'type', 'Type'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'text' || lower === 'single_line') return 'text'
        if (lower === 'large_text' || lower === 'multi_line') return 'textarea'
        if (lower === 'number' || lower === 'numerical') return 'number'
        if (lower === 'date') return 'date'
        if (lower === 'checkbox') return 'checkbox'
        if (lower.includes('select') || lower.includes('list') || lower.includes('dropdown')) return 'select'
        return 'text'
      },
      defaultValue: 'text',
    },
    {
      sourceColumn: 'picklistOptions',
      targetColumn: 'options',
      required: false,
      aliases: ['options', 'Options', 'choices'],
      transform: (val) => {
        if (!val) return null
        // Convert comma-separated string to JSON array
        const opts = val.split(',').map((s: string) => s.trim()).filter(Boolean)
        return opts.length > 0 ? JSON.stringify(opts) : null
      },
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.label) {
      errors.push('Custom field name/label is required.')
    }
    return errors
  },
}
