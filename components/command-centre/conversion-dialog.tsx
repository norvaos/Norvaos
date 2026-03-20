'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandCentre } from './command-centre-context'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { BILLING_TYPES } from '@/lib/utils/constants'
import { formatFullName } from '@/lib/utils/formatters'
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
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Component ──────────────────────────────────────────────────────

interface ConversionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConversionDialog({ open, onOpenChange }: ConversionDialogProps) {
  const router = useRouter()
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockedReasons, setBlockedReasons] = useState<string[]>([])

  // Fetch matter types filtered by practice area
  const { data: matterTypes } = useMatterTypes(tenantId, practiceAreaId || null)

  const winStage = useMemo(() => stages.find((s) => s.is_win_stage), [stages])

  // Fetch conflict status for the lead's contact when dialog opens
  const { data: conflictStatus, isLoading: conflictLoading } = useQuery({
    queryKey: ['conflict-status', lead?.contact_id, open],
    queryFn: async () => {
      if (!lead?.contact_id) return null
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('conflict_status, conflict_score')
        .eq('id', lead.contact_id)
        .single()
      return data
    },
    enabled: open && !!lead?.contact_id,
    staleTime: 0,
  })

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

  const handleConvert = async () => {
    if (!lead || !title.trim()) return
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

        {/* Conflict Status */}
        {!conflictLoading && conflictStatus && (() => {
          const status = conflictStatus.conflict_status ?? 'not_run'
          const score = conflictStatus.conflict_score ?? 0

          const configs: Record<string, { icon: typeof ShieldCheck; color: string; bg: string; border: string; label: string; message: string }> = {
            auto_scan_complete: {
              icon: ShieldCheck, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
              label: 'Conflict Check: Clear',
              message: 'No conflicts found. This matter can proceed.',
            },
            review_suggested: {
              icon: ShieldAlert, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
              label: 'Conflict Check: Review Suggested',
              message: `Score ${score}/100 — minor potential matches found. Proceed with caution.`,
            },
            cleared_by_lawyer: {
              icon: ShieldCheck, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
              label: 'Conflict Check: Cleared by Lawyer',
              message: 'A lawyer has reviewed and cleared this conflict check.',
            },
            waiver_obtained: {
              icon: ShieldCheck, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
              label: 'Conflict Check: Waiver Obtained',
              message: 'A conflict waiver has been obtained.',
            },
            review_required: {
              icon: ShieldAlert, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
              label: 'Conflict Check: Review Required',
              message: `Score ${score}/100 — potential conflicts detected. This matter is blocked until a lawyer reviews the conflict check.`,
            },
            conflict_confirmed: {
              icon: ShieldX, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
              label: 'Conflict of Interest Confirmed',
              message: 'A conflict of interest has been confirmed. This matter cannot be opened.',
            },
            blocked: {
              icon: ShieldX, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
              label: 'Matter Blocked',
              message: 'This matter is blocked due to a conflict of interest.',
            },
            not_run: {
              icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200',
              label: 'Conflict Check: Not Run',
              message: 'A conflict scan will run automatically when you click Convert & Activate.',
            },
          }

          const cfg = configs[status] ?? configs.not_run
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
        <div className="rounded-lg border bg-green-50/50 border-green-200 p-3 space-y-1.5">
          <p className="text-xs font-medium text-green-800">This will:</p>
          <div className="grid grid-cols-1 gap-1 text-xs text-green-700">
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
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs text-red-700 font-medium">{error}</p>
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
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={handleConvert}
            disabled={!title.trim() || isSubmitting}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
