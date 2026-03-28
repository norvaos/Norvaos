'use client'

/**
 * Directive 044: Ghost Document Overlay
 *
 * Before the user uploads a file, the matter workspace shows "Ghost Documents" -
 * blurred, semi-transparent placeholders of what should be there. A greyed-out
 * icon labeled "Police Certificate (Required)" shows the user exactly what is
 * missing to reach Score 100.
 *
 * This component renders ghost placeholders for document slots that are empty.
 * It reads the matter type's ghost_document_config or falls back to built-in
 * defaults from the OnboardingOrchestrator.
 */

import { FileText, AlertCircle, Shield, Lock, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GhostDocumentDef } from '@/lib/services/onboarding-orchestrator'

// ── Types ────────────────────────────────────────────────────────────────────

interface GhostDocumentOverlayProps {
  ghostDocs: GhostDocumentDef[]
  /** Set of slot names that already have an uploaded document */
  uploadedSlotNames: Set<string>
  onUploadClick?: (slotName: string) => void
}

// ── Category Icons ───────────────────────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, typeof FileText> = {
  identity: Shield,
  legal: Lock,
  financial: FileText,
  immigration: FileText,
  medical: FileText,
  correspondence: FileText,
  other: FileText,
}

// ── Component ────────────────────────────────────────────────────────────────

export function GhostDocumentOverlay({
  ghostDocs,
  uploadedSlotNames,
  onUploadClick,
}: GhostDocumentOverlayProps) {
  const pendingDocs = ghostDocs.filter((d) => !uploadedSlotNames.has(d.slot_name))

  if (pendingDocs.length === 0) return null

  const requiredCount = pendingDocs.filter((d) => d.is_required).length
  const totalGhost = ghostDocs.length
  const uploadedCount = totalGhost - pendingDocs.length

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {uploadedCount} of {totalGhost} documents uploaded
        </span>
        {requiredCount > 0 && (
          <span className="text-amber-600 font-medium">
            {requiredCount} required remaining
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${totalGhost > 0 ? (uploadedCount / totalGhost) * 100 : 0}%` }}
        />
      </div>

      {/* Ghost document cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {pendingDocs.map((doc) => {
          const Icon = CATEGORY_ICON_MAP[doc.category] ?? FileText
          return (
            <button
              key={doc.slot_name}
              onClick={() => onUploadClick?.(doc.slot_name)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed transition-all text-left w-full',
                doc.is_required
                  ? 'border-amber-500/30/60 bg-amber-950/30/30 dark:bg-amber-950/10 hover:border-amber-400 hover:bg-amber-950/30/50'
                  : 'border-muted-foreground/20 bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/30',
              )}
            >
              {/* Ghost icon */}
              <div
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-md shrink-0',
                  doc.is_required
                    ? 'bg-amber-950/40/60 dark:bg-amber-900/20'
                    : 'bg-muted/40',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4',
                    doc.is_required
                      ? 'text-amber-500/60'
                      : 'text-muted-foreground/40',
                  )}
                />
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-xs font-medium truncate',
                    doc.is_required
                      ? 'text-amber-400/70 dark:text-amber-400/70'
                      : 'text-muted-foreground/50',
                  )}
                >
                  {doc.slot_name}
                </p>
                <p className="text-[10px] text-muted-foreground/40">
                  {doc.is_required ? 'Required' : 'Optional'}
                </p>
              </div>

              {/* Upload hint on hover */}
              <Upload className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
