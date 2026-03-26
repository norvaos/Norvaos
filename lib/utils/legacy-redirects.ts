/**
 * Legacy Surface Retirement  -  Phase D
 *
 * Maps old routes to their new locations or replacement panels.
 * Used to show deprecation notices and guide users to the new experience.
 */

export interface LegacyRouteMapping {
  /** The old route that is being retired */
  oldRoute: string
  /** The new route or panel location */
  newRoute: string | null
  /** Human-readable description of where the feature moved */
  description: string
  /** Whether the old route should still be functional (soft deprecation) */
  stillFunctional: boolean
  /** The deprecation message to show on the old route */
  deprecationMessage: string
  /** Phase in which this route was deprecated */
  deprecatedInPhase: string
}

export const LEGACY_ROUTE_MAP: LegacyRouteMapping[] = [
  {
    oldRoute: '/communications',
    newRoute: null, // Replaced by Zone 3 Communication Panel in Matter Workplace
    description: 'Communication Panel in Matter Workplace',
    stillFunctional: true,
    deprecationMessage:
      'This view has been replaced by the Communication Panel in the Matter Workplace. Navigate to any matter to access the new email experience.',
    deprecatedInPhase: 'Phase D',
  },
]

/**
 * Look up whether a given pathname has been deprecated.
 * Returns the mapping if found, or null if the route is still current.
 */
export function getLegacyRouteInfo(pathname: string): LegacyRouteMapping | null {
  return (
    LEGACY_ROUTE_MAP.find(
      (mapping) => pathname === mapping.oldRoute || pathname.startsWith(mapping.oldRoute + '/')
    ) ?? null
  )
}

/**
 * Get the deprecation message for a given pathname.
 * Returns null if the route is not deprecated.
 */
export function getDeprecationMessage(pathname: string): string | null {
  const mapping = getLegacyRouteInfo(pathname)
  return mapping?.deprecationMessage ?? null
}

/**
 * Check if a route is deprecated but still functional.
 */
export function isDeprecatedRoute(pathname: string): boolean {
  const mapping = getLegacyRouteInfo(pathname)
  return mapping !== null
}
