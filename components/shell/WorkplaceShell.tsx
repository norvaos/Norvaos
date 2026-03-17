'use client'

/**
 * WorkplaceShell — 5-Zone Matter Layout
 *
 * The container that wraps every matter view in NorvaOS.
 * Composes Zones A–E per spec Section 3:
 *
 *   ┌───────────────────────────────────────────────────┐
 *   │  Zone A — Control Header (full width)             │
 *   ├───────────────────────────────────────────────────┤
 *   │  Zone B — Stage Rail (full width)                 │
 *   ├──────────┬───────────────────────────┬────────────┤
 *   │  Zone C  │  Zone D                   │  Zone E    │
 *   │  Left    │  Main Workspace (tabs)    │  Audit     │
 *   │  Rail    │                           │  Rail      │
 *   └──────────┴───────────────────────────┴────────────┘
 *
 * Zone C (left rail) and Zone E (audit rail) are independently collapsible.
 * Zone D (main workspace) expands to fill remaining width.
 *
 * Spec ref: Section 3 — Navigation & WorkplaceShell
 */

import { ZoneA } from './ZoneA'
import { ZoneB } from './ZoneB'
import { ZoneC } from './ZoneC'
import { ZoneD } from './ZoneD'
import { ZoneE } from './ZoneE'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkplaceShellProps {
  matter: Matter
  tenantId: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkplaceShell({ matter, tenantId }: WorkplaceShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* Zone A — Control Header */}
      <ZoneA matter={matter} tenantId={tenantId} />

      {/* Zone B — Stage Rail */}
      <ZoneB matterId={matter.id} tenantId={tenantId} matter={matter} />

      {/* Zones C / D / E — three-column content row */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Zone C — Left Rail */}
        <ZoneC matter={matter} tenantId={tenantId} />

        {/* Zone D — Main Workspace */}
        <ZoneD matter={matter} tenantId={tenantId} />

        {/* Zone E — Audit Rail */}
        <ZoneE matterId={matter.id} tenantId={tenantId} />

      </div>
    </div>
  )
}
