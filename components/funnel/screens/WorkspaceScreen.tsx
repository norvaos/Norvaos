'use client'

import { useState, useCallback } from 'react'
import { useFunnelContext } from '../FunnelContext'
import { useMatter } from '@/lib/queries/matters'
import { IntakePanel } from '../panels/IntakePanel'
import { LivePdfPreview } from '../panels/LivePdfPreview'
import { PortalStatusCard } from '../PortalStatusCardV2'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight } from 'lucide-react'

// ── WorkspaceScreen ─────────────────────────────────────────────────────────
// 2-column split-pane workspace: IntakePanel (left) + LivePdfPreview (right).
// No sidebars. Top bar shows progress + navigation buttons.

export function WorkspaceScreen() {
  const { matterId, tenantId, canNavigateTo, advance, goBack } = useFunnelContext()
  const { data: matter } = useMatter(matterId)

  // Shared live-sync state: intake fields flow into the PDF preview
  const [profileOverrides, setProfileOverrides] = useState<
    Record<string, unknown>
  >({})

  const handleProfileChange = useCallback(
    (profile: Record<string, unknown>) => {
      setProfileOverrides(profile)
    },
    [],
  )

  const canAdvance = canNavigateTo('approval')
  const matterTypeId = matter?.matter_type_id ?? null

  return (
    <div className="flex h-full flex-col">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Verification
        </Button>

        <div className="flex items-center gap-4">
          <PortalStatusCard
            matterId={matterId}
            tenantId={tenantId}
            matterTitle={matter?.title ?? matter?.matter_number ?? undefined}
            matterNumber={matter?.matter_number ?? undefined}
          />

          <Button
            size="sm"
            onClick={advance}
            disabled={!canAdvance}
            className="gap-1.5"
          >
            Advance to Approval
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── 2-Column Layout ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Intake Panel */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <IntakePanel
            matterId={matterId}
            matterTypeId={matterTypeId}
            onProfileChange={handleProfileChange}
          />
        </div>

        {/* Right: Live PDF Preview */}
        <div className="w-[480px] overflow-y-auto border-l">
          <LivePdfPreview
            matterId={matterId}
            matterTypeId={matterTypeId}
            profileOverrides={profileOverrides}
          />
        </div>
      </div>
    </div>
  )
}
