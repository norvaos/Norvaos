'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandCentre } from './command-centre-context'
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

  // Fetch matter types filtered by practice area
  const { data: matterTypes } = useMatterTypes(tenantId, practiceAreaId || null)

  const winStage = useMemo(() => stages.find((s) => s.is_win_stage), [stages])

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
    }
  }, [open, contact, lead, practiceAreas, userId])

  const handleConvert = async () => {
    if (!lead || !title.trim()) return
    setIsSubmitting(true)
    setError(null)

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
        return
      }

      toast.success('Lead converted to active matter!')
      onOpenChange(false)

      // Navigate to the new matter page
      if (result.matterId) {
        router.push(`/matters/${result.matterId}`)
      }
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
            <p className="text-xs text-red-700">{error}</p>
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
