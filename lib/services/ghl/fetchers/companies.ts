import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlBusiness {
  id: string
  name?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  description?: string
  updatedAt?: string
}

export async function fetchGhlCompanies(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const businesses = await ghlPaginateAll<GhlBusiness>(
    connectionId, admin, 'businesses',
    'businesses', { locationId },
  )

  const rows = businesses.map((b) => ({
    __source_id: b.id,
    name: b.name ?? '',
    phone: b.phone ?? '',
    email: b.email ?? '',
    website: b.website ?? '',
    address: b.address ?? '',
    city: b.city ?? '',
    state: b.state ?? '',
    postalCode: b.postalCode ?? '',
    country: b.country ?? '',
    description: b.description ?? '',
  }))

  return { rows, totalRows: rows.length }
}
