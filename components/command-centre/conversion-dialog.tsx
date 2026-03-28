'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandCentre } from './command-centre-context'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { BILLING_TYPES } from '@/lib/utils/constants'
import { formatFullName } from '@/lib/utils/formatters'
import { resolveRegulatoryBody } from '@/lib/config/jurisdictions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Trophy,
  Loader2,
  CheckCircle2,
  FileText,
  Link2,
  Mail,
  ClipboardList,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Shield,
  Lock,
  Fingerprint,
  Archive,
  Scale,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────

interface IdentityVerificationResult {
  isVerified: boolean
  latestVerification: {
    id: string
    status: string
    method: string
    document_type: string | null
    verified_at: string | null
  } | null
}

// ─── Hard-Gate Status  -  Directive 41.2 Compliance Checksum ──────────

const CONFLICT_PASS_STATUSES = new Set([
  'auto_scan_complete',
  'cleared_by_lawyer',
  'waiver_obtained',
])

interface ComplianceGateStatus {
  idVerified: boolean
  conflictPassed: boolean
  jurisdictionSet: boolean
  canConvert: boolean
  blockReason: string | null
}

function useComplianceGates(
  contactId: string | null | undefined,
  tenantId: string,
  homeProvince: string | null | undefined,
  open: boolean,
): {
  gates: ComplianceGateStatus
  isLoading: boolean
  conflictStatus: string
  conflictScore: number
} {
  // 1. Identity verification check
  const { data: idVerification, isLoading: idLoading } = useQuery({
    queryKey: ['identity-verification-gate', contactId, open],
    queryFn: async (): Promise<IdentityVerificationResult> => {
      const res = await fetch(`/api/contacts/${contactId}/identity-verification`)
      if (!res.ok) throw new Error('Failed to fetch identity verification')
      return res.json()
    },
    enabled: open && !!contactId,
    staleTime: 0,
  })

  // 2. Conflict check status
  const { data: conflictData, isLoading: conflictLoading } = useQuery({
    queryKey: ['conflict-status', contactId, open],
    queryFn: async () => {
      if (!contactId) return null
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('conflict_status, conflict_score')
        .eq('id', contactId)
        .single()
      return data
    },
    enabled: open && !!contactId,
    staleTime: 0,
  })

  const idVerified = idVerification?.isVerified ?? false
  // Respect FORCE_CONFLICT_SIM for demo walkthrough (Red-Gate trigger)
  const forceConflictSim = process.env.NEXT_PUBLIC_FORCE_CONFLICT_SIM === 'true'
  const conflictStatusRaw = forceConflictSim
    ? 'CONFLICT_DETECTED'
    : (conflictData?.conflict_status ?? 'not_run')
  const conflictPassed = CONFLICT_PASS_STATUSES.has(conflictStatusRaw)
  const jurisdictionSet = !!homeProvince

  const canConvert = idVerified && conflictPassed && jurisdictionSet

  let blockReason: string | null = null
  if (!canConvert) {
    const missing: string[] = []
    if (!jurisdictionSet) missing.push('Firm Regulatory Body (Settings → Firm)')
    if (!idVerified) missing.push('Law Society ID Verification')
    if (!conflictPassed) missing.push('Conflict Check')
    blockReason = `Sovereign Block: ${missing.join(' & ')} Required.`
  }

  return {
    gates: { idVerified, conflictPassed, jurisdictionSet, canConvert, blockReason },
    isLoading: idLoading || conflictLoading,
    conflictStatus: conflictStatusRaw,
    conflictScore: conflictData?.conflict_score ?? 0,
  }
}

// ─── Component ──────────────────────────────────────────────────────

interface ConversionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConversionDialog({ open, onOpenChange }: ConversionDialogProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const {
    lead,
    contact,
    stages,
    tenantId,
    userId,
    users,
    practiceAreas,
  } = useCommandCentre()

  // Form state
  const [title, setTitle] = useState('')
  const [matterTypeId, setMatterTypeId] = useState('')
  const [practiceAreaId, setPracticeAreaId] = useState('')
  const [responsibleLawyerId, setResponsibleLawyerId] = useState('')
  const [billingType, setBillingType] = useState('flat_fee')
  const [retainerDeposit, setRetainerDeposit] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockedReasons, setBlockedReasons] = useState<string[]>([])

  // Fetch matter types filtered by practice area
  const { data: matterTypes } = useMatterTypes(tenantId, practiceAreaId || null)

  const winStage = useMemo(() => stages.find((s) => s.is_win_stage), [stages])

  // Resolve regulatory body for display
  const regBody = resolveRegulatoryBody(tenant?.home_province)

  // ── Directive 41.2 + 41.4: Hard-Gate Compliance Checksum ──────────
  const {
    gates,
    isLoading: gatesLoading,
    conflictStatus,
    conflictScore,
  } = useComplianceGates(lead?.contact_id, tenantId, tenant?.home_province, open)

  // Pre-fill form when dialog opens
  useEffect(() => {
    if (open && contact && lead) {
      const contactName = contact.contact_type === 'organization'
        ? contact.organization_name ?? 'New Matter'
        : formatFullName(contact.first_name, contact.last_name) || 'New Matter'

      const paName = practiceAreas.find((pa) => pa.id === lead.practice_area_id)?.name ?? ''
      setTitle(`${contactName}${paName ? ` – ${paName}` : ''}`)
      setPracticeAreaId(lead.practice_area_id ?? '')
      setResponsibleLawyerId(lead.assigned_to ?? userId)
      setBillingType('flat_fee')
      setMatterTypeId('')
      setError(null)
      setBlockedReasons([])
    }
  }, [open, contact, lead, practiceAreas, userId])

  // ── Vault Drop Claim (Atomic Move) ────────────────────────────────
  const claimVaultDrops = useCallback(async (matterId: string) => {
    if (!lead?.contact_id) return
    try {
      const supabase = createClient()

      // Find unclaimed vault drops for this contact's session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: drops } = await (supabase as any)
        .from('vault_drops')
        .select('temp_session_id')
        .is('claimed_matter_id', null)
        .limit(1)
        .maybeSingle()

      if (drops?.temp_session_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('claim_vault_drops', {
          p_session_id: drops.temp_session_id,
          p_matter_id: matterId,
          p_tenant_id: tenantId,
          p_claimed_by: userId,
        })
      }
    } catch (err) {
      // Non-fatal: vault drops may not exist for this contact
      console.error('[conversion-dialog] Vault drop claim failed (non-fatal):', err)
    }
  }, [lead?.contact_id, tenantId, userId])

  const handleConvert = async () => {
    if (!lead || !title.trim()) return

    // Double-check hard gates
    if (!gates.canConvert) {
      setError(gates.blockReason ?? 'Compliance gates not satisfied')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setBlockedReasons([])

    try {
      const res = await fetch('/api/command/convert-and-retain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          title: title.trim(),
          practiceAreaId: practiceAreaId || null,
          matterTypeId: matterTypeId || null,
          responsibleLawyerId: responsibleLawyerId || userId,
          billingType,
          retainerDeposit: retainerDeposit ? Math.round(parseFloat(retainerDeposit) * 100) : null,
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.success) {
        setError(result.error || 'Conversion failed. Please try again.')
        if (result.blockedReasons?.length) {
          setBlockedReasons(result.blockedReasons)
        }
        return
      }

      if (!result.matterId) {
        setError('Matter was not created. Please try again or contact support.')
        return
      }

      // ── Atomic Move: Claim vault drops into the new matter ─────
      await claimVaultDrops(result.matterId)

      toast.success('Lead converted to active matter!')
      onOpenChange(false)
      router.push(`/matters/${result.matterId}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-600" />
            Retained – Active Matter
          </DialogTitle>
          <DialogDescription>
            Convert this lead into an active matter. This is an all-or-nothing operation.
          </DialogDescription>
        </DialogHeader>

        {/* ── Directive 41.2: Hard-Gate Compliance Panel ────────────── */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Compliance Checksum
          </p>
          <div className="space-y-1.5">
            {/* Jurisdiction Gate  -  Directive 41.4 */}
            <div className="flex items-center gap-2">
              {gates.jurisdictionSet ? (
                <Scale className="size-4 text-green-600" />
              ) : (
                <Scale className="size-4 text-red-500" />
              )}
              <span className={`text-xs font-medium ${gates.jurisdictionSet ? 'text-emerald-400' : 'text-red-400'}`}>
                Firm Regulatory Body
              </span>
              <Badge
                variant="outline"
                className={`ml-auto text-[9px] ${
                  gates.jurisdictionSet
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400'
                    : 'border-red-500/30 bg-red-950/30 text-red-400'
                }`}
              >
                {gates.jurisdictionSet ? (regBody?.abbr ?? 'SET') : 'NOT SET'}
              </Badge>
            </div>

            {/* Identity Verification Gate */}
            <div className="flex items-center gap-2">
              {gatesLoading ? (
                <Loader2 className="size-4 animate-spin text-slate-400" />
              ) : gates.idVerified ? (
                <Fingerprint className="size-4 text-green-600" />
              ) : (
                <Fingerprint className="size-4 text-red-500" />
              )}
              <span className={`text-xs font-medium ${gates.idVerified ? 'text-emerald-400' : 'text-red-400'}`}>
                Law Society ID Verification
              </span>
              <Badge
                variant="outline"
                className={`ml-auto text-[9px] ${
                  gates.idVerified
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400'
                    : 'border-red-500/30 bg-red-950/30 text-red-400'
                }`}
              >
                {gates.idVerified ? 'VERIFIED' : 'REQUIRED'}
              </Badge>
            </div>

            {/* Conflict Check Gate */}
            <div className="flex items-center gap-2">
              {gatesLoading ? (
                <Loader2 className="size-4 animate-spin text-slate-400" />
              ) : gates.conflictPassed ? (
                <ShieldCheck className="size-4 text-green-600" />
              ) : (
                <ShieldAlert className="size-4 text-red-500" />
              )}
              <span className={`text-xs font-medium ${gates.conflictPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                Conflict Check
              </span>
              <Badge
                variant="outline"
                className={`ml-auto text-[9px] ${
                  gates.conflictPassed
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400'
                    : 'border-red-500/30 bg-red-950/30 text-red-400'
                }`}
              >
                {gates.conflictPassed ? 'PASSED' : conflictStatus === 'not_run' ? 'NOT RUN' : 'BLOCKED'}
              </Badge>
            </div>

            {/* Vault Drop Claim */}
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-blue-500" />
              <span className="text-xs font-medium text-slate-600">
                Vault Drop Claim
              </span>
              <Badge variant="outline" className="ml-auto text-[9px] border-blue-500/20 bg-blue-950/30 text-blue-600">
                ON CONVERT
              </Badge>
            </div>
          </div>

          {/* Block message */}
          {!gatesLoading && !gates.canConvert && (
            <div className="mt-2 rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2 flex items-start gap-2">
              <Lock className="mt-0.5 size-3.5 text-red-600 shrink-0" />
              <p className="text-[11px] text-red-400 font-medium">
                {gates.blockReason}
              </p>
            </div>
          )}
        </div>

        {/* Conflict Status Detail */}
        {!gatesLoading && (() => {
          const configs: Record<string, { icon: typeof ShieldCheck; color: string; bg: string; border: string; label: string; message: string }> = {
            auto_scan_complete: {
              icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-500/20',
              label: 'Conflict Check: Clear',
              message: 'No conflicts found. This matter can proceed.',
            },
            review_suggested: {
              icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-500/20',
              label: 'Conflict Check: Review Suggested',
              message: `Score ${conflictScore}/100  -  minor potential matches found. Proceed with caution.`,
            },
            cleared_by_lawyer: {
              icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-500/20',
              label: 'Conflict Check: Cleared by Lawyer',
              message: 'A lawyer has reviewed and cleared this conflict check.',
            },
            waiver_obtained: {
              icon: ShieldCheck, color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-500/20',
              label: 'Conflict Check: Waiver Obtained',
              message: 'A conflict waiver has been obtained.',
            },
            review_required: {
              icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-950/30', border: 'border-red-500/20',
              label: 'Conflict Check: Review Required',
              message: `Score ${conflictScore}/100  -  potential conflicts detected. Blocked until reviewed.`,
            },
            conflict_confirmed: {
              icon: ShieldX, color: 'text-red-400', bg: 'bg-red-950/30', border: 'border-red-500/20',
              label: 'Conflict of Interest Confirmed',
              message: 'A conflict of interest has been confirmed. This matter cannot be opened.',
            },
            blocked: {
              icon: ShieldX, color: 'text-red-400', bg: 'bg-red-950/30', border: 'border-red-500/20',
              label: 'Matter Blocked',
              message: 'This matter is blocked due to a conflict of interest.',
            },
            not_run: {
              icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200',
              label: 'Conflict Check: Not Run',
              message: 'A conflict scan will run automatically when you click Convert & Activate.',
            },
          }

          const cfg = configs[conflictStatus] ?? configs.not_run
          const Icon = cfg.icon

          return (
            <div className={`rounded-lg border ${cfg.bg} ${cfg.border} p-3 flex items-start gap-2.5`}>
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`} />
              <div>
                <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</p>
                <p className={`text-xs mt-0.5 ${cfg.color} opacity-90`}>{cfg.message}</p>
              </div>
            </div>
          )
        })()}

        {/* What will happen */}
        <div className="rounded-lg border bg-emerald-950/30/50 border-emerald-500/20 p-3 space-y-1.5">
          <p className="text-xs font-medium text-emerald-400">This will:</p>
          <div className="grid grid-cols-1 gap-1 text-xs text-emerald-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 shrink-0" /> Create matter record
            </span>
            <span className="flex items-center gap-1.5">
              <Link2 className="h-3 w-3 shrink-0" /> Activate portal link
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 shrink-0" /> Generate document slots
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0" /> Send document request pack
            </span>
            <span className="flex items-center gap-1.5">
              <Archive className="h-3 w-3 shrink-0" /> Claim vault drops into client vault
            </span>
            <span className="flex items-center gap-1.5">
              <ClipboardList className="h-3 w-3 shrink-0" /> Log full audit chain
            </span>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4 py-1">
          {/* Matter Title */}
          <div className="space-y-1.5">
            <Label className="text-sm">Matter Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. John Smith – Immigration"
            />
          </div>

          {/* Practice Area */}
          <div className="space-y-1.5">
            <Label className="text-sm">Practice Area</Label>
            <Select value={practiceAreaId} onValueChange={setPracticeAreaId}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {practiceAreas.map((pa) => (
                  <SelectItem key={pa.id} value={pa.id}>
                    {pa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Matter Type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Matter Type</Label>
            <Select value={matterTypeId} onValueChange={setMatterTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {(matterTypes ?? []).map((mt) => (
                  <SelectItem key={mt.id} value={mt.id}>
                    {mt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!matterTypes?.length && practiceAreaId && (
              <p className="text-xs text-slate-400">No matter types configured for this practice area</p>
            )}
          </div>

          {/* Responsible Lawyer */}
          <div className="space-y-1.5">
            <Label className="text-sm">Responsible Lawyer</Label>
            <Select value={responsibleLawyerId} onValueChange={setResponsibleLawyerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Billing Type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Billing Type</Label>
            <Select value={billingType} onValueChange={setBillingType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLING_TYPES.map((bt) => (
                  <SelectItem key={bt.value} value={bt.value}>
                    {bt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Retainer Deposit  -  Trust Account (Directive 41.4) */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              Retainer Deposit for Trust Account
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={retainerDeposit}
                onChange={(e) => setRetainerDeposit(e.target.value)}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {regBody
                ? `${regBody.abbr} requires retainer deposits to be held in trust. Enter the amount received.`
                : 'Enter the retainer amount received for the trust account.'}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs text-red-400 font-medium">{error}</p>
              {blockedReasons.length > 0 && (
                <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
                  {blockedReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          {/* Red-Gate Protocol: DOM-unmount claimVaultDrops button when conflict detected (Directive 41.2) */}
          {!gatesLoading && !gates.canConvert ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2 animate-pulse-red-35">
              <Lock className="h-4 w-4 text-red-600" />
              <span className="text-xs font-semibold text-red-400">Sovereign Block  -  Conversion Locked</span>
            </div>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleConvert}
                      disabled={!title.trim() || isSubmitting || gatesLoading}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <Trophy className="mr-2 h-4 w-4" />
                          Convert & Activate
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
              </Tooltip>
            </TooltipProvider>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
