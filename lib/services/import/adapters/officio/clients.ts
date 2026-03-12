import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const officioClientsAdapter: EntityAdapter = {
  entityType: 'contacts',
  targetTable: 'contacts',
  displayName: 'Clients',
  sourceDisplayName: 'Officio Clients',
  description: 'Import client profiles from Officio including personal and immigration data.',
  fieldMappings: [
    {
      sourceColumn: 'Client ID',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'client_id', 'clientId'],
    },
    {
      sourceColumn: 'First Name',
      targetColumn: 'first_name',
      required: false,
      aliases: ['first_name', 'firstName', 'Given Name'],
    },
    {
      sourceColumn: 'Last Name',
      targetColumn: 'last_name',
      required: false,
      aliases: ['last_name', 'lastName', 'Family Name', 'Surname'],
    },
    {
      sourceColumn: 'Middle Name',
      targetColumn: 'middle_name',
      required: false,
      aliases: ['middle_name', 'middleName'],
    },
    {
      sourceColumn: 'Email',
      targetColumn: 'email_primary',
      required: false,
      aliases: ['email', 'E-mail', 'Email Address', 'email_primary'],
    },
    {
      sourceColumn: 'Phone',
      targetColumn: 'phone_primary',
      required: false,
      aliases: ['phone', 'Phone Number', 'phone_primary', 'Telephone'],
    },
    {
      sourceColumn: 'Date of Birth',
      targetColumn: 'date_of_birth',
      required: false,
      aliases: ['date_of_birth', 'DOB', 'dob', 'Birth Date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'Address',
      targetColumn: 'address_line1',
      required: false,
      aliases: ['address', 'Street Address', 'address_line1'],
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
      aliases: ['province', 'State', 'province_state'],
    },
    {
      sourceColumn: 'Postal Code',
      targetColumn: 'postal_code',
      required: false,
      aliases: ['postal_code', 'Zip', 'ZIP Code'],
    },
    {
      sourceColumn: 'Country',
      targetColumn: 'country',
      required: false,
      aliases: ['country', 'Country of Residence'],
      defaultValue: 'Canada',
    },
    {
      sourceColumn: 'Country of Citizenship',
      targetColumn: '__citizenship',
      required: false,
      aliases: ['citizenship', 'Nationality', 'Country of Birth'],
    },
    {
      sourceColumn: 'Passport Number',
      targetColumn: '__passport_number',
      required: false,
      aliases: ['passport_number', 'Passport', 'passport'],
    },
    {
      sourceColumn: 'UCI Number',
      targetColumn: '__uci_number',
      required: false,
      aliases: ['uci', 'UCI', 'uci_number', 'Unique Client Identifier'],
    },
    {
      sourceColumn: 'Created Date',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Date Created', 'createdAt'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
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
