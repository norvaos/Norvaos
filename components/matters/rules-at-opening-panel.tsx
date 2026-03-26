'use client'

/**
 * RulesAtOpeningPanel
 *
 * Collapsible section displayed at the bottom of the Details tab.
 * Shows the 6 rule snapshots captured at matter creation, with
 * drift detection comparing current config hash vs stored hash.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { MatterRuleSnapshotRow, RuleType } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RulesAtOpeningPanelProps {
  matterId: string
  tenantId: string
  matterTypeId: string | null
}

// ── Labels ────────────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  matter_type_config: 'Matter Type Config',
  sla_config:         'SLA Config',
  billing_config:     'Billing Config',
  document_checklist: 'Document Checklist',
  task_templates:     'Task Templates',
  form_pack_config:   'Form Pack Config',
}

const RULE_TYPES_ORDER: RuleType[] = [
  'matter_type_config',
  'sla_config',
  'billing_config',
  'document_checklist',
  'task_templates',
  'form_pack_config',
]

// ── Hash helper (Web Crypto API  -  browser-compatible) ─────────────────────────

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  const parts = sorted.map(
    (k) => `${JSON.stringify(k)}:${sortedStringify((value as Record<string, unknown>)[k])}`
  )
  return `{${parts.join(',')}}`
}

async function hashObjectAsync(data: Record<string, unknown>): Promise<string> {
  try {
    const stable = sortedStringify(data)
    const encoded = new TextEncoder().encode(stable)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

// ── Query hook ────────────────────────────────────────────────────────────────

function useRuleSnapshots(matterId: string) {
  return useQuery({
    queryKey: ['matter_rule_snapshots', matterId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_rule_snapshots')
        .select('*')
        .eq('matter_id', matterId)
        .order('rule_type')

      if (error) throw error
      return (data ?? []) as MatterRuleSnapshotRow[]
    },
    enabled: !!matterId,
    staleTime: 5 * 60 * 1000,
  })
}

/** Fetch current matter_type config and compute its hash for drift detection */
function useCurrentMatterTypeHash(matterTypeId: string | null) {
  return useQuery({
    queryKey: ['matter_rule_drift_hash', matterTypeId],
    queryFn: async () => {
      if (!matterTypeId) return null
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('matter_types')
        .select('*')
        .eq('id', matterTypeId)
        .single()

      if (!data) return null
      return hashObjectAsync(data as Record<string, unknown>)
    },
    enabled: !!matterTypeId,
    staleTime: 2 * 60 * 1000,
  })
}

// ── Snapshot Card ─────────────────────────────────────────────────────────────

interface SnapshotCardProps {
  snapshot: MatterRuleSnapshotRow
  currentMatterTypeHash: string | null | undefined
}

function SnapshotCard({ snapshot, currentMatterTypeHash }: SnapshotCardProps) {
  const label = RULE_TYPE_LABELS[snapshot.rule_type as RuleType] ?? snapshot.rule_type
  const truncatedHash = snapshot.version_hash.slice(0, 8)
  const capturedDate = new Date(snapshot.captured_at).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  // Drift detection  -  only meaningful for matter_type_config (we have the live hash)
  let driftBadge: ReactNode = null
  if (snapshot.rule_type === 'matter_type_config' && currentMatterTypeHash != null) {
    const isDrifted = currentMatterTypeHash !== snapshot.version_hash
    driftBadge = isDrifted ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
        ⚠ Config has changed since matter opened
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        ✓ Config unchanged
      </span>
    )
  }

  return (
    <div className="rounded-md border bg-slate-50/60 px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        {driftBadge}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span>Captured {capturedDate}</span>
        <span className="font-mono text-slate-400">{truncatedHash}&hellip;</span>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function RulesAtOpeningPanel({
  matterId,
  tenantId: _tenantId,
  matterTypeId,
}: RulesAtOpeningPanelProps) {
  const [open, setOpen] = useState(false)

  const { data: snapshots, isLoading } = useRuleSnapshots(matterId)
  const { data: currentMatterTypeHash } = useCurrentMatterTypeHash(matterTypeId)

  // Build a lookup map for quick access
  const snapshotMap = new Map<string, MatterRuleSnapshotRow>(
    (snapshots ?? []).map((s) => [s.rule_type, s])
  )

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-slate-900">Rules at Opening</span>
        {!isLoading && snapshots?.length === 0 && (
          <span className="ml-auto text-[11px] text-slate-400">No snapshots captured</span>
        )}
      </button>

      {open && (
        <div className={cn('border-t px-5 py-4', 'space-y-2')}>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : snapshots?.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">
              Rule snapshots are captured automatically when a matter has a matter type assigned.
            </p>
          ) : (
            RULE_TYPES_ORDER.map((ruleType) => {
              const snapshot = snapshotMap.get(ruleType)
              if (!snapshot) return null
              return (
                <SnapshotCard
                  key={ruleType}
                  snapshot={snapshot}
                  currentMatterTypeHash={
                    ruleType === 'matter_type_config' ? currentMatterTypeHash : undefined
                  }
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
