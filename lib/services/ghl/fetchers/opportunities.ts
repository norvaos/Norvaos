import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlOpportunity {
  id: string
  name?: string
  contactId?: string
  pipelineId?: string
  pipelineStageId?: string
  status?: string
  monetaryValue?: number
  source?: string
  assignedTo?: string
  dateAdded?: string
  customFields?: { id: string; value: unknown }[]
}

export async function fetchGhlOpportunities(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const opps = await ghlPaginateAll<GhlOpportunity>(
    connectionId, admin, 'opportunities/search',
    'opportunities', { location_id: locationId },
  )

  const rows = opps.map((o) => ({
    __source_id: o.id,
    name: o.name ?? '',
    contactId: o.contactId ?? '',
    pipelineId: o.pipelineId ?? '',
    pipelineStageId: o.pipelineStageId ?? '',
    status: o.status ?? '',
    monetaryValue: o.monetaryValue != null ? String(o.monetaryValue) : '',
    source: o.source ?? '',
    assignedTo: o.assignedTo ?? '',
    dateAdded: o.dateAdded ?? '',
  }))

  return { rows, totalRows: rows.length }
}
