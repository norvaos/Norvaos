'use client'

import { useState, useCallback } from 'react'
import {
  Shield, Loader2, CheckCircle2, XCircle, MinusCircle,
  User, Mail, Phone, Globe, Calendar, Eye, EyeOff,
  Fingerprint, AlertTriangle, ShieldAlert,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
// Label removed — using raw <label> with obsidian glass styling
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getGateStatusConfig } from './lead-workflow-helpers'
import type { GateResult, PracticeArea, UserRow, Contact } from './lead-workflow-types'

// ─── PII Masking ──────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (value.length <= 4) return value
  return '\u2022'.repeat(value.length - 4) + value.slice(-4)
}

function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx <= 0) return '\u2022\u2022\u2022'
  return '\u2022'.repeat(Math.max(1, atIdx - 2)) + email.slice(atIdx - 2)
}

// ─── Contact Preview Panel ──────────────────────────────────────────────────

interface ContactPreviewProps {
  contact: Contact
}

function ContactPreviewPanel({ contact }: ContactPreviewProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const toggleReveal = useCallback((field: string) => {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }, [])

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed'

  // Extract immigration data for sensitive fields
  const immData = (() => {
    if (contact.immigration_data && typeof contact.immigration_data === 'object') {
      return contact.immigration_data as Record<string, string | undefined>
    }
    if (contact.custom_fields && typeof contact.custom_fields === 'object') {
      const cf = contact.custom_fields as Record<string, unknown>
      return {
        uci: cf.uci as string | undefined,
        passport_number: cf.passport_number as string | undefined,
      }
    }
    return {}
  })()

  const rows: { key: string; icon: React.ElementType; label: string; value: string; sensitive?: boolean }[] = []

  // Name  -  always visible
  rows.push({ key: 'name', icon: User, label: 'Name', value: fullName })

  // Email  -  masked by default
  if (contact.email_primary) {
    rows.push({ key: 'email', icon: Mail, label: 'Email', value: contact.email_primary, sensitive: true })
  }

  // Phone  -  masked by default
  if (contact.phone_primary) {
    rows.push({ key: 'phone', icon: Phone, label: 'Phone', value: contact.phone_primary, sensitive: true })
  }

  // Nationality
  if (contact.nationality) {
    rows.push({ key: 'nationality', icon: Globe, label: 'Nationality', value: contact.nationality })
  }

  // Date of birth  -  masked
  if (contact.date_of_birth) {
    rows.push({ key: 'dob', icon: Calendar, label: 'Date of Birth', value: contact.date_of_birth, sensitive: true })
  }

  // UCI  -  always masked
  if (immData.uci) {
    rows.push({ key: 'uci', icon: Fingerprint, label: 'UCI', value: immData.uci, sensitive: true })
  }

  // Passport  -  always masked
  if (immData.passport_number) {
    rows.push({ key: 'passport', icon: Shield, label: 'Passport', value: immData.passport_number, sensitive: true })
  }

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
        Contact Record Preview
      </label>
      <p className="text-[10px] font-mono text-zinc-500">
        This contact will be linked to the new matter as the principal applicant.
      </p>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.06]">
        {rows.map(row => {
          const isRevealed = revealed.has(row.key)
          const Icon = row.icon
          const displayValue = row.sensitive && !isRevealed
            ? (row.key === 'email' ? maskEmail(row.value) : maskValue(row.value))
            : row.value

          return (
            <div key={row.key} className="flex items-center gap-2 px-3 py-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="text-[10px] font-mono font-medium text-zinc-500 w-20 shrink-0 uppercase tracking-wider">
                {row.label}
              </span>
              <span className={`text-xs flex-1 truncate text-white ${row.sensitive && !isRevealed ? 'font-mono tracking-wider text-zinc-400' : 'font-sans'}`}>
                {displayValue}
              </span>
              {row.sensitive && (
                <button
                  type="button"
                  onClick={() => toggleReveal(row.key)}
                  className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-white transition-colors"
                  aria-label={isRevealed ? `Hide ${row.label}` : `Reveal ${row.label}`}
                >
                  {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 403 Sentinel Error Banner ──────────────────────────────────────────────

function SentinelErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-950/30 border border-red-800/50 px-3 py-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono uppercase tracking-wider text-red-400">
            Access Denied
          </p>
          <p className="text-xs text-red-400/80 mt-0.5 font-mono">
            {message}
          </p>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
            Contact your administrator if you believe this is an error.
          </p>
        </div>
      </div>
    </div>
  )
}

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
  /** Contact record for PII-masked preview */
  contact?: Contact | null
  onConfirm: (data: {
    title: string
    description?: string
    practiceAreaId?: string
    responsibleLawyerId?: string
    billingType?: string
    priority?: string
  }) => void
  isSubmitting?: boolean
  /** Sentinel/permission error from a failed conversion attempt */
  conversionError?: string | null
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
  contact,
  onConfirm,
  isSubmitting = false,
  conversionError,
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
      <DialogContent
        className="sm:max-w-lg border-white/[0.08] shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.96) 100%)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">
              Retainer Verified
            </span>
          </div>
          <DialogTitle className="flex items-center gap-2 text-white font-sans font-bold tracking-tight">
            <Shield className="h-5 w-5 text-emerald-400" />
            Initialise Matter
          </DialogTitle>
          <p className="text-sm font-mono text-zinc-400 mt-1">
            All conversion gates must pass before matter creation.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
          {/* 403 Sentinel Error Banner */}
          {conversionError && (
            <SentinelErrorBanner message={conversionError} />
          )}

          {/* Contact Preview Panel  -  PII-masked */}
          {contact && (
            <ContactPreviewPanel contact={contact} />
          )}

          {/* Gate Checklist */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Conversion Gates
            </label>
            {isGatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
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
              <div className="rounded-lg bg-red-950/20 border border-red-800/40 px-3 py-2 mt-2">
                <p className="text-[11px] font-mono font-medium text-red-400 uppercase tracking-wider mb-1">Cannot convert</p>
                <ul className="space-y-0.5">
                  {blockedReasons.map((r, i) => (
                    <li key={i} className="text-xs font-mono text-red-400/80">• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Matter creation form  -  only shown when gates pass */}
          {canConvert && (
            <div className="space-y-4 border-t border-white/[0.06] pt-4">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                Matter Configuration
              </label>

              {/* Title */}
              <div className="space-y-1">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Matter Title <span className="text-red-400">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Immigration Application – Smith"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the matter..."
                  rows={2}
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-sans resize-none focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>

              {/* Practice Area */}
              {practiceAreas.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">Practice Area</label>
                  <Select value={practiceAreaId} onValueChange={setPracticeAreaId}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
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
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">Responsible Lawyer</label>
                  <Select value={responsibleLawyerId} onValueChange={setResponsibleLawyerId}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
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
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">Billing Type</label>
                  <Select value={billingType} onValueChange={setBillingType}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
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
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">Priority</label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white font-mono text-xs uppercase tracking-wider"
          >
            Stay on Contact
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initialising...
              </>
            ) : (
              'Proceed to Matter Configuration'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
