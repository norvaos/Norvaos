'use client'

import { useState } from 'react'
import { Shield, Loader2, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getGateStatusConfig } from './lead-workflow-helpers'
import type { GateResult, PracticeArea, UserRow } from './lead-workflow-types'

// ─── Gate Icon Map ──────────────────────────────────────────────────────────

const GATE_ICONS: Record<string, React.ElementType> = {
  'check-circle-2': CheckCircle2,
  'x-circle': XCircle,
  'minus-circle': MinusCircle,
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ConvertLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canConvert: boolean
  gateResults: GateResult[]
  blockedReasons: string[]
  isGatesLoading?: boolean
  practiceAreas?: PracticeArea[]
  users?: UserRow[]
  defaultTitle?: string
  defaultPracticeAreaId?: string
  defaultResponsibleLawyerId?: string
  onConfirm: (data: {
    title: string
    description?: string
    practiceAreaId?: string
    responsibleLawyerId?: string
    billingType?: string
    priority?: string
  }) => void
  isSubmitting?: boolean
}

export function ConvertLeadDialog({
  open,
  onOpenChange,
  canConvert,
  gateResults,
  blockedReasons,
  isGatesLoading = false,
  practiceAreas = [],
  users = [],
  defaultTitle = '',
  defaultPracticeAreaId,
  defaultResponsibleLawyerId,
  onConfirm,
  isSubmitting = false,
}: ConvertLeadDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [practiceAreaId, setPracticeAreaId] = useState(defaultPracticeAreaId ?? '')
  const [responsibleLawyerId, setResponsibleLawyerId] = useState(defaultResponsibleLawyerId ?? '')
  const [billingType, setBillingType] = useState('flat_fee')
  const [priority, setPriority] = useState('medium')

  const canSubmit = canConvert && title.trim().length > 0 && !isSubmitting && !isGatesLoading

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm({
      title: title.trim(),
      description: description.trim() || undefined,
      practiceAreaId: practiceAreaId || undefined,
      responsibleLawyerId: responsibleLawyerId || undefined,
      billingType,
      priority,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Convert to Matter
          </DialogTitle>
          <DialogDescription>
            Create an active matter from this lead. All conversion gates must pass before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
          {/* Gate Checklist */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Conversion Gates
            </Label>
            {isGatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Evaluating gates...
              </div>
            ) : (
              <div className="space-y-1">
                {gateResults.map((gate) => {
                  const config = getGateStatusConfig(gate.passed, gate.enabled)
                  const GateIcon = GATE_ICONS[config.iconName] ?? MinusCircle

                  return (
                    <div key={gate.gate} className="flex items-start gap-2 py-0.5">
                      <GateIcon className={`h-4 w-4 shrink-0 mt-0.5 ${config.iconClass}`} />
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm ${gate.enabled ? '' : 'text-muted-foreground'}`}>
                          {gate.label}
                        </span>
                        {gate.reason && !gate.passed && gate.enabled && (
                          <p className="text-xs text-red-500">{gate.reason}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Blocked summary */}
            {!canConvert && blockedReasons.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mt-2">
                <p className="text-xs font-medium text-red-700 mb-1">Cannot convert</p>
                <ul className="space-y-0.5">
                  {blockedReasons.map((r, i) => (
                    <li key={i} className="text-xs text-red-600">• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Matter creation form — only shown when gates pass */}
          {canConvert && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Matter Details
              </Label>

              {/* Title */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Matter Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Immigration Application – Smith"
                  className="text-sm"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the matter..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              {/* Practice Area */}
              {practiceAreas.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Practice Area</Label>
                  <Select value={practiceAreaId} onValueChange={setPracticeAreaId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select practice area..." />
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
              )}

              {/* Responsible Lawyer */}
              {users.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Responsible Lawyer</Label>
                  <Select value={responsibleLawyerId} onValueChange={setResponsibleLawyerId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select lawyer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Billing Type + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Billing Type</Label>
                  <Select value={billingType} onValueChange={setBillingType}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat_fee">Flat Fee</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="contingency">Contingency</SelectItem>
                      <SelectItem value="retainer">Retainer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              'Create Matter'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
