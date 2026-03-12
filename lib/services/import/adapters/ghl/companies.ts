import type { EntityAdapter } from '../types'

export const ghlCompaniesAdapter: EntityAdapter = {
  entityType: 'companies',
  targetTable: 'contacts',
  displayName: 'Companies',
  sourceDisplayName: 'GHL Companies',
  description: 'Import businesses/companies from Go High Level as organisation contacts.',
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'organization_name',
      required: true,
      aliases: ['Name', 'company', 'Company', 'business_name', 'Business Name'],
    },
    {
      sourceColumn: 'phone',
      targetColumn: 'phone_primary',
      required: false,
      aliases: ['Phone', 'phone_primary'],
    },
    {
      sourceColumn: 'email',
      targetColumn: 'email_primary',
      required: false,
      aliases: ['Email', 'email_primary'],
    },
    {
      sourceColumn: 'website',
      targetColumn: 'website',
      required: false,
      aliases: ['Website', 'url'],
    },
    {
      sourceColumn: 'address',
      targetColumn: 'address_line1',
      required: false,
      aliases: ['Address', 'street', 'address_line1'],
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
      aliases: ['State', 'province', 'Province'],
    },
    {
      sourceColumn: 'postalCode',
      targetColumn: 'postal_code',
      required: false,
      aliases: ['postal_code', 'Postal Code', 'zip', 'ZIP'],
    },
    {
      sourceColumn: 'country',
      targetColumn: 'country',
      required: false,
      aliases: ['Country'],
      defaultValue: 'Canada',
    },
  ],
  postProcess: (rows) => {
    // Mark all company records as organization type
    return rows.map((row) => ({
      ...row,
      contact_type: 'organization',
    }))
  },
  validate: (row) => {
    const errors: string[] = []
    if (!row.organization_name) {
      errors.push('Company/organisation name is required.')
    }
    return errors
  },
}
