import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioContact {
  id: number
  type?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  name?: string
  title?: string
  company?: { id: number; name: string }
  email_addresses?: { address: string; name: string; primary: boolean }[]
  phone_numbers?: { number: string; name: string; primary: boolean }[]
  addresses?: { street: string; city: string; province: string; postal_code: string; country: string; primary: boolean }[]
  web_sites?: { address: string; name: string }[]
  date_of_birth?: string
  custom_field_values?: { id: number; field_name: string; value: unknown }[]
  created_at?: string
  updated_at?: string
}

export async function fetchClioContacts(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const contacts = await clioPaginateAll<ClioContact>(
    connectionId, admin, 'contacts',
    ['id', 'type', 'first_name', 'last_name', 'middle_name', 'name', 'title', 'company', 'email_addresses', 'phone_numbers', 'addresses', 'web_sites', 'date_of_birth', 'custom_field_values', 'created_at', 'updated_at'],
  )

  const rows = contacts.map((c) => {
    const primaryEmail = c.email_addresses?.find((e) => e.primary)?.address ?? c.email_addresses?.[0]?.address ?? ''
    const primaryPhone = c.phone_numbers?.find((p) => p.primary)?.number ?? c.phone_numbers?.[0]?.number ?? ''
    const primaryAddr = c.addresses?.find((a) => a.primary) ?? c.addresses?.[0]

    return {
      __source_id: String(c.id),
      type: c.type ?? 'Person',
      firstName: c.first_name ?? '',
      lastName: c.last_name ?? '',
      middleName: c.middle_name ?? '',
      name: c.name ?? '',
      title: c.title ?? '',
      company: c.company?.name ?? '',
      email: primaryEmail,
      phone: primaryPhone,
      street: primaryAddr?.street ?? '',
      city: primaryAddr?.city ?? '',
      province: primaryAddr?.province ?? '',
      postalCode: primaryAddr?.postal_code ?? '',
      country: primaryAddr?.country ?? '',
      website: c.web_sites?.[0]?.address ?? '',
      dateOfBirth: c.date_of_birth ?? '',
      customFields: c.custom_field_values ? JSON.stringify(c.custom_field_values) : '',
      createdAt: c.created_at ?? '',
    }
  })

  return { rows, totalRows: rows.length }
}
