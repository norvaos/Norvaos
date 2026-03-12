import type { EntityAdapter } from '../types'

export const clioCustomFieldsAdapter: EntityAdapter = {
  entityType: 'custom_fields',
  targetTable: 'custom_field_definitions',
  displayName: 'Custom Fields',
  sourceDisplayName: 'Clio Custom Fields',
  description: 'Import custom field definitions from Clio.',
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
      sourceColumn: 'fieldType',
      targetColumn: 'field_type',
      required: false,
      aliases: ['field_type', 'Type', 'type'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'text_line') return 'text'
        if (lower === 'text_area') return 'textarea'
        if (lower === 'numeric') return 'number'
        if (lower === 'date') return 'date'
        if (lower === 'checkbox') return 'checkbox'
        if (lower === 'picklist' || lower === 'multi_picklist') return 'select'
        if (lower === 'url') return 'text'
        if (lower === 'email') return 'text'
        return 'text'
      },
      defaultValue: 'text',
    },
    {
      sourceColumn: 'parentType',
      targetColumn: 'entity_type',
      required: false,
      aliases: ['parent_type', 'Parent Type'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'contact') return 'contacts'
        if (lower === 'matter') return 'matters'
        return lower
      },
    },
    {
      sourceColumn: 'picklistOptions',
      targetColumn: 'options',
      required: false,
      aliases: ['picklist_options', 'Options'],
      transform: (val) => {
        if (!val) return null
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
