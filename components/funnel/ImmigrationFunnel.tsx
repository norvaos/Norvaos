'use client'

import { Suspense, lazy, useState } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useImmigrationReadiness } from '@/lib/queries/immigration-readiness'
import { FunnelProvider, useFunnelContext } from './FunnelContext'
import { FunnelStepIndicator } from './FunnelStepIndicator'
import { MatterDetailsSheet } from './MatterDetailsSheet'

// ── Lazy-loaded screens (code-split) ─────────────────────────────────────────

const VerificationScreen = lazy(() => import('./screens/VerificationScreen'))
const WorkspaceScreen = lazy(() =>
  import('./screens/WorkspaceScreen').then((m) => ({
    default: m.WorkspaceScreen,
  })),
)
const ApprovalScreen = lazy(() => import('./screens/ApprovalScreen'))

// ── Props ────────────────────────────────────────────────────────────────────

interface ImmigrationFunnelProps {
  matterId: string
  tenantId: string
  matterTitle?: string
}

// ── Active screen router ─────────────────────────────────────────────────────

function ActiveScreen() {
  const { currentStep } = useFunnelContext()

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-48 w-full max-w-2xl rounded-lg" />
        </div>
      }
    >
      {currentStep === 'verification' && <VerificationScreen />}
      {currentStep === 'workspace' && <WorkspaceScreen />}
      {currentStep === 'approval' && <ApprovalScreen />}
    </Suspense>
  )
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function FunnelSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
      {/* Step indicator skeleton */}
      <div className="flex items-center justify-center gap-6 px-6 py-4">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-0.5 w-20" />
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-0.5 w-20" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      {/* Content skeleton */}
      <div className="flex flex-1 items-center justify-center p-6">
        <Skeleton className="h-64 w-full max-w-3xl rounded-lg" />
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function ImmigrationFunnel({
  matterId,
  tenantId,
  matterTitle,
}: ImmigrationFunnelProps) {
  const { data: readinessData, isLoading } = useImmigrationReadiness(matterId)
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (isLoading) return <FunnelSkeleton />

  return (
    <FunnelProvider
      readinessData={readinessData ?? null}
      matterId={matterId}
      tenantId={tenantId}
    >
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* ── Header bar ──────────────────────────────────────────────── */}
        <header className="flex items-center justify-between border-b px-6 py-3">
          <h1 className="text-sm font-semibold truncate">
            {matterTitle ?? 'Immigration Matter'}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen(true)}
            className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </Button>
        </header>

        {/* ── Matter details slide-out ────────────────────────────────── */}
        <MatterDetailsSheet
          matterId={matterId}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />

        {/* ── Step indicator ───────────────────────────────────────────── */}
        <FunnelStepIndicator />

        {/* ── Active screen ───────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-y-auto">
          <ActiveScreen />
        </main>
      </div>
    </FunnelProvider>
  )
}
