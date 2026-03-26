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
import { useEffect, useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, LayoutDashboard, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkplaceShell } from '@/components/shell/WorkplaceShell'
import { ImmigrationFunnel } from '@/components/funnel/ImmigrationFunnel'
import ExecutiveSummary from '@/components/matters/executive-summary'
import { VitalityHeader } from '@/components/matters/vitality-header'
import { ActiveUsersIndicator } from '@/components/matters/active-users-indicator'
import { UniversalGlobeSelector } from '@/components/i18n/UniversalGlobeSelector'
import { useLocale } from '@/lib/i18n/use-locale'
import { AuraHeader } from '@/components/front-desk/AuraHeader'
import { SovereignSeal } from '@/components/matters/sovereign-seal'
import { AiDraftPanel } from '@/components/matters/ai-draft-panel'
import { NorvaEarPanel } from '@/components/matters/norva-ear-panel'
import { NorvaWelcomeBanner } from '@/components/shell/NorvaWelcomeBanner'
import type { ZoneDProps } from '@/components/shell/ZoneD'
import { fetchMatterDetail, fetchMatterTypeEnforcement, matterKeys } from '@/lib/queries/matters'
import type { Database } from '@/lib/types/database'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useMatterPresence } from '@/lib/hooks/use-matter-presence'
import { useFieldLock } from '@/lib/hooks/use-field-lock'

// Valid ZoneD tab IDs — keep in sync with ZoneD's TabId union.
const VALID_TABS = new Set<ZoneDProps['initialTab']>([
  'details',
  'documents',
  'intelligence',
  'forms',
  'questionnaire',
  'review',
  'billing',
  'communications',
  'correspondence',
  'tasks',
  'notes',
  'ircc-portal',
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
  const explicitTab = parseTabParam(searchParams.get('tab'))

  // Default to WorkplaceShell (Norva Workspace); ?view=summary reverts to exec summary
  const viewParam = searchParams.get('view')
  const [activeView, setActiveView] = useState<'summary' | 'shell'>(
    viewParam === 'summary' ? 'summary' : 'shell'
  )

  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { appUser } = useUser()
  const userId = appUser?.id ?? ''

  // ── Real-Time Presence (Collaboration Hub) ──────────────────────────────
  const { viewers, channel: presenceChannel } = useMatterPresence({
    matterId,
    userId: appUser?.id ?? null,
    tenantId: tenantId || null,
    firstName: appUser?.first_name ?? null,
    lastName: appUser?.last_name ?? null,
    email: appUser?.email ?? null,
    avatarUrl: appUser?.avatar_url ?? null,
    enabled: !!matterId && !!appUser?.id && !!tenantId,
  })

  const displayName = useMemo(
    () => [appUser?.first_name, appUser?.last_name].filter(Boolean).join(' ') || appUser?.email || '',
    [appUser],
  )

  // ── Polyglot Bridge — Global 15 Language Selector (Directive 16.2) ──────
  const { locale, setLocale } = useLocale({ audience: 'client' })

  const { lockedFields, lockField, unlockField, isFieldLocked, getFieldLock } = useFieldLock({
    channel: presenceChannel,
    userId: appUser?.id ?? null,
    displayName,
    tenantId: tenantId || null,
    enabled: !!presenceChannel && !!appUser?.id && !!tenantId,
  })

  type Matter = Database['public']['Tables']['matters']['Row']

  const queryClient = useQueryClient()
  const {
    data: matter,
    isLoading: matterLoading,
    error: matterError,
  } = useQuery({
    queryKey: matterKeys.detail(matterId),
    queryFn: () => fetchMatterDetail(matterId),
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
    placeholderData: () => {
      // Try to find this matter in any cached list query
      const listQueries = queryClient.getQueriesData<{ matters?: Matter[] }>({
        queryKey: matterKeys.lists(),
      })
      for (const [, data] of listQueries) {
        const found = data?.matters?.find((m) => m.id === matterId)
        if (found) return found as Matter
      }
      // Also check dashboard core cache
      const dashboardData = queryClient.getQueryData<Matter>(
        ['matter-dashboard', 'core', matterId],
      )
      if (dashboardData) return dashboardData
      return undefined
    },
  })

  // ── Immigration detection (must be before early returns — Rules of Hooks)
  const { data: matterTypeData } = useQuery({
    queryKey: ['matter_types', 'single', matter?.matter_type_id],
    queryFn: () => fetchMatterTypeEnforcement(matter!.matter_type_id!),
    enabled: !!matter?.matter_type_id,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: { id: string; enforcement_enabled: boolean } | undefined) => prev,
  })
  const enforcementEnabled = matterTypeData?.enforcement_enabled ?? false
  const isImmigrationFunnel = (!!matter?.case_type_id || enforcementEnabled) && !!matter

  // Elevated-priority matters default to Intelligence tab (Directive 26.0)
  const initialTab = explicitTab
    ?? (matter?.priority === 'high' ? 'intelligence' as const : undefined)

  // Bounce to matters list if matter is not found after loading completes
  useEffect(() => {
    if (!matterLoading && !matter && !matterError) {
      router.replace('/matters')
    }
  }, [matterLoading, matter, matterError, router])

  // ── Loading ──────────────────────────────────────────────────────────────
  // Only block the full page on tenant loading (nearly always cached).
  // Matter data uses placeholderData from list cache, so matterLoading is
  // typically false on first render. If matter is still loading (no cache
  // hit), we show a lighter content-area skeleton below instead of blocking
  // the entire shell.
  if (tenantLoading) {
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

  // ── Matter still loading (no list-cache hit) — show toggle bar + content skeleton
  if (!matter) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* View toggle bar — render immediately so layout doesn't shift */}
        <div className="flex items-center gap-1 border-b px-4 py-1.5 bg-muted/30">
          <Button
            variant={activeView === 'summary' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setActiveView('summary')}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Summary
          </Button>
          <Button
            variant={activeView === 'shell' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setActiveView('shell')}
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Workspace
          </Button>
        </div>
        {/* Content-area skeleton — lighter than full-page skeleton */}
        <div className="flex flex-1 gap-4 p-6">
          <div className="flex-1 space-y-4">
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

  // ── Immigration Funnel ───────────────────────────────────────────────
  if (isImmigrationFunnel) {
    return (
      <div className="h-full overflow-hidden">
        {/* Active users bar + language — visible above the funnel */}
        <div className="flex items-center justify-end gap-2 border-b px-4 py-1 bg-muted/20">
          <SovereignSeal matterId={matterId} />
          <UniversalGlobeSelector
            value={locale}
            onChange={(code) => setLocale(code as import('@/lib/i18n/config').LocaleCode)}
            audience="client"
            compact
          />
          {viewers.length > 1 && (
            <ActiveUsersIndicator viewers={viewers} currentUserId={appUser?.id ?? null} />
          )}
        </div>
        <ImmigrationFunnel
          matterId={matterId}
          tenantId={tenantId}
          matterTitle={matter.title ?? matter.matter_number ?? undefined}
        />
      </div>
    )
  }

  // ── Standard Shell with Executive Summary toggle ─────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* AuraHeader — Polyglot Pulse with Globe Selector (Team TITAN) */}
      <AuraHeader className="rounded-none" />

      {/* View toggle bar + active users */}
      <div className="flex items-center justify-between border-b px-4 py-1.5 bg-muted/30">
        <div className="flex items-center gap-1">
          <Button
            variant={activeView === 'summary' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setActiveView('summary')}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Summary
          </Button>
          <Button
            variant={activeView === 'shell' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setActiveView('shell')}
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Workspace
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <SovereignSeal matterId={matterId} />
          <UniversalGlobeSelector
            value={locale}
            onChange={(code) => setLocale(code as import('@/lib/i18n/config').LocaleCode)}
            audience="client"
            compact
          />
          <ActiveUsersIndicator viewers={viewers} currentUserId={appUser?.id ?? null} />
        </div>
      </div>

      {/* Active view */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === 'summary' ? (
          <div className="h-full p-3 overflow-y-auto">
            <NorvaWelcomeBanner />
            <VitalityHeader
              matterId={matterId}
              tenantId={tenantId}
              userId={userId}
            />
          </div>
        ) : (
          <WorkplaceShell matter={matter} tenantId={tenantId} initialTab={initialTab} />
        )}
      </div>

      {/* Norva Intelligence — floating AI Draft button */}
      {matter && (
        <AiDraftPanel matterId={matterId} matterTitle={matter.title} />
      )}

      {/* Norva Ear — floating consultation recorder */}
      {matter && (
        <NorvaEarPanel matterId={matterId} matterTitle={matter.title} />
      )}
    </div>
  )
}
