import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlSurvey {
  id: string
  name?: string
  locationId?: string
}

interface GhlSurveySubmission {
  id: string
  surveyId?: string
  contactId?: string
  name?: string
  email?: string
  others?: Record<string, unknown>
  createdAt?: string
}

export async function fetchGhlSurveys(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const surveyData = await ghlFetch<{ surveys: GhlSurvey[] }>(
    connectionId, admin, 'surveys', { params: { locationId } },
  )

  const rows: Record<string, string>[] = []

  for (const survey of surveyData.surveys ?? []) {
    const submissions = await ghlPaginateAll<GhlSurveySubmission>(
      connectionId, admin, 'surveys/submissions',
      'submissions', { surveyId: survey.id, locationId },
    )

    for (const sub of submissions) {
      rows.push({
        __source_id: sub.id,
        surveyId: survey.id,
        surveyName: survey.name ?? '',
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
