'use client'

/**
 * ToS Acceptance Modal  -  Directive 031: "Hard-Gate" Integration
 *
 * Before the Norva Sovereign Ignition can be triggered for a Pilot Firm,
 * this manifesto must be displayed. Requirements:
 *
 *   1. "Accept" button disabled for 10 seconds to force scroll-through
 *   2. On accept → SHA-256 hash of user_id + timestamp + tos_version
 *   3. Hash stored in firm_global_audit_ledger as Block 0 (first entry)
 *
 * This ToS is the final piece of the "Fortress."
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Shield,
  Lock,
  CheckCircle2,
  Loader2,
  FileText,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── ToS Version ─────────────────────────────────────────────────────────────

const TOS_VERSION = '1.0.0'
const TOS_LOCKOUT_SECONDS = 10

// ── ToS Content ─────────────────────────────────────────────────────────────

const TOS_SECTIONS = [
  {
    title: '1. Platform Access and Licence',
    content: `By accepting these Terms of Service ("ToS"), the Principal Lawyer ("You") acknowledges that NorvaOS is a compliance-critical platform designed to operate within the regulatory framework of the Law Society of Ontario (LSO) and the Immigration and Refugee Protection Act (IRPA). Your firm is granted a non-exclusive, non-transferable licence to use NorvaOS for the duration of your active subscription.`,
  },
  {
    title: '2. Data Sovereignty and Immutability',
    content: `All data processed by NorvaOS is stored exclusively within Canadian data centres (ca-central-1) in compliance with PIPEDA. The immutable ledger (SHA-256 hash chain) cannot be modified, deleted, or tampered with by any user, including platform administrators. Any attempt to alter immutable records will be logged as a SENTINEL security breach event and may result in immediate platform suspension.`,
  },
  {
    title: '3. Trust Accounting Compliance',
    content: `NorvaOS enforces LSO Rule 3.7 (Trust Accounting) through automated three-way reconciliation, zero-balance closing verification, and immutable audit trails. The platform does NOT constitute legal or accounting advice. The Principal Lawyer retains full responsibility for trust fund management, regulatory filings, and LSO compliance. NorvaOS is a tool  -  not a substitute for professional judgement.`,
  },
  {
    title: '4. Genesis Block and Compliance Seal',
    content: `The Genesis Block is an immutable compliance seal generated for each matter. Once sealed, it cannot be revoked, modified, or regenerated. The three-pillar compliance assessment (Conflict Check, KYC Verification, Retainer Status) is computed at the time of genesis and reflects the state of the matter at that moment. Changes after genesis do not retroactively alter the seal.`,
  },
  {
    title: '5. Mathematical Finality Clause',
    content: `YOU ACKNOWLEDGE AND AGREE THAT: (a) The SHA-256 hash chains used by NorvaOS provide mathematical certainty of data integrity  -  any single-bit change to the source data produces a completely different hash, making tampering detectable. (b) The HMAC-SHA256 Global Firm Hash is a cryptographic proof that the entire firm's compliance state is verifiable at any point in time. (c) These cryptographic guarantees are bounded by the correctness of the input data  -  the platform verifies integrity, not truth. (d) In the event of a regulatory examination, the Forensic Export PDF (password-protected, hash-chained) serves as a prima facie record of the firm's compliance posture at the time of generation. (e) NorvaOS does not guarantee any particular outcome in regulatory proceedings. The platform provides verifiable evidence  -  interpretation and defence remain the responsibility of legal counsel.`,
  },
  {
    title: '6. Emergency Override Protocol',
    content: `The Emergency Override system allows a Partner-level user to bypass certain hard-gates (e.g., trust overdraft, deadline override) using a secure PIN. Every override action is: (a) logged to the immutable SENTINEL audit trail with CRITICAL severity, (b) hashed with HMAC-SHA256 as immutable proof, and (c) irreversible  -  once an override is executed, it cannot be undone. Misuse of the Emergency Override system may constitute a regulatory violation and is the sole responsibility of the authorising Partner.`,
  },
  {
    title: '7. Limitation of Liability',
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, NORVAOS AND ITS DEVELOPERS SHALL NOT BE LIABLE FOR: (a) Any regulatory penalties, fines, or sanctions imposed by the LSO, IRCC, or any other governing body. (b) Any loss of client funds, missed deadlines, or data entry errors attributable to user input. (c) Any indirect, consequential, or punitive damages arising from platform use. (d) Service interruptions due to force majeure, third-party infrastructure failures, or scheduled maintenance. The total aggregate liability of NorvaOS shall not exceed the fees paid by the firm in the twelve (12) months preceding the claim.`,
  },
  {
    title: '8. Acceptance and Digital Signature',
    content: `By clicking "Accept and Seal," you confirm that: (a) You are the Principal Lawyer or an authorised Partner of the firm. (b) You have read, understood, and agree to be bound by these Terms of Service. (c) You consent to the generation of a SHA-256 digital signature hash (user_id + timestamp + tos_version) that will be permanently recorded as Block 0 in your firm's Global Audit Ledger. (d) This acceptance is irrevocable and constitutes a binding agreement between you and NorvaOS.`,
  },
]

// ── SHA-256 Hash (Browser-Side) ─────────────────────────────────────────────

async function generateTosHash(userId: string, timestamp: string, version: string): Promise<string> {
  const payload = `${userId}:${timestamp}:${version}`
  const encoder = new TextEncoder()
  const data = encoder.encode(payload)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Check if ToS already accepted ───────────────────────────────────────────

function useTosAcceptance(tenantId: string) {
  return useQuery({
    queryKey: ['tos-acceptance', tenantId, TOS_VERSION],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('firm_global_audit_ledger')
        .select('id, details')
        .eq('tenant_id', tenantId)
        .eq('event_type', 'TOS_ACCEPTED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const version = data?.details?.tos_version
      return {
        accepted: version === TOS_VERSION,
        entry: data,
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 10,
  })
}

// ── Accept ToS Mutation ─────────────────────────────────────────────────────

function useAcceptTos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tenantId }: { tenantId: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const timestamp = new Date().toISOString()
      const signatureHash = await generateTosHash(user.id, timestamp, TOS_VERSION)

      // Store as Block 0 in firm_global_audit_ledger
      const { error } = await (supabase as any)
        .from('firm_global_audit_ledger')
        .insert({
          tenant_id: tenantId,
          event_type: 'TOS_ACCEPTED',
          severity: 'info',
          details: {
            tos_version: TOS_VERSION,
            accepted_by: user.id,
            accepted_at: timestamp,
            signature_hash: signatureHash,
            block_number: 0,
            mathematical_finality: true,
          },
        })

      if (error) throw error

      return { signatureHash, timestamp }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tos-acceptance', variables.tenantId] })
    },
  })
}

// ── Component ───────────────────────────────────────────────────────────────

interface TosAcceptanceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  onAccepted?: () => void
}

export function TosAcceptanceModal({
  open,
  onOpenChange,
  tenantId,
  onAccepted,
}: TosAcceptanceModalProps) {
  const [countdown, setCountdown] = useState(TOS_LOCKOUT_SECONDS)
  const [hasScrolled, setHasScrolled] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const acceptTos = useAcceptTos()

  // Start countdown when modal opens
  useEffect(() => {
    if (!open) {
      setCountdown(TOS_LOCKOUT_SECONDS)
      setHasScrolled(false)
      return
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [open])

  // Track scroll to bottom
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (atBottom) setHasScrolled(true)
  }, [])

  const canAccept = countdown === 0 && hasScrolled && !acceptTos.isPending
  const isLocked = countdown > 0

  const handleAccept = useCallback(async () => {
    if (!canAccept) return
    await acceptTos.mutateAsync({ tenantId })
    onAccepted?.()
    onOpenChange(false)
  }, [canAccept, acceptTos, tenantId, onAccepted, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-violet-600" />
            NorvaOS Terms of Service
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Version {TOS_VERSION}
            </Badge>
            <span>Read the full agreement before accepting</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable ToS Content */}
        <ScrollArea
          className="flex-1 max-h-[50vh] rounded-lg border p-4"
          ref={scrollRef as any}
          onScrollCapture={handleScroll}
        >
          <div className="space-y-6 pr-4">
            {TOS_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="font-bold text-sm text-foreground mb-2">
                  {section.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              </div>
            ))}

            {/* Scroll target marker */}
            <div className="pt-4 border-t">
              <p className="text-xs text-center text-muted-foreground italic">
                 -  End of Terms of Service  - 
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground py-2">
          <div className="flex items-center gap-1.5">
            {isLocked ? (
              <Lock className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span>
              {isLocked
                ? `Lockout: ${countdown}s remaining`
                : 'Lockout period complete'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!hasScrolled ? (
              <FileText className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span>
              {hasScrolled ? 'Full document reviewed' : 'Scroll to bottom required'}
            </span>
          </div>
        </div>

        {/* Acceptance signature preview */}
        {acceptTos.isSuccess && acceptTos.data && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold text-sm">Signature Hash Sealed</span>
            </div>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-mono break-all">
              {acceptTos.data.signatureHash}
            </p>
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            size="sm"
            disabled={!canAccept}
            onClick={handleAccept}
            className={cn(
              canAccept
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white border-0'
                : 'bg-gradient-to-r from-violet-600/60 to-purple-600/60 text-white/70 border-0',
            )}
          >
            {acceptTos.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : isLocked ? (
              <Lock className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Shield className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isLocked
              ? `Accept and Seal (${countdown}s)`
              : acceptTos.isPending
                ? 'Sealing...'
                : 'Accept and Seal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Export hook for external use ─────────────────────────────────────────────

export { useTosAcceptance, TOS_VERSION }
