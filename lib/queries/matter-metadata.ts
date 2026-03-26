import { useQuery } from '@tanstack/react-query'

/**
 * Unified hook that fetches all matter form dropdown data in a single request.
 * Replaces individual hooks for practice areas, matter types, fee templates, staff, etc.
 */

export interface MatterMetadata {
  practice_areas: Array<{ id: string; name: string; color: string | null; is_enabled: boolean }>
  matter_types: Array<{
    id: string; name: string; practice_area_id: string
    enforcement_enabled: boolean; has_ircc_forms: boolean
    color: string | null; icon: string | null; program_category_key: string | null
  }>
  case_types: Array<{ id: string; name: string; description: string | null; matter_type_id: string }>
  fee_templates: Array<{
    id: string; name: string; billing_type: string | null
    practice_area_id: string | null; matter_type_id: string | null
    professional_fees: unknown; government_fees: unknown; disbursements: unknown
    hst_applicable: boolean | null
  }>
  staff: Array<{ id: string; first_name: string | null; last_name: string | null; email: string; role_id: string | null }>
  pipelines: Array<{
    id: string; name: string; matter_type_id: string; is_default: boolean
    matter_stages: Array<{ id: string; name: string; sort_order: number; color: string | null; icon: string | null }>
  }>
}

export function useMatterMetadata() {
  return useQuery<MatterMetadata>({
    queryKey: ['matter-metadata'],
    queryFn: async () => {
      const res = await fetch('/api/matters/metadata')
      if (!res.ok) throw new Error('Failed to fetch matter metadata')
      return res.json()
    },
    staleTime: 5 * 60_000, // 5 minutes  -  reference data
  })
}
