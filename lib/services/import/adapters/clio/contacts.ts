import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioContactsAdapter: EntityAdapter = {
  entityType: 'contacts',
  targetTable: 'contacts',
  displayName: 'Contacts',
  sourceDisplayName: 'Clio Contacts',
  description: 'Import contacts from Clio including individuals and organisations.',
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'Contact ID'],
    },
    {
      sourceColumn: 'Type',
      targetColumn: 'contact_type',
      required: false,
      aliases: ['type', 'Contact Type'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'company' || lower === 'organization' || lower === 'organisation') return 'organization'
        return 'individual'
      },
      defaultValue: 'individual',
    },
    {
      sourceColumn: 'First Name',
      targetColumn: 'first_name',
      required: false,
      aliases: ['firstName', 'first_name'],
    },
    {
      sourceColumn: 'Last Name',
      targetColumn: 'last_name',
      required: false,
      aliases: ['lastName', 'last_name'],
    },
    {
      sourceColumn: 'Middle Name',
      targetColumn: 'middle_name',
      required: false,
      aliases: ['middleName', 'middle_name'],
    },
    {
      sourceColumn: 'Company',
      targetColumn: 'organization_name',
      required: false,
      aliases: ['company', 'Organization', 'organisation', 'Company Name'],
    },
    {
      sourceColumn: 'Title',
      targetColumn: 'job_title',
      required: false,
      aliases: ['title', 'Job Title', 'job_title', 'Position'],
    },
    {
      sourceColumn: 'Email',
      targetColumn: 'email_primary',
      required: false,
      aliases: ['email', 'Primary Email', 'email_primary', 'Email Address'],
    },
    {
      sourceColumn: 'Phone',
      targetColumn: 'phone_primary',
      required: false,
      aliases: ['phone', 'Primary Phone', 'phone_primary', 'Phone Number'],
    },
    {
      sourceColumn: 'Street',
      targetColumn: 'address_line1',
      required: false,
      aliases: ['street', 'Address', 'address_line1', 'Street Address'],
    },
    {
      sourceColumn: 'City',
      targetColumn: 'city',
      required: false,
      aliases: ['city'],
    },
    {
      sourceColumn: 'Province',
      targetColumn: 'province_state',
      required: false,
      aliases: ['province', 'State', 'state', 'province_state'],
    },
    {
      sourceColumn: 'Postal Code',
      targetColumn: 'postal_code',
      required: false,
      aliases: ['postal_code', 'Zip', 'zip', 'ZIP Code'],
    },
    {
      sourceColumn: 'Country',
      targetColumn: 'country',
      required: false,
      aliases: ['country'],
      defaultValue: 'Canada',
    },
    {
      sourceColumn: 'Website',
      targetColumn: 'website',
      required: false,
      aliases: ['website', 'URL', 'url'],
    },
    {
      sourceColumn: 'Date of Birth',
      targetColumn: 'date_of_birth',
      required: false,
      aliases: ['date_of_birth', 'DOB', 'dob', 'Birthday'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'Created',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Created At', 'Date Created'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.first_name && !row.last_name && !row.email_primary && !row.organization_name) {
      errors.push('At least one of name, email, or organisation name is required.')
    }
    return errors
  },
}
