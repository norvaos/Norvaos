'use client'

/**
 * Suspension Overlay  -  Admin Command 001
 *
 * When a tenant's status is 'suspended', this full-screen overlay blocks
 * all interaction with a branded maintenance message.
 *
 * Checked on every page load via useTenantFeatures().
 * The God Dashboard can toggle this with the SUSPEND button.
 */

import { useEffect, useState } from 'react'
import { useTenantFeatures } from '@/components/ui/sovereign-feature-gate'
import { Shield, Lock } from 'lucide-react'

export function SuspensionOverlay() {
  const { data: config, isLoading } = useTenantFeatures()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isLoading && config && !config.is_active) {
      setShow(true)
    } else {
      setShow(false)
    }
  }, [config, isLoading])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background">
      {/* Subtle emerald glow */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-md text-center px-8">
        {/* Shield icon */}
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <Shield className="h-12 w-12 text-emerald-500" />
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
          The Fortress is in Maintenance
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          Your account access has been temporarily paused.
          Please contact the Principal to restore access.
        </p>

        {/* Lock indicator */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          <Lock className="h-3 w-3" />
          Account Suspended
        </div>

        {/* Contact */}
        <div className="mt-8 text-[10px] text-muted-foreground/50 uppercase tracking-[0.3em]">
          NorvaOS — Sovereign Platform
        </div>
      </div>
    </div>
  )
}
