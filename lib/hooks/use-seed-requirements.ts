'use client'

/**
 * useSeedRequirements  -  Auto-seed matter_checklist_items when caseTypeId changes.
 *
 * Watches the case type (processing stream) and, if no checklist items exist yet,
 * calls useInitializeChecklist to bulk-copy from checklist_templates.
 *
 * Guard: Only seeds when checklist is empty to prevent duplicates on re-render.
 */

import { useEffect, useRef } from 'react'
import { useMatterChecklistItems, useInitializeChecklist } from '@/lib/queries/immigration'

interface SeedRequirementsResult {
  seeding: boolean
  seeded: boolean
}

export function useSeedRequirements(
  matterId: string,
  tenantId: string,
  caseTypeId: string | null,
): SeedRequirementsResult {
  const { data: existingItems, isLoading } = useMatterChecklistItems(matterId)
  const initChecklist = useInitializeChecklist()
  const lastSeededCaseTypeRef = useRef<string | null>(null)

  useEffect(() => {
    // Don't seed while loading existing items, or if no case type
    if (isLoading || !caseTypeId || !tenantId || !matterId) return

    // Don't re-seed if we already seeded for this case type
    if (lastSeededCaseTypeRef.current === caseTypeId) return

    // Don't seed if items already exist (either from previous seed or manual add)
    if (existingItems && existingItems.length > 0) {
      lastSeededCaseTypeRef.current = caseTypeId
      return
    }

    // Seed from templates
    lastSeededCaseTypeRef.current = caseTypeId
    initChecklist.mutate({ tenantId, matterId, caseTypeId })
  }, [caseTypeId, matterId, tenantId, isLoading, existingItems, initChecklist])

  return {
    seeding: initChecklist.isPending,
    seeded: lastSeededCaseTypeRef.current === caseTypeId && !initChecklist.isPending,
  }
}
