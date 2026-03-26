'use client'

/**
 * WorkplaceShell  -  The 5-zone unified workplace layout container.
 *
 * Layout (CSS Grid):
 *   Zone 1 (top, full width):   ContextHeader  -  always visible
 *   Zone 4 (left, 56px):        QuickAccessRail  -  icon buttons
 *   Zone 2 (centre, flexible):  CentralActionSurface  -  scrollable content
 *   Zone 3 (right, ~380px):     CommunicationPanel  -  email threads + compose
 *   Zone 5 (drawer overlay):    RightDrawer  -  slide-over triggered by Z4 clicks
 *
 * Responsive: Communication panel collapses on smaller screens (< lg).
 */

import { useMemo, useCallback, useState, useRef, useEffect, type ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ContextHeader, type ContextHeaderProps } from './context-header'
import { QuickAccessRail } from './quick-access-rail'
import { CentralActionSurface, type CentralActionSurfaceProps } from './central-action-surface'
import { CommunicationPanel, type CommunicationPanelProps } from './communication-panel'
import { RightDrawer, type RightDrawerProps } from './right-drawer'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkplaceShellProps {
  matterId: string
  tenantId: string

  // Context header props
  contextHeaderProps: ContextHeaderProps

  // Central action surface props
  centralSurfaceProps: CentralActionSurfaceProps

  // Communication panel props
  communicationPanelProps: CommunicationPanelProps

  // Right drawer panel content map
  drawerPanelContent: Record<string, ReactNode>
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WorkplaceShell({
  matterId,
  tenantId,
  contextHeaderProps,
  centralSurfaceProps,
  communicationPanelProps,
  drawerPanelContent,
}: WorkplaceShellProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* Zone 1: Context Header (full width, fixed top) */}
        <ContextHeader {...contextHeaderProps} />

        {/* Main area: Z4 + Z2 + Z3 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Zone 4: Quick Access Rail */}
          <QuickAccessRail />

          {/* Zone 2: Central Action Surface */}
          <CentralActionSurface {...centralSurfaceProps} />

          {/* Zone 3: Communication Panel (hidden on small screens) */}
          <CommunicationPanel {...communicationPanelProps} />
        </div>

        {/* Zone 5: Right Drawer (overlay, triggered by Z4 rail) */}
        <RightDrawer panelContent={drawerPanelContent} />
      </div>
    </TooltipProvider>
  )
}
