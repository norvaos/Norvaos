'use client'

/**
 * /matters/[id]/shell
 *
 * Full-screen WorkplaceShell (5-zone layout) for a single matter.
 * Fetches the matter row and tenant context, then mounts the shell.
 *
 * Supports deep-linking to a specific tab via the `?tab=` search param.
 * Example: /matters/abc123/shell?tab=billing  → opens at the Billing tab.
 * Hash routing (#billing) is still supported for back/forward navigation.
 *
 * This is the new spec-aligned shell (Section 3) that replaces the legacy
 * IRCC-specific WorkspaceShell over time. Both can coexist during migration.
 */

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkplaceShell } from '@/components/shell/WorkplaceShell'
import { ImmigrationFunnel } from '@/components/funnel/ImmigrationFunnel'
import type { ZoneDProps } from '@/components/shell/ZoneD'
import { useMatter } from '@/lib/queries/matters'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'

// Valid ZoneD tab IDs — keep in sync with ZoneD's TabId union.
const VALID_TABS = new Set<ZoneDProps['initialTab']>([
  'details',
  'documents',
  'forms',
  'questionnaire',
  'review',
  'billing',
  'communications',
  'correspondence',
  'tasks',
  'notes',
])

function parseTabParam(raw: string | null): ZoneDProps['initialTab'] | undefined {
  if (!raw) return undefined
  const candidate = raw as ZoneDProps['initialTab']
  return VALID_TABS.has(candidate) ? candidate : undefined
}

export default function MatterShellPage() {
  const params       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const matterId     = params.id as string

  // ?tab=billing → open ZoneD at the Billing tab on first render
  const initialTab = parseTabParam(searchParams.get('tab'))

  // Legacy escape hatch removed — funnel is the only UI for immigration matters

  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const {
    data: matter,
    isLoading: matterLoading,
    error: matterError,
  } = useMatter(matterId)

  // ── Immigration detection (must be before early returns — Rules of Hooks)
  const { data: matterTypeData } = useQuery({
    queryKey: ['matter_types', 'single', matter?.matter_type_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .select('id, enforcement_enabled')
        .eq('id', matter!.matter_type_id!)
        .single()
      if (error) throw error
      return data as { id: string; enforcement_enabled: boolean }
    },
    enabled: !!matter?.matter_type_id,
    staleTime: 5 * 60 * 1000,
  })
  const enforcementEnabled = matterTypeData?.enforcement_enabled ?? false
  const isImmigrationFunnel = (!!matter?.case_type_id || enforcementEnabled) && !!matter

  // Bounce to matters list if matter is not found after loading completes
  useEffect(() => {
    if (!matterLoading && !matter && !matterError) {
      router.replace('/matters')
    }
  }, [matterLoading, matter, matterError, router])

  // ── Loading ──────────────────────────────────────────────────────────────
  // ── Loading — layout-matching skeleton to prevent flicker ─────────────
  if (tenantLoading || matterLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header skeleton */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        {/* Step indicator / tab bar skeleton */}
        <div className="flex items-center gap-4 border-b px-6 py-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-0.5 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-0.5 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        {/* Content area skeleton */}
        <div className="flex flex-1 gap-4 p-6">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (matterError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Unable to load matter</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {(matterError as Error).message ?? 'An unexpected error occurred.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  // ── Not found guard ──────────────────────────────────────────────────────
  if (!matter) return null

  // ── Immigration Funnel ───────────────────────────────────────────────
  if (isImmigrationFunnel) {
    return (
      <div className="h-full overflow-hidden">
        <ImmigrationFunnel
          matterId={matterId}
          tenantId={tenantId}
          matterTitle={matter.title ?? matter.matter_number ?? undefined}
        />
      </div>
    )
  }

  // ── Standard Shell ────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-hidden">
      <WorkplaceShell matter={matter} tenantId={tenantId} initialTab={initialTab} />
    </div>
  )
}
