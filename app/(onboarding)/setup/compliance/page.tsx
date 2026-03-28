'use client'

/**
 * First-Mile Onboarding  -  Compliance Setup
 *
 * Distraction-free, mandatory setup. No sidebar, no header.
 * User selects their province → Law Society auto-resolves → tax defaults set.
 * On success: sample lead is created, success feedback, redirect to dashboard.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import {
  Scale,
  ShieldCheck,
  ArrowRight,
  Loader2,
  ScanLine,
  Landmark,
  FileCheck2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  REGULATORY_BODIES,
  resolveRegulatoryBody,
  type RegulatoryBodyDef,
} from '@/lib/config/jurisdictions'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Tax defaults by province ──────────────────────────────────────────────────
const TAX_DEFAULTS: Record<string, { rate: number; type: string }> = {
  ON: { rate: 13, type: 'HST' },
  BC: { rate: 12, type: 'GST+PST' },
  AB: { rate: 5, type: 'GST' },
  SK: { rate: 11, type: 'GST+PST' },
  MB: { rate: 12, type: 'GST+PST' },
  QC: { rate: 14.975, type: 'GST+QST' },
  NB: { rate: 15, type: 'HST' },
  NS: { rate: 15, type: 'HST' },
  PE: { rate: 15, type: 'HST' },
  NL: { rate: 15, type: 'HST' },
  NT: { rate: 5, type: 'GST' },
  NU: { rate: 5, type: 'GST' },
  YT: { rate: 5, type: 'GST' },
  // Federal bodies default to firm's address province (fallback ON)
  CICC: { rate: 13, type: 'HST' },
}

function getTaxForBody(body: RegulatoryBodyDef | null): { rate: number; type: string } {
  if (!body) return { rate: 0, type: '' }
  const key = body.provinceCode ?? body.code
  return TAX_DEFAULTS[key] ?? TAX_DEFAULTS['ON']
}

// ── Success State Component ───────────────────────────────────────────────────

function SuccessState({ body, tax }: { body: RegulatoryBodyDef; tax: { rate: number; type: string } }) {
  return (
    <div className="w-full max-w-xl space-y-8 text-center">
      {/* Animated success icon */}
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-950/40 animate-in zoom-in-50 duration-500">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
      </div>

      <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        <h1 className="text-3xl font-bold tracking-tight text-emerald-400">
          System Ready
        </h1>
        <p className="text-lg text-muted-foreground">
          {body.abbr} Protocols Engaged. Tax Engine Set to {tax.rate}% {tax.type}.
        </p>
      </div>

      <div className="mx-auto max-w-sm rounded-lg border border-emerald-500/20 bg-emerald-950/30/80 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
          {body.name}  -  Compliance Active
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-in fade-in duration-500 delay-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your workspace…
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ComplianceSetupPage() {
  const router = useRouter()
  const { tenant, refreshTenant } = useTenant()
  const [selectedBody, setSelectedBody] = useState<string>('')
  const [setupComplete, setSetupComplete] = useState(false)

  const resolved = resolveRegulatoryBody(selectedBody)
  const tax = getTaxForBody(resolved)
  const federalBodies = REGULATORY_BODIES.filter((b) => b.scope === 'federal')
  const provincialBodies = REGULATORY_BODIES.filter((b) => b.scope === 'provincial')

  // If tenant already has home_province set, redirect to dashboard
  useEffect(() => {
    if (tenant?.home_province && !setupComplete) {
      router.replace('/')
    }
  }, [tenant?.home_province, setupComplete, router])

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save the regulatory body
      const res = await fetch('/api/settings/firm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_province: selectedBody }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }

      // 2. Create sample lead (non-blocking  -  fire and forget errors)
      try {
        await fetch('/api/setup/sample-lead', { method: 'POST' })
      } catch {
        // Non-fatal
      }
    },
    onSuccess: async () => {
      await refreshTenant()
      setSetupComplete(true)

      // Show success toast
      const bodyName = resolved?.abbr ?? 'Regulatory Body'
      toast.success(`${bodyName} Protocols Engaged`, {
        description: `Tax Engine set to ${tax.rate}% ${tax.type}. Your firm is now compliant.`,
        duration: 5000,
      })

      // Redirect to dashboard after success animation plays
      setTimeout(() => {
        router.replace('/')
      }, 2500)
    },
    onError: (error) => {
      toast.error('Failed to save.', { description: error.message })
    },
  })

  // ── Success State ─────────────────────────────────────────────────
  if (setupComplete && resolved) {
    return <SuccessState body={resolved} tax={tax} />
  }

  // ── Setup Form ────────────────────────────────────────────────────
  return (
    <Card className="w-full max-w-xl shadow-lg border-0 ring-1 ring-border/50">
      <CardContent className="p-8 sm:p-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Scale className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to NorvaOS
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Let&apos;s set your Regulatory Foundation.
            </p>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            To ensure your invoices, tax calculations, and AML reports are 100%
            compliant, we need to know which Law Society or College governs your practice.
          </p>
        </div>

        <Separator />

        {/* Regulatory Body Selector */}
        <div className="space-y-3">
          <label className="text-sm font-semibold">
            Where is your firm based? <span className="text-destructive">*</span>
          </label>
          <Select onValueChange={setSelectedBody} value={selectedBody || undefined}>
            <SelectTrigger className="w-full h-12 text-base">
              <SelectValue placeholder="Select your Law Society or College…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Federal</SelectLabel>
                {federalBodies.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name} ({b.abbr})
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Provincial</SelectLabel>
                {provincialBodies.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name} ({b.abbr})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Immigration consultants select CICC. Lawyers select their provincial Law Society.
          </p>
        </div>

        {/* Resolved Badge + Tax Preview */}
        {resolved && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30/80 px-4 py-4">
              <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-bold text-emerald-400">
                  {resolved.name} ({resolved.abbr})
                </p>
                <p className="text-xs text-emerald-400 leading-relaxed">
                  {resolved.scope === 'federal'
                    ? 'Federal regulatory body  -  applies across all provinces'
                    : resolved.description}
                </p>
              </div>
            </div>

            {/* Tax auto-detection */}
            <div className="flex items-center gap-2 rounded-md border bg-blue-950/30 border-blue-500/20 px-3 py-2.5">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-400">
                <strong>Tax Engine:</strong> Automatically set to{' '}
                <span className="font-bold">{tax.rate}% {tax.type}</span>{' '}
                based on your selection.
              </p>
            </div>
          </div>
        )}

        {/* What this unlocks */}
        <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            This unlocks
          </p>
          <div className="grid gap-2.5">
            <div className="flex items-center gap-2.5 text-sm text-foreground/80">
              <ScanLine className="h-4 w-4 text-primary shrink-0" />
              <span>ID Scanning &amp; OCR Auto-Fill</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-foreground/80">
              <Landmark className="h-4 w-4 text-primary shrink-0" />
              <span>Trust Accounting &amp; Tax Compliance</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-foreground/80">
              <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
              <span>AML Shielding &amp; Conflict Check Protocols</span>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <Button
          className="w-full h-12 text-base font-semibold"
          size="lg"
          disabled={!selectedBody || saveMutation.isPending || setupComplete}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Configuring…
            </>
          ) : (
            <>
              Continue to NorvaOS
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
          You can change this later in Settings → Firm, but it will impact tax
          calculations, audit trails, and compliance protocols.
        </p>
      </CardContent>
    </Card>
  )
}
