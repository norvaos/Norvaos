'use client'

/**
 * ConciergeShell — Directive 32.0: The Front Desk WorkplaceShell
 *
 * Replaces the legacy FrontDeskHeader layout with a structured concierge experience:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Operations Bar — shift, kiosk, notifications, avatar    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  AuraHeader — Polyglot Pulse + UniversalGlobeSelector    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  ActionTrident — 3-card intake funnel (Intake/Vault/     │
 *   │                  Portal)                                  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  {children} — operational console (schedule, tasks, etc) │
 *   └──────────────────────────────────────────────────────────┘
 *
 * The UniversalGlobeSelector lives inside AuraHeader and is always visible.
 * "If the Liaison doesn't see the Universal Globe Selector, the audit fails."
 */

import { type ReactNode } from 'react'
import { AuraHeader } from './AuraHeader'
import { ActionTrident } from './ActionTrident'
import { FrontDeskHeader } from './front-desk-header'

interface ConciergeShellProps {
  /** User ID for shift tracking */
  userId: string
  /** Display name */
  userName: string
  /** Avatar URL */
  avatarUrl: string | null
  /** Firm name for header */
  firmName: string
  /** Operational console content */
  children: ReactNode
}

export function ConciergeShell({
  userId,
  userName,
  avatarUrl,
  firmName,
  children,
}: ConciergeShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Operations Bar — shift controls, kiosk, notifications, avatar */}
      <FrontDeskHeader
        userId={userId}
        userName={userName}
        avatarUrl={avatarUrl}
        firmName={firmName}
      />

      {/* AuraHeader — Polyglot Pulse with UniversalGlobeSelector (Directive 32.0 §1) */}
      <div className="px-4 pt-4 max-w-[1600px] mx-auto w-full">
        <AuraHeader />
      </div>

      {/* ActionTrident — 3-card intake funnel (Directive 32.0 §2) */}
      <div className="px-4 pt-4 max-w-[1600px] mx-auto w-full">
        <ActionTrident
          intakeHref="/intake/start"
          vaultHref="/front-desk#quick-create-zone"
          portalHref="/intake/start"
        />
      </div>

      {/* Main content — operational console */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
