'use client'

/**
 * CommandToolbar  -  always-visible action bar at the top of the matter command centre.
 *
 * Provides quick access to: Add Document (with real file upload), Send to Client,
 * Schedule, Document Search, OneDrive Sync, and matter actions.
 */

import { useRef } from 'react'
import {
  FolderPlus,
  SendHorizonal,
  CalendarPlus,
  Search,
  Cloud,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Upload,
  Mail,
  Link2,
  FileText,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useUploadDocument } from '@/lib/queries/documents'
import { ChainLockActivateButton } from './chain-lock-activate-button'

export interface CommandToolbarProps {
  matterId: string
  tenantId: string
  /** Whether an active portal link exists */
  portalActive: boolean
  /** Whether enforcement (document slots) is enabled */
  enforcementEnabled: boolean
  /** Whether OneDrive sync is available */
  onedriveAvailable: boolean
  /** Current document search query */
  docSearchQuery: string
  onDocSearchChange: (q: string) => void
  /** Open a named sheet in the SecondaryAccessBar */
  onOpenSheet: (key: string) => void
  /** Open the document upload dialog */
  onAddDocument: () => void
  /** Open the send-to-client dialog with a specific tab */
  onSendToClient: (tab?: 'docRequest' | 'email' | 'portal') => void
  /** Open the edit matter sheet */
  onEdit: () => void
  /** Trigger matter archive */
  onArchive: () => void
  /** Trigger matter delete dialog */
  onDelete: () => void
  /** Trigger OneDrive sync */
  onSyncOneDrive?: () => void
  syncingOneDrive?: boolean
  /** Readiness score (0-100) for GenesisGuard gating */
  readinessScore?: number | null
  className?: string
}

export function CommandToolbar({
  matterId,
  tenantId,
  enforcementEnabled,
  onedriveAvailable,
  docSearchQuery,
  onDocSearchChange,
  onOpenSheet,
  onAddDocument,
  onSendToClient,
  onEdit,
  onArchive,
  onDelete,
  onSyncOneDrive,
  syncingOneDrive,
  readinessScore,
  className,
}: CommandToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadDoc = useUploadDocument()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadDoc.mutate({
      file,
      metadata: { matter_id: matterId, tenant_id: tenantId },
    })
    // Reset so the same file can be re-selected
    e.target.value = ''
    // Also switch to documents tab so the user sees the result
    onAddDocument()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-sm',
        className,
      )}
    >
      {/* Hidden file input for direct upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="*/*"
      />

      {/* ── Left: Primary Actions ── */}
      <div className="flex items-center gap-1.5">
        {/* Add Document */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs" disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
              {uploadDoc.isPending ? 'Uploading…' : 'Add Document'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[100]">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </DropdownMenuItem>
            {enforcementEnabled && (
              <DropdownMenuItem onClick={() => onSendToClient('docRequest')}>
                <Mail className="mr-2 h-4 w-4" />
                Request from Client
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onOpenSheet('caseDetails')}>
              <FileText className="mr-2 h-4 w-4" />
              Manage Document Slots
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Send to Client */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <SendHorizonal className="h-3.5 w-3.5" />
              Send to Client
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[100]">
            {enforcementEnabled && (
              <DropdownMenuItem onClick={() => onSendToClient('docRequest')}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Document Request
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onSendToClient('email')}>
              <Mail className="mr-2 h-4 w-4" />
              Custom Email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSendToClient('portal')}>
              <Link2 className="mr-2 h-4 w-4" />
              Portal Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Schedule */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onOpenSheet('deadlines')}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Schedule
        </Button>
      </div>

      {/* ── Centre: Document Search ── */}
      <div className="flex-1 relative min-w-0 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={docSearchQuery}
          onChange={(e) => onDocSearchChange(e.target.value)}
          placeholder="Search documents…"
          className="h-8 pl-8 pr-7 text-xs"
        />
        {docSearchQuery && (
          <button
            onClick={() => onDocSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Directive 016 + 016.1: Chain-Lock Activate Matter ── */}
      <ChainLockActivateButton
        matterId={matterId}
        tenantId={tenantId}
        readinessScore={readinessScore}
      />

      {/* ── Right: Secondary Actions ── */}
      <div className="flex items-center gap-1.5 ml-auto">
        {onedriveAvailable && onSyncOneDrive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-slate-600"
            onClick={onSyncOneDrive}
            disabled={syncingOneDrive}
            title="Sync folder structure to OneDrive"
          >
            {syncingOneDrive ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
            OneDrive
          </Button>
        )}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[100]">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit Matter
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchive} className="text-amber-600">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
