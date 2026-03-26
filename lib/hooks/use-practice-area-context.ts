'use client'

import { useUIStore } from '@/lib/stores/ui-store'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useEnabledPracticeAreas, type EnabledPracticeArea } from '@/lib/queries/practice-areas'

/**
 * Convenience hook that combines the global practice filter state
 * with the resolved practice area data. Use this in any component
 * that needs to react to the active practice area context.
 *
 * Color and name are available instantly from the Zustand store (persisted
 * to localStorage) so the UI never flashes  -  the query only refines them.
 */
export function usePracticeAreaContext() {
  const filter = useUIStore((s) => s.activePracticeFilter)
  const storedColor = useUIStore((s) => s.activePracticeColor)
  const storedName = useUIStore((s) => s.activePracticeName)
  const { tenant } = useTenant()
  const { data: practiceAreas } = useEnabledPracticeAreas(tenant?.id)

  const activePracticeArea: EnabledPracticeArea | null =
    practiceAreas?.find((pa) => pa.id === filter) ?? null

  // Use query-resolved name first, fall back to stored name from Zustand
  const resolvedName = activePracticeArea?.name ?? storedName ?? undefined

  return {
    /** Raw filter value: 'all' or a practice_area UUID */
    filter,
    /** Resolved practice area object, or null when filter is 'all' */
    activePracticeArea,
    /** All enabled practice areas for the tenant */
    practiceAreas: practiceAreas ?? [],
    /** True when a specific practice area is selected (not 'all') */
    isFiltered: filter !== 'all',
    /** Shortcut: true when the active practice area is Immigration */
    isImmigration: (resolvedName ?? '').toLowerCase() === 'immigration',
    /** The UUID if filtered, undefined otherwise  -  pass to query hooks */
    effectiveId: filter !== 'all' ? filter : undefined,
    /** The active practice area name, or undefined  -  useful for matching pipelines.practice_area (TEXT) */
    effectiveName: resolvedName,
    /** Accent color  -  available instantly from store, refined by query */
    effectiveColor: activePracticeArea?.color ?? storedColor ?? undefined,
  }
}
