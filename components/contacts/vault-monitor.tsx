'use client'

/**
 * VaultMonitor  -  Norva Vault integrity dashboard (Directive 41.0)
 *
 * Shows SHA-256 verification status for each document:
 *   - content_hash present + hash_verified_at → Verified (green shield)
 *   - content_hash present, no verification  → Pending (amber clock)
 *   - tamper_status = 'tampered'             → Alert (red alert + watermark)
 *   - No hash                                → Untracked (grey)
 *
 * Features:
 *   - Sentinel Eye: PDF viewer button per document
 *   - Sovereign Naming: [Category]_[YYYY-MM-DD]_[Version] display
 *   - Tamper Watermark: Red border + "Caution: File Tampered" on compromised files
 */

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Shield, ShieldCheck, ShieldAlert, Clock, Eye, X, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface VaultMonitorProps {
  contactId: string
  tenantId: string
  contactName?: string
}

interface VaultDoc {
  id: string
  file_name: string | null
  file_url: string | null
  content_hash: string | null
  hash_verified_at: string | null
  tamper_status: string | null
  category: string | null
  created_at: string
}

type IntegrityStatus = 'verified' | 'pending' | 'tampered' | 'untracked'

// ── Query ──────────────────────────────────────────────────────────────────────

function useContactVaultDocs(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['vault-monitor', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name, storage_path, content_hash, hash_verified_at, tamper_status, category, created_at')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      // Map storage_path to file_url for the viewer
      return (data ?? []).map((d) => ({
        ...d,
        file_url: d.storage_path ?? null,
      })) as VaultDoc[]
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── SentinelEye SHA-256 Digest ─────────────────────────────────────────────────

async function computeSHA256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getIntegrityStatus(doc: VaultDoc): IntegrityStatus {
  if (doc.tamper_status === 'tampered') return 'tampered'
  if (doc.content_hash && doc.hash_verified_at) return 'verified'
  if (doc.content_hash) return 'pending'
  return 'untracked'
}

/**
 * Sovereign Naming Convention: [Category]_[YYYY-MM-DD]_[Version]
 * Falls back to original file_name if metadata is missing.
 */
function toSovereignName(doc: VaultDoc, contactName?: string): string {
  if (!doc.file_name) return 'Untitled'

  // If already follows sovereign naming (contains underscores + date pattern), return as-is
  if (/\d{4}-\d{2}-\d{2}_v\d+/.test(doc.file_name)) return doc.file_name

  const date = new Date(doc.created_at)
  const dateStr = date.toISOString().slice(0, 10) // YYYY-MM-DD
  const category = doc.category ?? extractCategory(doc.file_name)
  const ext = doc.file_name.includes('.') ? doc.file_name.slice(doc.file_name.lastIndexOf('.')) : ''
  const prefix = contactName ? contactName.replace(/\s+/g, '_') + '_' : ''

  return `${prefix}${category}_${dateStr}_v1${ext}`
}

/** Extract a category from the filename if no category column is set */
function extractCategory(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('passport')) return 'Passport'
  if (lower.includes('permit') || lower.includes('work')) return 'Work_Permit'
  if (lower.includes('study')) return 'Study_Permit'
  if (lower.includes('birth')) return 'Birth_Certificate'
  if (lower.includes('marriage')) return 'Marriage_Certificate'
  if (lower.includes('retainer')) return 'Retainer'
  if (lower.includes('invoice')) return 'Invoice'
  if (lower.includes('receipt')) return 'Receipt'
  if (lower.includes('photo') || lower.includes('image')) return 'Photo'
  if (lower.includes('id') || lower.includes('identity')) return 'Identity_Document'
  return 'Document'
}

const STATUS_CONFIG: Record<IntegrityStatus, {
  label: string
  icon: typeof ShieldCheck
  badgeClass: string
}> = {
  verified: {
    label: 'SHA-256 Verified',
    icon: ShieldCheck,
    badgeClass: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  pending: {
    label: 'Hash Pending',
    icon: Clock,
    badgeClass: 'border-amber-500/30 bg-amber-950/30 text-amber-400 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  tampered: {
    label: 'Integrity Alert',
    icon: ShieldAlert,
    badgeClass: 'border-red-500/30 bg-red-950/30 text-red-400 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  untracked: {
    label: 'Untracked',
    icon: Shield,
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-500',
  },
}

// ── Sentinel Eye Viewer ────────────────────────────────────────────────────────

function SentinelEyeViewer({
  doc,
  open,
  onClose,
}: {
  doc: VaultDoc
  open: boolean
  onClose: () => void
}) {
  const status = getIntegrityStatus(doc)
  const isTampered = status === 'tampered'
  const hashPreview = doc.content_hash
    ? `${doc.content_hash.slice(0, 12)}…${doc.content_hash.slice(-8)}`
    : 'No hash'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn(
        // Mobile-first: full screen on small viewports, constrained on desktop
        'w-full max-w-[95vw] sm:max-w-4xl h-[90vh] sm:h-[85vh] flex flex-col p-0',
        isTampered && 'border-2 border-red-500 ring-4 ring-red-200',
      )}>
        {/* Header  -  responsive: stacks on mobile */}
        <DialogHeader className={cn(
          'px-3 sm:px-4 py-2 sm:py-3 border-b flex-shrink-0',
          isTampered && 'bg-red-950/30 border-red-500/20',
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <Eye className={cn(
                'size-5 sm:size-4 shrink-0',
                isTampered ? 'text-red-600' : 'text-blue-600',
                // High contrast for mobile/accessibility
                'drop-shadow-sm',
              )} />
              <DialogTitle className="text-xs sm:text-sm font-semibold truncate">
                Sentinel Eye  -  {doc.file_name ?? 'Document'}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 ml-7 sm:ml-0">
              <Badge variant="outline" className={cn('text-[10px]', STATUS_CONFIG[status].badgeClass)}>
                {STATUS_CONFIG[status].label}
              </Badge>
              <code className="hidden sm:inline text-[10px] font-mono text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
                {hashPreview}
              </code>
            </div>
          </div>
        </DialogHeader>

        {/* Viewer area */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          {/* Tamper watermark overlay */}
          {isTampered && (
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="rotate-[-25deg] opacity-20">
                <div className="flex items-center gap-2 sm:gap-3 text-red-600">
                  <AlertTriangle className="size-8 sm:size-12" />
                  <span className="text-xl sm:text-4xl font-black tracking-wider uppercase">
                    Caution: File Tampered
                  </span>
                </div>
              </div>
            </div>
          )}

          {doc.file_url ? (
            <iframe
              src={doc.file_url}
              className="w-full h-full border-0"
              title={`Sentinel Eye  -  ${doc.file_name}`}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
              <Eye className="size-10 sm:size-12 opacity-30" />
              <p className="text-sm text-center">No preview available  -  file URL missing</p>
            </div>
          )}
        </div>

        {/* SHA-256 Audit Footer  -  Directive 41.2 (sticky for mobile viewport visibility) */}
        <div className={cn(
          'px-3 sm:px-4 py-2 border-t flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1',
          'sticky bottom-0 z-10',
          isTampered ? 'bg-red-950/30 border-red-500/20' : 'bg-slate-50 border-slate-200',
        )}>
          <div className="flex items-center gap-1.5">
            <Shield className="size-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              SHA-256 Integrity Hash
            </span>
          </div>
          <code className={cn(
            'text-[10px] sm:text-[11px] font-mono break-all select-all',
            isTampered ? 'text-red-400' : 'text-slate-600',
          )}>
            {doc.content_hash ?? 'No hash computed'}
          </code>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function VaultMonitor({ contactId, tenantId, contactName }: VaultMonitorProps) {
  const { data: docs, isLoading } = useContactVaultDocs(contactId, tenantId)
  const [viewerDoc, setViewerDoc] = useState<VaultDoc | null>(null)

  const openSentinelEye = useCallback((doc: VaultDoc) => {
    setViewerDoc(doc)
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 flex-1 rounded" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (!docs || docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground">
        <Shield className="size-8 opacity-40" />
        <p className="text-sm font-medium">Norva Vault Empty</p>
        <p className="text-xs">No documents uploaded for this contact.</p>
      </div>
    )
  }

  // Aggregate stats
  const counts: Record<IntegrityStatus, number> = { verified: 0, pending: 0, tampered: 0, untracked: 0 }
  for (const doc of docs) {
    counts[getIntegrityStatus(doc)]++
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {counts.verified > 0 && (
          <Badge variant="outline" className={cn('text-[10px] gap-1', STATUS_CONFIG.verified.badgeClass)}>
            <ShieldCheck className="size-2.5" />
            {counts.verified} Verified
          </Badge>
        )}
        {counts.pending > 0 && (
          <Badge variant="outline" className={cn('text-[10px] gap-1', STATUS_CONFIG.pending.badgeClass)}>
            <Clock className="size-2.5" />
            {counts.pending} Pending
          </Badge>
        )}
        {counts.tampered > 0 && (
          <Badge variant="outline" className={cn('text-[10px] gap-1 animate-pulse', STATUS_CONFIG.tampered.badgeClass)}>
            <ShieldAlert className="size-2.5" />
            {counts.tampered} Alert
          </Badge>
        )}
        {counts.untracked > 0 && (
          <Badge variant="outline" className={cn('text-[10px] gap-1', STATUS_CONFIG.untracked.badgeClass)}>
            <Shield className="size-2.5" />
            {counts.untracked} Untracked
          </Badge>
        )}
      </div>

      {/* Document list with Sentinel Eye + Sovereign Naming */}
      <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
        {docs.map((doc) => {
          const status = getIntegrityStatus(doc)
          const cfg = STATUS_CONFIG[status]
          const Icon = cfg.icon
          const isTampered = status === 'tampered'
          const hashPreview = doc.content_hash
            ? `${doc.content_hash.slice(0, 8)}…${doc.content_hash.slice(-6)}`
            : null
          const sovereignName = toSovereignName(doc, contactName)

          return (
            <div
              key={doc.id}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors group',
                isTampered
                  ? 'border border-red-500/30 bg-red-950/30/50 hover:bg-red-950/30'
                  : 'hover:bg-muted/50',
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', isTampered ? 'text-red-600' : status === 'verified' ? 'text-green-600' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className={cn(
                        'text-xs font-medium truncate',
                        isTampered ? 'text-red-400' : 'text-foreground',
                      )}>
                        {sovereignName}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-xs">
                      <p className="font-medium">Original: {doc.file_name ?? 'Untitled'}</p>
                      <p className="text-muted-foreground">Sovereign: {sovereignName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {hashPreview && (
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {hashPreview}
                  </p>
                )}
                {isTampered && (
                  <p className="text-[10px] font-bold text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="size-2.5" />
                    Caution: File Tampered
                  </p>
                )}
              </div>

              {/* Sentinel Eye  -  PDF Viewer trigger (high-contrast, mobile-friendly) */}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openSentinelEye(doc)}
                      aria-label={`View ${doc.file_name ?? 'document'} in Sentinel Eye`}
                      className={cn(
                        'p-1.5 sm:p-1 rounded-md transition-all',
                        // Always visible on touch devices, hover-reveal on desktop
                        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                        isTampered
                          ? 'hover:bg-red-950/40 text-red-600 active:bg-red-200'
                          : 'hover:bg-blue-950/30 text-blue-600 active:bg-blue-950/40',
                      )}
                    >
                      <Eye className="size-4 sm:size-3.5 drop-shadow-sm" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Sentinel Eye  -  View & Verify
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Badge variant="outline" className={cn('text-[9px] shrink-0', cfg.badgeClass)}>
                {cfg.label}
              </Badge>
            </div>
          )
        })}
      </div>

      {/* Sentinel Eye Viewer Dialog */}
      {viewerDoc && (
        <SentinelEyeViewer
          doc={viewerDoc}
          open={!!viewerDoc}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  )
}
