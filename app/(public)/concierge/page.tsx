'use client'

/**
 * Front Desk Concierge — The Ghost-Receptionist (Directives 32.0 + 33.0)
 *
 * Zero-friction public entry point. No authentication required.
 * Three actions:
 *   A. Start Journey → app/(public)/intake/start (new ClientSession with language)
 *   B. Vault Drop    → app/(public)/concierge/vault (instant-hash document upload)
 *   C. Portal Access → app/(auth)/login (biometric handshake if session cookie exists)
 *
 * Page load budget: < 500ms to interactive.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuraHeader } from '@/components/front-desk/AuraHeader'
import { ActionTrident } from '@/components/front-desk/ActionTrident'
import { NorvaLogo } from '@/components/landing/norva-logo'
import { cn } from '@/lib/utils'

export default function ConciergePage() {
  const router = useRouter()
  const [hasPreviousSession, setHasPreviousSession] = useState(false)

  // Directive 33.0 §C: Detect previous session cookie for biometric handshake
  useEffect(() => {
    try {
      const sbSession = document.cookie
        .split(';')
        .some(c => c.trim().startsWith('sb-') || c.trim().startsWith('supabase-auth'))
      setHasPreviousSession(sbSession)
    } catch {
      // Cookie access may fail in some environments
    }
  }, [])

  // Determine portal link based on session presence
  const portalHref = hasPreviousSession
    ? '/portal' // Direct to authenticated portal if session exists
    : '/login'  // Otherwise, standard login

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Directive 32.0 §1: Aura Header with polyglot cycle */}
      <AuraHeader />

      {/* Main content — centered with max-width */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Firm trust signal */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <NorvaLogo size={40} id="concierge" />
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              NorvaOS
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto text-balance">
            Your secure gateway to legal services. Choose an action below to get started.
          </p>
        </div>

        {/* Directive 32.0 §2: Action Trident */}
        <div className="w-full max-w-4xl">
          <ActionTrident
            intakeHref="/intake/start"
            vaultHref="/concierge/vault"
            portalHref={portalHref}
          />
        </div>

        {/* Security footer */}
        <div className="mt-12 text-center">
          <p className="text-[10px] text-muted-foreground/50 max-w-md mx-auto">
            All communications are encrypted. Your information is protected under
            solicitor-client privilege and Canadian privacy law (PIPEDA).
          </p>
        </div>
      </main>

      {/* Gold-pulse keyframe for Card A */}
      <style jsx global>{`
        @keyframes gold-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.15); }
          50% { box-shadow: 0 0 30px rgba(212, 175, 55, 0.3); }
        }
      `}</style>
    </div>
  )
}
