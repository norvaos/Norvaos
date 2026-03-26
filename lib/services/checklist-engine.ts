import type { Database } from '@/lib/types/database'

type MatterChecklistItem = Database['public']['Tables']['matter_checklist_items']['Row']

export interface ChecklistScore {
  total: number
  required: number
  requiredApproved: number
  completionPercent: number  // 0-100
  isComplete: boolean        // all required items approved or n/a
  missingRequired: string[]  // names of required items not yet approved
}

/**
 * Calculate checklist completion score for a matter.
 * Pure function  -  works both client-side and server-side.
 *
 * @param items - All checklist items for a matter
 * @returns ChecklistScore with completion % and blocking info
 */
export function calculateCompletionScore(items: MatterChecklistItem[]): ChecklistScore {
  if (items.length === 0) {
    return {
      total: 0,
      required: 0,
      requiredApproved: 0,
      completionPercent: 100,
      isComplete: true,
      missingRequired: [],
    }
  }

  const requiredItems = items.filter((item) => item.is_required)
  const requiredApproved = requiredItems.filter(
    (item) => item.status === 'approved' || item.status === 'not_applicable'
  )
  const missingRequired = requiredItems
    .filter((item) => item.status !== 'approved' && item.status !== 'not_applicable')
    .map((item) => item.document_name)

  const completionPercent =
    requiredItems.length === 0
      ? 100
      : Math.round((requiredApproved.length / requiredItems.length) * 100)

  return {
    total: items.length,
    required: requiredItems.length,
    requiredApproved: requiredApproved.length,
    completionPercent,
    isComplete: missingRequired.length === 0,
    missingRequired,
  }
}
