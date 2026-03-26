'use client'

import { Scale } from 'lucide-react'

/**
 * Onboarding Layout  -  Minimal, distraction-free.
 * No sidebar, no header, no navigation. Just the setup flow.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Minimal top bar  -  brand only */}
      <div className="flex items-center gap-2 px-6 py-4">
        <Scale className="size-5 text-primary" />
        <span className="text-base font-bold tracking-tight">NorvaOS</span>
      </div>

      {/* Centred content */}
      <main className="flex items-center justify-center px-4 pb-12" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {children}
      </main>
    </div>
  )
}
