'use client'

import { useState, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useDocuments, useDeleteDocument } from '@/lib/queries/documents'
import { DocumentUpload } from '@/components/shared/document-upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileText,
  Info,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FolderOpen,
  FileCheck,
  File,
  Eye,
  Trash2,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { DocumentViewer } from '@/components/shared/document-viewer'

// ─── Category groups ────────────────────────────────────────────────

interface CategoryGroup {
  id: string
  label: string
  icon: typeof FileText
  categories: string[]
  description: string
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'id_documents',
    label: 'ID Documents',
    icon: CreditCard,
    categories: ['identification'],
    description: "Driver's licence, passport, PR card",
  },
  {
    id: 'client_documents',
    label: 'Client Documents',
    icon: FolderOpen,
    categories: ['general', 'contract', 'correspondence', 'financial', 'property', 'court_filing'],
    description: 'Contracts, financials, correspondence',
  },
  {
    id: 'ircc_documents',
    label: 'IRCC Documents',
    icon: FileCheck,
    categories: ['immigration'],
    description: 'Immigration forms, confirmations, letters',
  },
  {
    id: 'other',
    label: 'Other Documents',
    icon: File,
    categories: ['other'],
    description: 'Miscellaneous documents',
  },
]

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageFile(fileType: string | null): boolean {
  return !!fileType && fileType.startsWith('image/')
}

// ─── Component ──────────────────────────────────────────────────────

export function CategorizedDocumentInbox() {
  const { entityType, entityId, tenantId, contact } = useCommandCentre()

  // Derive entity name for document auto-naming
  const entityName = useMemo(() => {
    if (!contact) return undefined
    if (contact.contact_type === 'organization') {
      return contact.organization_name || undefined
    }
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
    return name || undefined
  }, [contact])

  const entityKey = entityType === 'matter' ? 'matterId' : 'leadId'
  const { data: documents } = useDocuments({
    tenantId,
    [entityKey]: entityId,
  })

  const deleteMutation = useDeleteDocument()

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['id_documents', 'client_documents'])
  )
  const [viewerDoc, setViewerDoc] = useState<{
    storagePath: string
    fileName: string
    fileType: string | null
    storageBucket?: string | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    storagePath: string
    name: string
  } | null>(null)

  // Group documents by category
  const groupedDocs = useMemo(() => {
    if (!documents) return new Map<string, typeof documents>()

    const map = new Map<string, typeof documents>()
    for (const group of CATEGORY_GROUPS) {
      const matching = documents.filter((doc) =>
        group.categories.includes(doc.category ?? 'general')
      )
      map.set(group.id, matching)
    }

    // Unmapped categories go to "other"
    const allMappedCategories = CATEGORY_GROUPS.flatMap((g) => g.categories)
    const unmapped = documents.filter(
      (doc) => !allMappedCategories.includes(doc.category ?? 'general')
    )
    if (unmapped.length > 0) {
      const existing = map.get('other') ?? []
      map.set('other', [...existing, ...unmapped])
    }

    return map
  }, [documents])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync({
      id: deleteTarget.id,
      storagePath: deleteTarget.storagePath,
    })
    setDeleteTarget(null)
  }

  const totalDocs = documents?.length ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4" />
            Pre-Retainer Inbox
            {totalDocs > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {totalDocs}
              </Badge>
            )}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-slate-400 font-normal">
            Staff Reference Only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 text-blue-400 shrink-0" />
          <p className="text-xs text-blue-600">
            Documents uploaded here are for staff reference only. Slot-based requirements activate after retention.
          </p>
        </div>

        {/* Upload area */}
        <DocumentUpload
          entityType={entityType === 'matter' ? 'matter' : 'lead'}
          entityId={entityId}
          tenantId={tenantId}
          entityName={entityName}
          hideList
        />

        {/* Category-grouped document list */}
        {totalDocs > 0 && (
          <div className="space-y-2 mt-4">
            {CATEGORY_GROUPS.map((group) => {
              const docs = groupedDocs.get(group.id) ?? []
              if (docs.length === 0) return null

              const isExpanded = expandedGroups.has(group.id)
              const GroupIcon = group.icon

              return (
                <div key={group.id}>
                  {/* Group header */}
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
                    onClick={() => toggleGroup(group.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <GroupIcon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-slate-700">{group.label}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {docs.length}
                    </Badge>
                  </button>

                  {/* Group content */}
                  {isExpanded && (
                    <div className="pl-7 space-y-1.5 mt-1">
                      {docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 group"
                        >
                          {/* Thumbnail for ID documents */}
                          {group.id === 'id_documents' && (
                            <button
                              type="button"
                              className={cn(
                                'shrink-0 flex items-center justify-center cursor-pointer',
                                isImageFile(doc.file_type)
                                  ? 'h-10 w-14 rounded border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-blue-300'
                                  : 'h-10 w-14 rounded hover:bg-slate-100'
                              )}
                              onClick={() =>
                                setViewerDoc({
                                  storagePath: doc.storage_path,
                                  fileName: doc.file_name,
                                  fileType: doc.file_type,
                                  storageBucket: doc.storage_bucket,
                                })
                              }
                            >
                              <Eye className="h-4 w-4 text-slate-400" />
                            </button>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {doc.file_name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {formatFileSize(doc.file_size)}
                              {doc.created_at && ` · ${formatDate(doc.created_at)}`}
                            </p>
                          </div>

                          {/* Action buttons — visible on hover */}
                          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              onClick={() =>
                                setViewerDoc({
                                  storagePath: doc.storage_path,
                                  fileName: doc.file_name,
                                  fileType: doc.file_type,
                                  storageBucket: doc.storage_bucket,
                                })
                              }
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                              onClick={() =>
                                setDeleteTarget({
                                  id: doc.id,
                                  storagePath: doc.storage_path,
                                  name: doc.file_name,
                                })
                              }
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Document Viewer */}
      {viewerDoc && (
        <DocumentViewer
          storagePath={viewerDoc.storagePath}
          fileName={viewerDoc.fileName}
          fileType={viewerDoc.fileType}
          storageBucket={viewerDoc.storageBucket ?? undefined}
          open={!!viewerDoc}
          onOpenChange={(open) => {
            if (!open) setViewerDoc(null)
          }}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
