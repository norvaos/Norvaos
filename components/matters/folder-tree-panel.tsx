'use client'

import { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FolderTreeNode } from '@/lib/queries/matter-folders'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DocumentSlot {
  id: string
  slot_name: string
  description: string | null
  category: string
  person_role: string | null
  is_required: boolean
  status: string
  current_version: number
  current_document_id: string | null
  folder_id: string | null
}

interface FolderTreePanelProps {
  folders: FolderTreeNode[]
  slots: DocumentSlot[]
  matterId: string
  renderSlot: (slot: DocumentSlot) => React.ReactNode
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function countSlotsInFolder(
  folder: FolderTreeNode,
  slotsByFolder: Map<string, DocumentSlot[]>
): number {
  let count = slotsByFolder.get(folder.id)?.length ?? 0
  for (const child of folder.children) {
    count += countSlotsInFolder(child, slotsByFolder)
  }
  return count
}

function countAcceptedInFolder(
  folder: FolderTreeNode,
  slotsByFolder: Map<string, DocumentSlot[]>
): number {
  const folderSlots = slotsByFolder.get(folder.id) ?? []
  let count = folderSlots.filter((s) => s.status === 'accepted').length
  for (const child of folder.children) {
    count += countAcceptedInFolder(child, slotsByFolder)
  }
  return count
}

// ─── FolderNode ─────────────────────────────────────────────────────────────────

function FolderNode({
  folder,
  slotsByFolder,
  unfiledSlots: _unfiledSlots,
  depth,
  renderSlot,
}: {
  folder: FolderTreeNode
  slotsByFolder: Map<string, DocumentSlot[]>
  unfiledSlots: DocumentSlot[]
  depth: number
  renderSlot: (slot: DocumentSlot) => React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(depth === 0) // Auto-expand root folders

  const folderSlots = slotsByFolder.get(folder.id) ?? []
  const totalSlots = countSlotsInFolder(folder, slotsByFolder)
  const acceptedSlots = countAcceptedInFolder(folder, slotsByFolder)
  const hasContent = totalSlots > 0 || folder.children.length > 0

  return (
    <div className={cn(depth > 0 && 'ml-4')}>
      {/* Folder header */}
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
          'hover:bg-slate-50 transition-colors',
          depth === 0 ? 'text-sm font-medium' : 'text-sm'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {hasContent ? (
          isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )
        ) : (
          <span className="w-4" />
        )}

        {isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        )}

        <span className="flex-1 truncate">{folder.name}</span>

        {totalSlots > 0 && (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 shrink-0',
              acceptedSlots === totalSlots && totalSlots > 0
                ? 'border-green-300 text-green-700 bg-green-50'
                : 'border-slate-200 text-slate-500'
            )}
          >
            {acceptedSlots}/{totalSlots}
          </Badge>
        )}
      </button>

      {/* Folder contents */}
      {isOpen && (
        <div className="mt-1">
          {/* Child folders */}
          {folder.children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              slotsByFolder={slotsByFolder}
              unfiledSlots={[]}
              depth={depth + 1}
              renderSlot={renderSlot}
            />
          ))}

          {/* Document slots in this folder */}
          {folderSlots.length > 0 && (
            <div className={cn('ml-10 space-y-2 mt-2', depth > 0 && 'ml-6')}>
              {folderSlots.map((slot) => renderSlot(slot))}
            </div>
          )}

          {/* Empty folder message */}
          {!hasContent && folderSlots.length === 0 && folder.children.length === 0 && (
            <div className="ml-10 py-2">
              <p className="text-xs text-muted-foreground italic">No documents yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FolderTreePanel ────────────────────────────────────────────────────────────

export function FolderTreePanel({
  folders,
  slots,
  matterId: _matterId,
  renderSlot,
}: FolderTreePanelProps) {
  // Group slots by folder_id
  const { slotsByFolder, unfiledSlots } = useMemo(() => {
    const byFolder = new Map<string, DocumentSlot[]>()
    const unfiled: DocumentSlot[] = []

    for (const slot of slots) {
      if (slot.folder_id) {
        const list = byFolder.get(slot.folder_id) ?? []
        list.push(slot)
        byFolder.set(slot.folder_id, list)
      } else {
        unfiled.push(slot)
      }
    }

    return { slotsByFolder: byFolder, unfiledSlots: unfiled }
  }, [slots])

  return (
    <div className="space-y-1">
      {/* Folder tree */}
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          slotsByFolder={slotsByFolder}
          unfiledSlots={unfiledSlots}
          depth={0}
          renderSlot={renderSlot}
        />
      ))}

      {/* Unfiled documents */}
      {unfiledSlots.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-500">
              Other Documents
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {unfiledSlots.length}
            </Badge>
          </div>
          <div className="ml-10 space-y-2 mt-2">
            {unfiledSlots.map((slot) => renderSlot(slot))}
          </div>
        </div>
      )}
    </div>
  )
}
