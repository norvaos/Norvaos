import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Check-In Kiosk',
  description: 'Client check-in kiosk',
}

/**
 * Kiosk Layout — fullscreen, no sidebar, touch-optimised.
 *
 * Rule #7: Kiosk token security is strict.
 * Rule #10: No app navigation exposed.
 *
 * This layout wraps all kiosk pages under /kiosk/[token]/*.
 * No sidebar, no header nav, no settings links. Purely self-contained.
 */
export default function KioskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {children}
    </div>
  )
}
