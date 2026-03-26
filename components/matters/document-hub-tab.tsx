'use client'

/**
 * DocumentHubTab  -  enhanced document management panel for the matter command centre.
 *
 * Wraps DocumentSlotPanel with:
 * - Real-time search filter
 * - Status filter pills (All / Pending Review / Accepted / Shared / Needs Re-upload)
 * - Document slot panel with share buttons on each accepted slot
 */

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DocumentSlotPanel } from '@/components/matters/document-slot-panel'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentHubTabProps {
  matterId: string
  tenantId: string
  enforcementEnabled: boolean
  /** External search query from the toolbar (overrides internal search if set) */
  externalSearchQuery?: string
}

// ── Filter pills configuration ────────────────────────────────────────────────

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'empty', label: 'Needed' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'shared', label: 'Shared with Client' },
  { value: 'needs_re_upload', label: 'Needs Re-upload' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function DocumentHubTab({
  matterId,
  tenantId,
  enforcementEnabled,
  externalSearchQuery,
}: DocumentHubTabProps) {
  const [localQuery, setLocalQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Toolbar search takes precedence; if toolbar has a query use it, else local
  const activeQuery = externalSearchQuery != null && externalSearchQuery !== ''
    ? externalSearchQuery
    : localQuery

  return (
    <div className="space-y-3">
      {/* Search + Filter bar */}
      <div className="flex flex-col gap-2">
        {/* Only show local search when toolbar isn't providing one */}
        {(externalSearchQuery == null || externalSearchQuery === '') && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search documents by name…"
              className="h-8 pl-8 pr-8 text-xs"
            />
            {localQuery && (
              <button
                onClick={() => setLocalQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors',
                statusFilter === opt.value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800',
              )}
            >
              {opt.label}
            </button>
          ))}
          {(activeQuery || statusFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-muted-foreground"
              onClick={() => { setLocalQuery(''); setStatusFilter('all') }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Document slots with filtering applied */}
      <DocumentSlotPanel
        matterId={matterId}
        tenantId={tenantId}
        enforcementEnabled={enforcementEnabled}
        filterQuery={activeQuery}
        filterStatus={statusFilter}
      />
    </div>
  )
}
