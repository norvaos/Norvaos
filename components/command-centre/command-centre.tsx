'use client'

import { useState } from 'react'
import { CommandCentreProvider, useCommandCentre } from './command-centre-context'
import { ConvertedBanner } from './converted-banner'
import { HeroHeader } from './hero-header'
import { MeetingTimerBar } from './meeting-timer-bar'
import { Workspace } from './workspace'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { StatusRequests } from './panels/status-requests'
import { ScreeningAnswers } from './panels/screening-answers'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCheckinRealtime } from '@/lib/hooks/use-checkin-realtime'

// ─── Props ──────────────────────────────────────────────────────────

interface CommandCentreProps {
  entityType: 'lead' | 'matter'
  entityId: string
}

// ─── Inner Shell (uses context) ─────────────────────────────────────

function CommandCentreShell() {
  const {
    entityType,
    entityId,
    lead,
    contact,
    tenantId,
    isConverted,
    isLoading,
  } = useCommandCentre()

  const [activityOpen, setActivityOpen] = useState(false)
  const [screeningOpen, setScreeningOpen] = useState(false)

  // Realtime check-in notifications (Rule #16: additive, not the only channel)
  useCheckinRealtime(tenantId, contact?.id)

  // ── Loading state ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-slate-50">
        <div className="shrink-0 border-b bg-white px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-slate-50">
      {/* Converted banner (sticky) */}
      {isConverted && <ConvertedBanner />}

      {/* Hero header (sticky) */}
      <HeroHeader
        onToggleActivity={() => setActivityOpen((prev) => !prev)}
        activityOpen={activityOpen}
        onToggleScreening={() => setScreeningOpen((prev) => !prev)}
        screeningOpen={screeningOpen}
      />

      {/* Sticky meeting timer (only visible when running) */}
      <MeetingTimerBar />

      {/* Scrollable workspace */}
      <div className="flex-1 overflow-y-auto">
        <Workspace />
      </div>

      {/* Activity slide-out panel */}
      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-base">Activity Feed</SheetTitle>
            <SheetDescription className="sr-only">
              Activity feed and document status requests
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Document status (shown for retained matters) */}
            <StatusRequests />

            {/* Activity feed */}
            <ActivityTimeline
              tenantId={tenantId}
              contactId={contact?.id}
              entityType={entityType}
              entityId={entityId}
              {...(entityType === 'lead' ? {} : { matterId: entityId })}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Screening Questions slide-out panel */}
      {entityType === 'lead' && (
        <Sheet open={screeningOpen} onOpenChange={setScreeningOpen}>
          <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] p-0">
            <SheetHeader className="px-4 py-3 border-b">
              <SheetTitle className="text-base">Screening Questions</SheetTitle>
              <SheetDescription className="sr-only">
                Intake form answers submitted by the lead
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <ScreeningAnswers />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

// ─── Public Component ───────────────────────────────────────────────

export function CommandCentre({ entityType, entityId }: CommandCentreProps) {
  return (
    <CommandCentreProvider entityType={entityType} entityId={entityId}>
      <CommandCentreShell />
    </CommandCentreProvider>
  )
}
