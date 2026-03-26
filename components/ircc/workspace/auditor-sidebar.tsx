'use client'

/**
 * AuditorSidebar — Column 4
 *
 * Live IRCC compliance and completeness engine.
 *
 * Three zones:
 *   TOP    — Case status (days since opened, expiry countdown, next action)
 *   MIDDLE — Completeness checklist (grouped, pass/warn/fail/N/A per item)
 *   BOTTOM — Biometrics & medical tracking
 *
 * Uses existing useImmigrationReadiness data as the data source.
 * The Generate Package button is gated until all mandatory items pass.
 */

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Minus,
  ChevronDown,
  ChevronRight,
  Clock,
  Fingerprint,
  Stethoscope,
  Zap,
  Lock,
  AlertCircle,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { differenceInDays, parseISO } from 'date-fns'
import type { Database } from '@/lib/types/database'
import type { MatterPersonProfile } from '@/lib/queries/matter-profiles'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { DocumentSlot } from '@/lib/queries/document-slots'
import { GoldPulseScore } from '@/components/ircc/gold-pulse-score'

type Matter = Database['public']['Tables']['matters']['Row']
type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

// ── Check item types ──────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'warn' | 'fail' | 'na' | 'pending'

interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

interface CheckGroup {
  key: string
  label: string
  items: CheckItem[]
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 'sm' }: { status: CheckStatus; size?: 'sm' | 'xs' }) {
  const cls = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  switch (status) {
    case 'pass':    return <CheckCircle2 className={cn(cls, 'text-green-600')} />
    case 'warn':    return <AlertTriangle className={cn(cls, 'text-amber-500')} />
    case 'fail':    return <XCircle className={cn(cls, 'text-red-500')} />
    case 'na':      return <Minus className={cn(cls, 'text-muted-foreground/50')} />
    case 'pending': return <Clock className={cn(cls, 'text-blue-500')} />
  }
}

// ── Build completeness groups from readiness data ─────────────────────────────

function buildCheckGroups(
  readinessData: ImmigrationReadinessData | null,
  principalApplicant: MatterPersonProfile | null,
  documentSlots: DocumentSlot[],
  matter: Matter,
  immigrationData: MatterImmigration | null,
): CheckGroup[] {
  const groups: CheckGroup[] = []

  // ── Identity & Profile ──────────────────────────────────────────────────────
  const profile = (principalApplicant?.profile_data ?? {}) as Record<string, unknown>
  const ver = ((profile._ver ?? {}) as Record<string, { v: boolean }>)

  const identityItems: CheckItem[] = [
    {
      id: 'pa_exists',
      label: 'Principal applicant assigned',
      status: principalApplicant ? 'pass' : 'fail',
    },
    {
      id: 'uci',
      label: 'UCI number recorded',
      status: immigrationData?.uci_number ? 'pass' : 'warn',
      detail: immigrationData?.uci_number ?? undefined,
    },
    {
      id: 'family_name',
      label: 'Family name — verified',
      status: ver['personal.family_name']?.v ? 'pass' : profile['personal'] ? 'warn' : 'fail',
    },
    {
      id: 'dob',
      label: 'Date of birth — verified',
      status: ver['personal.date_of_birth']?.v ? 'pass' : 'warn',
    },
    {
      id: 'passport_number',
      label: 'Passport number — verified',
      status: ver['passport.number']?.v ? 'pass' : 'warn',
    },
    {
      id: 'passport_expiry',
      label: 'Passport expiry — verified',
      status: ver['passport.expiry_date']?.v ? 'pass' : 'warn',
    },
  ]
  groups.push({ key: 'identity', label: 'Identity', items: identityItems })

  // ── Documents ───────────────────────────────────────────────────────────────
  const mandatory = documentSlots.filter(s => s.is_required)
  const missing = mandatory.filter(s => !s.current_document_id)
  const docItems: CheckItem[] = [
    {
      id: 'mandatory_docs',
      label: `Mandatory documents (${mandatory.length - missing.length}/${mandatory.length})`,
      status: missing.length === 0 ? 'pass' : missing.length > 2 ? 'fail' : 'warn',
      detail: missing.length > 0 ? `Missing: ${missing.slice(0, 2).map(s => s.slot_name ?? s.slot_slug).join(', ')}${missing.length > 2 ? '…' : ''}` : undefined,
    },
    {
      id: 'photo',
      label: 'Digital photograph',
      status: documentSlots.find(s => s.slot_slug?.toLowerCase().includes('photo') && s.current_document_id) ? 'pass' : 'warn',
    },
  ]
  groups.push({ key: 'documents', label: 'Documents', items: docItems })

  // ── Questionnaire / Intake ──────────────────────────────────────────────────
  if (readinessData) {
    const qPct = readinessData.questionnaire?.completionPct ?? 0
    const minPct = readinessData.questionnaire?.minimumPct ?? 80
    const intakeItems: CheckItem[] = [
      {
        id: 'questionnaire_pct',
        label: `Questionnaire completion (${qPct}%)`,
        status: qPct >= 100 ? 'pass' : qPct >= minPct ? 'warn' : 'fail',
      },
    ]
    groups.push({ key: 'intake', label: 'Questionnaire', items: intakeItems })
  }

  // ── Forms ───────────────────────────────────────────────────────────────────
  if (readinessData?.formPacks) {
    const { required, generated, stale } = readinessData.formPacks
    const formItems: CheckItem[] = [
      {
        id: 'forms_generated',
        label: `IMM forms generated (${generated.length}/${required.length})`,
        status: generated.length >= required.length && stale.length === 0 ? 'pass' :
                generated.length > 0 ? 'warn' : 'fail',
        detail: stale.length > 0 ? `Stale: ${stale.join(', ')}` : undefined,
      },
    ]
    groups.push({ key: 'forms', label: 'IMM Forms', items: formItems })
  }

  // ── Contradictions / Flags ──────────────────────────────────────────────────
  if (readinessData?.contradictions) {
    const { blockingCount, warningCount } = readinessData.contradictions
    const flagItems: CheckItem[] = [
      {
        id: 'contradictions',
        label: blockingCount === 0 && warningCount === 0
          ? 'No data contradictions'
          : `${blockingCount} blocking, ${warningCount} warning`,
        status: blockingCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
      },
    ]
    groups.push({ key: 'flags', label: 'Data Integrity', items: flagItems })
  }

  // ── Lawyer review ───────────────────────────────────────────────────────────
  if (readinessData?.lawyerReview?.required) {
    const lr = readinessData.lawyerReview
    groups.push({
      key: 'review',
      label: 'Lawyer Review',
      items: [{
        id: 'lawyer_review',
        label: lr.status === 'approved' ? 'Lawyer review approved' : 'Lawyer review required',
        status: lr.status === 'approved' ? 'pass' : 'fail',
        detail: lr.reviewedBy ? `By ${lr.reviewedBy}` : undefined,
      }],
    })
  }

  return groups
}

// ── Group row (collapsible) ───────────────────────────────────────────────────

function CheckGroupBlock({ group }: { group: CheckGroup }) {
  const [open, setOpen] = useState(true)
  const failCount = group.items.filter(i => i.status === 'fail').length
  const warnCount = group.items.filter(i => i.status === 'warn').length
  const passCount = group.items.filter(i => i.status === 'pass').length
  const overallStatus: CheckStatus =
    failCount > 0 ? 'fail' :
    warnCount > 0 ? 'warn' :
    passCount === group.items.length ? 'pass' : 'pending'

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full py-1 px-1 hover:bg-muted/50 rounded transition-colors"
      >
        <StatusIcon status={overallStatus} />
        <span className="text-xs font-semibold flex-1 text-left">{group.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {passCount}/{group.items.length}
        </span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {group.items.map(item => (
            <div key={item.id} className="flex items-start gap-1.5 py-0.5 px-1 rounded">
              <StatusIcon status={item.status} size="xs" />
              <div className="min-w-0">
                <p className="text-xs leading-tight">{item.label}</p>
                {item.detail && (
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Package readiness gate ────────────────────────────────────────────────────

function PackageGate({ blockers }: { blockers: string[] }) {
  const ready = blockers.length === 0
  const [showBlockers, setShowBlockers] = useState(false)

  return (
    <div className="px-3 py-2.5 border-t mt-2">
      <Button
        className={cn(
          'w-full text-xs font-semibold',
          ready
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
        disabled={!ready}
        onClick={() => !ready && setShowBlockers(v => !v)}
      >
        {ready ? (
          <>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Generate Package
          </>
        ) : (
          <>
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Package Blocked ({blockers.length})
          </>
        )}
      </Button>

      {!ready && showBlockers && (
        <div className="mt-2 space-y-1">
          {blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-600">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AuditorSidebarProps {
  matterId: string
  matter: Matter
  immigrationData: MatterImmigration | null
  readinessData: ImmigrationReadinessData | null
  principalApplicant: MatterPersonProfile | null
  documentSlots: DocumentSlot[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditorSidebar({
  matter,
  immigrationData,
  readinessData,
  principalApplicant,
  documentSlots,
}: AuditorSidebarProps) {
  const groups = useMemo(() =>
    buildCheckGroups(readinessData, principalApplicant, documentSlots, matter, immigrationData),
    [readinessData, principalApplicant, documentSlots, matter, immigrationData]
  )

  const totalItems = groups.flatMap(g => g.items).length
  const passItems  = groups.flatMap(g => g.items).filter(i => i.status === 'pass').length
  const failItems  = groups.flatMap(g => g.items).filter(i => i.status === 'fail').length
  const warnItems  = groups.flatMap(g => g.items).filter(i => i.status === 'warn').length
  const completionPct = totalItems === 0 ? 0 : Math.round((passItems / totalItems) * 100)

  // Blockers = all fail items
  const blockers = useMemo(() =>
    groups.flatMap(g => g.items).filter(i => i.status === 'fail').map(i => i.label),
    [groups]
  )

  // Days since opened
  const daysOpen = matter.date_opened
    ? differenceInDays(new Date(), parseISO(matter.date_opened))
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          IRCC Auditor
        </span>
        <div className="flex items-center gap-1.5">
          {failItems > 0 && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-red-300 text-red-600 bg-red-50">
              {failItems} fail
            </Badge>
          )}
          {warnItems > 0 && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50">
              {warnItems} warn
            </Badge>
          )}
        </div>
      </div>

      {/* TOP — Case status strip */}
      <div className="grid grid-cols-2 gap-2 px-3 py-2 border-b bg-card shrink-0">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Days Open</p>
          <p className="text-sm font-bold">{daysOpen ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Completeness</p>
          <p className={cn(
            'text-sm font-bold',
            completionPct === 100 ? 'text-green-600' : completionPct >= 60 ? 'text-amber-600' : 'text-red-600'
          )}>
            {completionPct}%
          </p>
        </div>
        {readinessData?.nextAction && (
          <div className="col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Next Action</p>
            <p className="text-xs font-medium leading-snug">{readinessData.nextAction}</p>
          </div>
        )}
      </div>

      {/* Completeness progress bar with Gold Pulse (Directive 8.2) */}
      <GoldPulseScore
        score={completionPct}
        passed={passItems}
        total={totalItems}
      />

      {/* MIDDLE — Checklist */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {groups.map(group => (
            <CheckGroupBlock key={group.key} group={group} />
          ))}
        </div>
      </ScrollArea>

      {/* BOTTOM — Biometrics / Medical */}
      <div className="border-t px-3 py-2 bg-card shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Biometrics & Medical
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 bg-background">
            <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Biometrics</p>
              <p className="text-xs font-medium leading-tight">Not Started</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 bg-background">
            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Medical</p>
              <p className="text-xs font-medium leading-tight">Not Started</p>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Package gate */}
      <PackageGate blockers={blockers} />
    </div>
  )
}
