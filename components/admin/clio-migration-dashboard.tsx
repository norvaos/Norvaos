'use client'

/**
 * Clio Migration Dashboard  -  Directive 035: Sovereign Extraction Bridge
 *
 * Glassmorphism bento UI showing real-time migration progress as Clio data
 * flows into the Norva Fortress. Each phase appears as a "jade block"
 * that solidifies as processing completes.
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Shield,
  Users,
  Briefcase,
  FileText,
  Landmark,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Sparkles,
  Lock,
  Fingerprint,
  Eye,
  Link2,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface MigrationRecord {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  progress: {
    phases?: PhaseProgress[]
    totalImported?: number
    totalErrors?: number
    gapAlerts?: number
    currentPhase?: string
  } | null
}

interface PhaseProgress {
  phase: string
  status: string
  total: number
  processed: number
  errors: number
}

// ── Phase Config ─────────────────────────────────────────────────────────────

const PHASE_CONFIG = {
  contacts: {
    label: 'Contacts',
    icon: Users,
    action: 'PII Encrypted; duplicates merged',
    color: 'emerald',
  },
  matters: {
    label: 'Matters',
    icon: Briefcase,
    action: 'Mapping custom fields to Norva Logic-Gates',
    color: 'indigo',
  },
  documents: {
    label: 'Documents',
    icon: FileText,
    action: 'Sentinel Eye checks for OCR validity and expiry',
    color: 'violet',
  },
  trust_ledger: {
    label: 'Trust Ledger',
    icon: Landmark,
    action: 'Balances hashed and anchored to Firm Global Ledger',
    color: 'amber',
  },
} as const

type PhaseKey = keyof typeof PHASE_CONFIG

// ── Status Helpers ───────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-950/30 text-emerald-400 border-emerald-500/20 gap-1">
          <CheckCircle className="h-3 w-3" />
          Imported
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge className="bg-amber-950/30 text-amber-400 border-amber-500/20 gap-1 animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      )
    case 'failed':
      return (
        <Badge className="bg-red-950/30 text-red-400 border-red-500/20 gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
    default:
      return (
        <Badge className="bg-gray-50 text-gray-500 border-gray-200">
          Pending
        </Badge>
      )
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClioMigrationDashboard() {
  const { tenant } = useTenant()
  const queryClient = useQueryClient()

  // Fetch latest migration
  const { data: migration, isLoading } = useQuery({
    queryKey: ['clio-migration', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('clio_migrations')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as MigrationRecord | null
    },
    enabled: !!tenant?.id,
    refetchInterval: (query) => {
      const d = query.state.data as MigrationRecord | null | undefined
      return d?.status === 'in_progress' ? 3000 : false
    },
  })

  // Start migration mutation
  const startMigration = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/clio/migrate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to start migration')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clio-migration'] })
    },
  })

  // Also check import_batches so wizard-imported data is reflected on the bridge
  const { data: importBatches } = useQuery({
    queryKey: ['clio-import-batches', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('import_batches')
        .select('entity_type, status, succeeded_rows, failed_rows, total_rows, completed_at')
        .eq('tenant_id', tenant!.id)
        .eq('source_platform', 'clio')
        .in('status', ['completed', 'completed_with_errors'])
        .order('completed_at', { ascending: false })
      return (data ?? []) as Array<{
        entity_type: string
        status: string
        succeeded_rows: number
        failed_rows: number
        total_rows: number
        completed_at: string | null
      }>
    },
    enabled: !!tenant?.id,
  })

  // Map import_batches entity types to bridge phase keys
  const ENTITY_TO_PHASE: Record<string, string> = {
    contacts: 'contacts',
    matters: 'matters',
    documents: 'documents',
    trust_entries: 'trust_ledger',
    trust_ledger: 'trust_ledger',
  }

  // Build effective phases: migration phases take precedence; fall back to import_batches
  const migrationPhases = migration?.progress?.phases ?? []
  const phases: PhaseProgress[] = (Object.keys(PHASE_CONFIG) as PhaseKey[]).map((key) => {
    const fromMigration = migrationPhases.find((p) => p.phase === key)
    if (fromMigration) return fromMigration
    // Find the most recently completed import batch for this phase
    const batch = (importBatches ?? []).find((b) => ENTITY_TO_PHASE[b.entity_type] === key)
    if (batch) {
      return {
        phase: key,
        status: 'completed',
        total: batch.total_rows,
        processed: batch.succeeded_rows + batch.failed_rows,
        errors: batch.failed_rows,
      }
    }
    return { phase: key, status: 'pending', total: 0, processed: 0, errors: 0 }
  })

  const isRunning = migration?.status === 'in_progress'
  const isComplete = migration?.status === 'completed' || phases.every((p) => p.status === 'completed')
  const gapAlerts = migration?.progress?.gapAlerts ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900">
            <Link2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Sovereign Extraction Bridge</h2>
            <p className="text-xs text-muted-foreground">Clio Manage → Norva Fortress</p>
          </div>
        </div>

        {!isRunning && !isComplete && (
          <Button
            onClick={() => startMigration.mutate()}
            disabled={startMigration.isPending}
            className="gap-2"
          >
            {startMigration.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Begin Extraction
          </Button>
        )}
      </div>

      {/* Phase Cards  -  Bento Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(PHASE_CONFIG) as PhaseKey[]).map((key) => {
          const config = PHASE_CONFIG[key]
          const phase = phases.find((p) => p.phase === key)!
          const Icon = config.icon
          const progress = Math.round((phase.processed / Math.max(phase.total, 1)) * 100)
          const isActive = phase.status === 'in_progress'
          const isDone = phase.status === 'completed'

          return (
            <div
              key={key}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-5 transition-all duration-500',
                isDone
                  ? 'border-emerald-500/20/60 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm'
                  : isActive
                    ? 'border-amber-500/20/60 bg-gradient-to-br from-amber-50/50 to-white shadow-md'
                    : 'border-gray-200 bg-white',
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl',
                      isDone ? 'bg-emerald-950/40' : isActive ? 'bg-amber-950/40' : 'bg-gray-100',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isDone ? 'text-emerald-400' : isActive ? 'text-amber-400' : 'text-gray-400',
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{config.label}</p>
                    <p className="text-[10px] text-muted-foreground">{config.action}</p>
                  </div>
                </div>
                {statusBadge(phase.status)}
              </div>

              {/* Progress bar  -  only when there's real data */}
              {phase.total > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {phase.processed.toLocaleString()} / {phase.total.toLocaleString()}
                    </span>
                    {phase.errors > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        {phase.errors} errors
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700 ease-out',
                        isDone ? 'bg-emerald-950/300' : isActive ? 'bg-amber-400' : 'bg-gray-300',
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Glow effect when active */}
              {isActive && (
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-300/20 blur-2xl animate-pulse" />
              )}
              {isDone && (
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl" />
              )}
            </div>
          )
        })}
      </div>

      {/* Gap Alerts */}
      {isComplete && gapAlerts > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/30 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Legacy Gap Diagnostic: {gapAlerts} matters need attention
              </p>
              <p className="mt-1 text-xs text-amber-400">
                These matters were imported with incomplete data. The Readiness Ring is below 100 and
                Genesis Block creation is locked until all gaps are resolved.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs">
                View Cleanup List
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Summary */}
      {isComplete && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-5">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Sovereign Extraction Complete
              </p>
              <p className="mt-1 text-xs text-emerald-400">
                {migration?.progress?.totalImported?.toLocaleString()} records imported.{' '}
                {migration?.progress?.totalErrors === 0
                  ? 'Zero errors.'
                  : `${migration?.progress?.totalErrors} errors logged for review.`}
                {' '}All imported contacts have been PII-encrypted. Trust balances have been hashed
                and anchored to the Firm Global Ledger.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Forensic Actions Legend */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Lock, label: 'PII Encrypted', color: 'text-indigo-600 bg-indigo-50' },
          { icon: Eye, label: 'Sentinel Scanned', color: 'text-violet-600 bg-violet-50' },
          { icon: Fingerprint, label: 'Hash Anchored', color: 'text-emerald-600 bg-emerald-950/30' },
          { icon: AlertTriangle, label: 'Gap Detected', color: 'text-amber-600 bg-amber-950/30' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
            <div className={cn('flex h-6 w-6 items-center justify-center rounded-lg', item.color)}>
              <item.icon className="h-3 w-3" />
            </div>
            <span className="text-xs font-medium text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
