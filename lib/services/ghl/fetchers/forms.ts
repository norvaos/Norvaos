import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlForm {
  id: string
  name?: string
  locationId?: string
}

interface GhlFormSubmission {
  id: string
  formId?: string
  contactId?: string
  name?: string
  email?: string
  others?: Record<string, unknown>
  createdAt?: string
}

export async function fetchGhlForms(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // Get all forms
  const formData = await ghlFetch<{ forms: GhlForm[] }>(
    connectionId, admin, 'forms', { params: { locationId } },
  )

  const rows: Record<string, string>[] = []

  // For each form, fetch submissions
  for (const form of formData.forms ?? []) {
    const submissions = await ghlPaginateAll<GhlFormSubmission>(
      connectionId, admin, 'forms/submissions',
      'submissions', { formId: form.id, locationId },
    )

    for (const sub of submissions) {
      rows.push({
        __source_id: sub.id,
        formId: form.id,
        formName: form.name ?? '',
        contactId: sub.contactId ?? '',
        name: sub.name ?? '',
        email: sub.email ?? '',
        otherFields: sub.others ? JSON.stringify(sub.others) : '',
        createdAt: sub.createdAt ?? '',
      })
    }
  }

  return { rows, totalRows: rows.length }
}
