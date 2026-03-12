import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch } from '../client'

interface GhlUser {
  id: string
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
  permissions?: Record<string, unknown>
}

export async function fetchGhlUsers(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const data = await ghlFetch<{ users: GhlUser[] }>(
    connectionId, admin, `users`, { params: { locationId } },
  )

  const rows = (data.users ?? []).map((u) => ({
    __source_id: u.id,
    name: u.name ?? [u.firstName, u.lastName].filter(Boolean).join(' '),
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    email: u.email ?? '',
    phone: u.phone ?? '',
    role: u.role ?? '',
  }))

  return { rows, totalRows: rows.length }
}
