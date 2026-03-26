'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Monitor, Loader2, ClipboardList, Package, Copy, ArrowRight, UserPlus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FieldClipPanel } from './field-clip-panel'
import { SubmissionChecklistPanel } from './submission-checklist-panel'
import { FinalPackagePanel } from './final-package-panel'
import { buildClipSections } from '@/lib/services/ircc-field-clip'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import { createEmptyProfile } from '@/lib/types/ircc-profile'

// ─── Props ───────────────────────────────────────────────────────────────────

interface IRCCSideBySideEngineProps {
  matterId: string
  tenantId: string
  contactId: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Norva Submission Engine  -  IRCC Side-by-Side Mode
 *
 * Optimised for 50/50 screen splitting: lawyer has NorvaOS on one half
 * and the IRCC portal on the other. Compact, single-column layout at 11px.
 *
 * Three sub-panels:
 *   1. Field-to-Clip  -  one-click copy for every IRCC portal field
 *   2. Submission Sync  -  track what's been uploaded to the portal
 *   3. Final Package  -  approved forms and documents ready to attach
 */
export function IRCCSideBySideEngine({ matterId, tenantId, contactId }: IRCCSideBySideEngineProps) {
  const [activePanel, setActivePanel] = useState<'clip' | 'checklist' | 'package'>('clip')

  // Fetch the contact's immigration_data (JSONB)  -  the single source of truth
  const { data: profile, isLoading } = useQuery({
    queryKey: ['ircc-profile', contactId],
    queryFn: async () => {
      if (!contactId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('immigration_data')
        .eq('id', contactId)
        .single()

      if (error) throw error
      return (data?.immigration_data as unknown as IRCCProfile) ?? null
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  // Build clip sections from profile
  const clipSections = useMemo(() => {
    if (!profile) return buildClipSections(createEmptyProfile())
    return buildClipSections(profile)
  }, [profile])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Empty State: No Primary Contact ──────────────────────────────────────
  if (!contactId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-4">
          <UserPlus className="h-6 w-6 text-blue-500" />
        </div>
        <p className="text-sm font-semibold">Norva Submission Engine</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
          Link a primary contact to this matter to activate the IRCC Side-by-Side engine.
        </p>
        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-left max-w-[300px]">
          <p className="text-[10px] font-medium mb-1.5">Quick Start</p>
          <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to the <strong>Details</strong> tab</li>
            <li>Add a contact in the <strong>People</strong> section</li>
            <li>Mark them as <strong>Primary Contact</strong></li>
            <li>Return here  -  your data will load automatically</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar  -  Norva Submission Engine mode hint */}
      <div className="flex-none px-3 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b flex items-center gap-2">
        <Monitor className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span className="text-[10px] text-blue-700 dark:text-blue-300 flex-1">
          Norva Submission Engine  -  split your screen 50/50 with the IRCC Portal for one-click data entry
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-[9px] text-blue-500 underline underline-offset-2 hover:text-blue-700">
              How it works
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[260px] text-xs">
            <p className="font-medium mb-1">Norva Submission Engine</p>
            <p>Snap NorvaOS to the left half of your screen and the IRCC portal to the right. Click any Copy button to grab the exact value the portal expects, then paste it directly. The Checklist tab tracks your progress globally.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Tab navigation */}
      <Tabs
        value={activePanel}
        onValueChange={(v) => setActivePanel(v as typeof activePanel)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="flex-none w-full justify-start rounded-none border-b bg-card px-1 h-8 gap-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="clip"
                className="text-[10px] px-2.5 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Copy className="h-3 w-3 mr-1" />
                Field-to-Clip
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              Every validated field from the client profile, ready to copy and paste into the IRCC portal in one click.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="checklist"
                className="text-[10px] px-2.5 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <ClipboardList className="h-3 w-3 mr-1" />
                Submission Sync
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              Track every form and document as you upload it to IRCC. Status syncs across the entire matter.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="package"
                className="text-[10px] px-2.5 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Package className="h-3 w-3 mr-1" />
                Final Package
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              Your approved forms and encrypted documents in a single submission-ready queue. Download individually or as a bundle.
            </TooltipContent>
          </Tooltip>
        </TabsList>

        <TabsContent value="clip" className="flex-1 overflow-hidden m-0 p-0">
          <FieldClipPanel sections={clipSections} />
        </TabsContent>

        <TabsContent value="checklist" className="flex-1 overflow-hidden m-0 p-0">
          <SubmissionChecklistPanel matterId={matterId} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="package" className="flex-1 overflow-hidden m-0 p-0">
          <FinalPackagePanel matterId={matterId} tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
