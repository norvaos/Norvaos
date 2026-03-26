'use client'

/**
 * SourceViewer  -  Column 2
 *
 * Left pane: scrollable list of document slots.
 *   - Green check = document present
 *   - Red dot     = required slot empty
 *   - Grey dot    = optional slot empty
 *   - Pin icon    = pin document so it stays visible while navigating workbench sections
 *
 * Right pane: PDF viewer via signed Supabase URL in an <iframe>.
 *   Falls back to metadata card when no document is selected.
 *
 * The split is 38% list / 62% viewer within the column.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Circle,
  Pin,
  PinOff,
  Loader2,
  FileX,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DocumentSlot } from '@/lib/queries/document-slots'

// ── Slot row ──────────────────────────────────────────────────────────────────

interface SlotRowProps {
  slot: DocumentSlot & { current_document?: { id: string; file_name: string; storage_path: string; storage_bucket: string | null } | null }
  isActive: boolean
  isPinned: boolean
  onSelect: () => void
  onPin: () => void
}

function SlotRow({ slot, isActive, isPinned, onSelect, onPin }: SlotRowProps) {
  const hasDoc = !!slot.current_document
  const isRequired = slot.is_required

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg transition-colors group',
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
      )}
    >
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {hasDoc
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          : isRequired
            ? <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
        }
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-xs leading-tight truncate',
          isActive ? 'font-semibold' : 'font-medium',
          !hasDoc && 'text-muted-foreground'
        )}>
          {slot.slot_name ?? slot.slot_slug}
        </p>
        {hasDoc && slot.current_document && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {slot.current_document.file_name}
          </p>
        )}
        {!hasDoc && isRequired && (
          <p className="text-[10px] text-red-500 mt-0.5">Required  -  missing</p>
        )}
      </div>

      {/* Pin button (only for slots with documents) */}
      {hasDoc && (
        <button
          onClick={(e) => { e.stopPropagation(); onPin() }}
          className={cn(
            'shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded',
            isPinned && 'opacity-100 text-amber-600'
          )}
          aria-label={isPinned ? 'Unpin document' : 'Pin document'}
        >
          {isPinned
            ? <Pin className="h-3 w-3 fill-current" />
            : <PinOff className="h-3 w-3" />
          }
        </button>
      )}
    </button>
  )
}

// ── PDF Viewer ─────────────────────────────────────────────────────────────────

function PDFViewer({ slot }: {
  slot: DocumentSlot & { current_document?: { id: string; file_name: string; storage_path: string; storage_bucket: string | null } | null }
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slot.current_document) { setUrl(null); return }

    const { storage_path, storage_bucket } = slot.current_document
    if (!storage_path) { setUrl(null); return }

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const bucket = storage_bucket ?? 'documents'

    supabase.storage
      .from(bucket)
      .createSignedUrl(storage_path, 3600) // 1 hour
      .then(({ data, error: storageErr }) => {
        if (storageErr || !data?.signedUrl) {
          setError('Could not load document. Check storage permissions.')
        } else {
          setUrl(data.signedUrl)
        }
        setLoading(false)
      })
  }, [slot.current_document?.storage_path])

  if (!slot.current_document) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FileX className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No document uploaded</p>
        <p className="text-xs opacity-70 text-center max-w-48">
          {slot.is_required
            ? 'This is a required slot. Upload the document to continue.'
            : 'This slot is optional.'}
        </p>
        <Badge
          variant="outline"
          className={slot.is_required ? 'border-red-300 text-red-600' : 'text-muted-foreground'}
        >
          {slot.is_required ? 'Required' : 'Optional'}
        </Badge>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading document…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!url) return null

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium truncate flex-1">
          {slot.current_document?.file_name}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline shrink-0"
        >
          Open ↗
        </a>
      </div>
      {/* Viewer */}
      <iframe
        src={`${url}#toolbar=1&navpanes=0`}
        className="flex-1 w-full border-0"
        title={slot.current_document?.file_name ?? 'Document'}
      />
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyViewer() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <FileText className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Select a document</p>
      <p className="text-xs opacity-60 text-center max-w-48">
        Click a document slot on the left to open it here while verifying fields.
      </p>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

type SlotWithDoc = DocumentSlot & {
  current_document?: { id: string; file_name: string; storage_path: string; storage_bucket: string | null } | null
}

interface SourceViewerProps {
  matterId: string
  documentSlots: SlotWithDoc[]
  activeDocumentId: string | null
  pinnedDocumentId: string | null
  onSelectDocument: (id: string | null) => void
  onPinDocument: (id: string | null) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceViewer({
  documentSlots,
  activeDocumentId,
  pinnedDocumentId,
  onSelectDocument,
  onPinDocument,
}: SourceViewerProps) {
  const activeSlot = documentSlots.find(s => s.id === activeDocumentId) ?? null

  const handlePin = (slotId: string) => {
    onPinDocument(pinnedDocumentId === slotId ? null : slotId)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Slot list  -  38% */}
      <div className="w-[38%] shrink-0 border-r flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Source Documents
          </span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {documentSlots.filter(s => !!s.current_document_id).length}/{documentSlots.length}
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {documentSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">
                No document slots configured for this matter type.
              </p>
            ) : (
              documentSlots.map(slot => (
                <SlotRow
                  key={slot.id}
                  slot={slot as SlotWithDoc}
                  isActive={activeDocumentId === slot.id}
                  isPinned={pinnedDocumentId === slot.id}
                  onSelect={() => onSelectDocument(slot.id)}
                  onPin={() => handlePin(slot.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* PDF viewer  -  62% */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {activeSlot
          ? <PDFViewer slot={activeSlot as SlotWithDoc} />
          : <EmptyViewer />
        }
      </div>
    </div>
  )
}
