import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlContact {
  id: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  address1?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  companyName?: string
  website?: string
  dateOfBirth?: string
  source?: string
  tags?: string[]
  customFields?: { id: string; value: unknown }[]
  dateAdded?: string
  dateUpdated?: string
  dnd?: boolean
  assignedTo?: string
  timezone?: string
}

export async function fetchGhlContacts(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const contacts = await ghlPaginateAll<GhlContact>(
    connectionId, admin, 'contacts',
    'contacts', { locationId },
  )

  const rows = contacts.map((c) => ({
    __source_id: c.id,
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address1: c.address1 ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    country: c.country ?? '',
    postalCode: c.postalCode ?? '',
    companyName: c.companyName ?? '',
    website: c.website ?? '',
    dateOfBirth: c.dateOfBirth ?? '',
    source: c.source ?? '',
    tags: (c.tags ?? []).join(', '),
    dateAdded: c.dateAdded ?? '',
    assignedTo: c.assignedTo ?? '',
    dnd: c.dnd ? 'true' : 'false',
    customFields: JSON.stringify(c.customFields ?? []),
  }))

  return { rows, totalRows: rows.length }
}
