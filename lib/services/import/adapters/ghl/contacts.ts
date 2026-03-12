import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlContactsAdapter: EntityAdapter = {
  entityType: 'contacts',
  targetTable: 'contacts',
  displayName: 'Contacts',
  sourceDisplayName: 'GHL Contacts',
  description: 'Import contacts from Go High Level including names, emails, phones, and addresses.',
  fieldMappings: [
    {
      sourceColumn: 'id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'firstName',
      targetColumn: 'first_name',
      required: false,
      aliases: ['first_name', 'First Name', 'first name', 'First name'],
    },
    {
      sourceColumn: 'lastName',
      targetColumn: 'last_name',
      required: false,
      aliases: ['last_name', 'Last Name', 'last name', 'Last name'],
    },
    {
      sourceColumn: 'email',
      targetColumn: 'email_primary',
      required: false,
      aliases: ['Email', 'email_primary', 'primary_email', 'E-mail', 'emailAddress'],
    },
    {
      sourceColumn: 'phone',
      targetColumn: 'phone_primary',
      required: false,
      aliases: ['Phone', 'phone_primary', 'primary_phone', 'phoneNumber', 'Phone Number'],
    },
    {
      sourceColumn: 'address1',
      targetColumn: 'address_line1',
      required: false,
      aliases: ['Address', 'address', 'street', 'Street Address', 'address_line1'],
    },
    {
      sourceColumn: 'city',
      targetColumn: 'city',
      required: false,
      aliases: ['City'],
    },
    {
      sourceColumn: 'state',
      targetColumn: 'province_state',
      required: false,
      aliases: ['province', 'Province', 'State', 'province_state', 'Province/State'],
    },
    {
      sourceColumn: 'postalCode',
      targetColumn: 'postal_code',
      required: false,
      aliases: ['zip', 'Zip', 'postal_code', 'Postal Code', 'ZIP Code', 'zipCode'],
    },
    {
      sourceColumn: 'country',
      targetColumn: 'country',
      required: false,
      aliases: ['Country'],
      defaultValue: 'Canada',
    },
    {
      sourceColumn: 'companyName',
      targetColumn: 'organization_name',
      required: false,
      aliases: ['company', 'Company', 'Company Name', 'organization', 'Organization'],
    },
    {
      sourceColumn: 'website',
      targetColumn: 'website',
      required: false,
      aliases: ['Website', 'url', 'URL'],
    },
    {
      sourceColumn: 'source',
      targetColumn: 'source',
      required: false,
      aliases: ['Source', 'lead_source'],
      defaultValue: 'GHL Import',
    },
    {
      sourceColumn: 'dateAdded',
      targetColumn: 'created_at',
      required: false,
      aliases: ['Date Added', 'date_added', 'createdAt', 'Created At'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
    {
      sourceColumn: 'tags',
      targetColumn: '__tags',
      required: false,
      aliases: ['Tags', 'tag'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.first_name && !row.last_name && !row.email_primary) {
      errors.push('At least one of first name, last name, or email is required.')
    }
    return errors
  },
}
