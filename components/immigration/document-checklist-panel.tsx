'use client'

import { useState, useCallback } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { useMatterChecklistItems, useUpdateChecklistItem, useInitializeChecklist } from '@/lib/queries/immigration'
import { useDocuments, useDocumentSignedUrl } from '@/lib/queries/documents'
import { CHECKLIST_CATEGORIES, CHECKLIST_STATUSES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileCheck2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Asterisk,
  FolderOpen,
  Eye,
  Download,
  Loader2,
  FileText,
} from 'lucide-react'

import type { Database } from '@/lib/types/database'

type ChecklistItem = Database['public']['Tables']['matter_checklist_items']['Row']
type Document = Database['public']['Tables']['documents']['Row']

interface DocumentChecklistPanelProps {
  matterId: string
  tenantId: string
  caseTypeId?: string | null
}

function getStatusConfig(status: string) {
  return CHECKLIST_STATUSES.find((s) => s.value === status) ?? CHECKLIST_STATUSES[0]
}

function getCategoryLabel(categoryValue: string) {
  return CHECKLIST_CATEGORIES.find((c) => c.value === categoryValue)?.label ?? categoryValue
}

// ==========================================================
// Document Action Button
// ==========================================================

function DocumentActionButton({ document }: { document: Document }) {
  const signedUrlMutation = useDocumentSignedUrl()
  const [isDownloading, setIsDownloading] = useState(false)

  const handleView = useCallback(async () => {
    try {
      const url = await signedUrlMutation.mutateAsync(document.storage_path)
      window.open(url, '_blank')
    } catch {
      // error toast handled by mutation
    }
  }, [signedUrlMutation, document.storage_path])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const url = await signedUrlMutation.mutateAsync(document.storage_path)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document.file_name
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
    } catch {
      // error toast handled by mutation
    } finally {
      setIsDownloading(false)
    }
  }, [signedUrlMutation, document.storage_path, document.file_name])

  const isPending = signedUrlMutation.isPending || isDownloading

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={handleView}
            disabled={isPending}
          >
            {signedUrlMutation.isPending && !isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>View {document.file_name}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            onClick={handleDownload}
            disabled={isPending}
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download {document.file_name}</TooltipContent>
      </Tooltip>
    </div>
  )
}

// ==========================================================
// Main Panel
// ==========================================================

export function DocumentChecklistPanel({
  matterId,
  tenantId,
  caseTypeId,
}: DocumentChecklistPanelProps) {
  const { appUser } = useUser()
  const { data: items, isLoading } = useMatterChecklistItems(matterId)
  const { data: documents } = useDocuments({ tenantId, matterId })
  const updateChecklistItem = useUpdateChecklistItem()
  const initializeChecklist = useInitializeChecklist()

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})

  // Build a map of document_id -> Document for fast lookup
  const documentMap = new Map<string, Document>()
  if (documents) {
    for (const doc of documents) {
      documentMap.set(doc.id, doc)
    }
  }

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  const handleStatusChange = useCallback(
    (itemId: string, newStatus: string) => {
      updateChecklistItem.mutate({
        id: itemId,
        status: newStatus,
        tenantId,
        userId: appUser?.id,
      })
    },
    [updateChecklistItem, tenantId, appUser]
  )

  const handleNotesBlur = useCallback(
    (itemId: string, notes: string) => {
      updateChecklistItem.mutate({ id: itemId, notes })
      setEditingNotes((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    },
    [updateChecklistItem]
  )

  const handleInitialize = useCallback(() => {
    if (!caseTypeId) return
    initializeChecklist.mutate({ matterId, tenantId, caseTypeId })
  }, [initializeChecklist, matterId, tenantId, caseTypeId])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // Empty state - no items, no case type
  if ((!items || items.length === 0) && !caseTypeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FolderOpen className="h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-sm font-medium text-slate-900">No checklist items</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Set a case type on this matter to initialize a document checklist from a template.
        </p>
      </div>
    )
  }

  // Empty state - no items, but has case type
  if ((!items || items.length === 0) && caseTypeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-sm font-medium text-slate-900">No checklist items yet</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Initialize the document checklist from the case type template to get started.
        </p>
        <Button
          className="mt-4"
          onClick={handleInitialize}
          disabled={initializeChecklist.isPending}
        >
          <FileCheck2 className="h-4 w-4 mr-2" />
          {initializeChecklist.isPending ? 'Initializing...' : 'Initialize Checklist from Template'}
        </Button>
      </div>
    )
  }

  // Group items by category
  const grouped = new Map<string, ChecklistItem[]>()
  for (const item of items ?? []) {
    const cat = item.category || 'general'
    if (!grouped.has(cat)) {
      grouped.set(cat, [])
    }
    grouped.get(cat)!.push(item)
  }

  // Sort categories by the order defined in CHECKLIST_CATEGORIES
  const categoryOrder = CHECKLIST_CATEGORIES.map((c) => c.value)
  const sortedCategories = [...grouped.entries()].sort(
    (a, b) => categoryOrder.indexOf(a[0] as typeof categoryOrder[number]) - categoryOrder.indexOf(b[0] as typeof categoryOrder[number])
  )

  // Calculate file completion score
  const totalItems = items?.length ?? 0
  const completedItems =
    items?.filter(
      (item) => item.status === 'approved' || item.status === 'not_applicable'
    ).length ?? 0
  const completionPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  // Check if any items have documents attached
  const hasAnyDocuments = items?.some((item) => item.document_id) ?? false

  return (
    <div className="space-y-4">
      {/* File Completion Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">File Completion Score</span>
          <span className="text-sm font-semibold text-slate-900">{completionPercent}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              completionPercent === 100
                ? 'bg-green-500'
                : completionPercent >= 75
                  ? 'bg-blue-500'
                  : completionPercent >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500'
            )}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {completedItems} of {totalItems} items approved or N/A
        </p>
      </div>

      {/* Category groups */}
      <div className="space-y-3">
        {sortedCategories.map(([category, categoryItems]) => {
          const isCollapsed = collapsedCategories.has(category)
          const catCompleted = categoryItems.filter(
            (i) => i.status === 'approved' || i.status === 'not_applicable'
          ).length

          return (
            <div key={category} className="border rounded-lg overflow-hidden">
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {getCategoryLabel(category)}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {catCompleted}/{categoryItems.length}
                </span>
              </button>

              {/* Items table */}
              {!isCollapsed && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={hasAnyDocuments ? 'w-[30%]' : 'w-[35%]'}>Document</TableHead>
                      <TableHead className="w-[20%]">Status</TableHead>
                      {hasAnyDocuments && (
                        <TableHead className="w-[10%]">File</TableHead>
                      )}
                      <TableHead className={hasAnyDocuments ? 'w-[40%]' : 'w-[45%]'}>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryItems
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => {
                        const statusConfig = getStatusConfig(item.status)
                        const isEditingNotes = item.id in editingNotes
                        const linkedDoc = item.document_id ? documentMap.get(item.document_id) : null

                        return (
                          <TableRow key={item.id}>
                            {/* Document name */}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-slate-900">
                                  {item.document_name}
                                </span>
                                {item.is_required && (
                                  <Asterisk className="h-3 w-3 text-red-500 flex-shrink-0" />
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                  {item.description}
                                </p>
                              )}
                            </TableCell>

                            {/* Status dropdown */}
                            <TableCell>
                              <Select
                                value={item.status}
                                onValueChange={(value) => handleStatusChange(item.id, value)}
                              >
                                <SelectTrigger size="sm" className="h-7 w-full text-xs">
                                  <SelectValue>
                                    <Badge
                                      variant="outline"
                                      className="text-xs py-0 px-1.5 border-0"
                                      style={{
                                        backgroundColor: `${statusConfig.color}20`,
                                        color: statusConfig.color,
                                      }}
                                    >
                                      {statusConfig.label}
                                    </Badge>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {CHECKLIST_STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="h-2 w-2 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: s.color }}
                                        />
                                        {s.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>

                            {/* File action buttons */}
                            {hasAnyDocuments && (
                              <TableCell>
                                {linkedDoc ? (
                                  <DocumentActionButton document={linkedDoc} />
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center justify-center">
                                        <FileText className="h-3.5 w-3.5 text-slate-300" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>No file uploaded yet</TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                            )}

                            {/* Notes */}
                            <TableCell>
                              {isEditingNotes ? (
                                <Input
                                  autoFocus
                                  className="h-7 text-xs"
                                  value={editingNotes[item.id]}
                                  onChange={(e) =>
                                    setEditingNotes((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => handleNotesBlur(item.id, editingNotes[item.id])}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleNotesBlur(item.id, editingNotes[item.id])
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingNotes((prev) => {
                                        const next = { ...prev }
                                        delete next[item.id]
                                        return next
                                      })
                                    }
                                  }}
                                  placeholder="Add notes..."
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="w-full text-left text-xs text-slate-500 hover:text-slate-700 truncate cursor-text py-1"
                                  onClick={() =>
                                    setEditingNotes((prev) => ({
                                      ...prev,
                                      [item.id]: item.notes ?? '',
                                    }))
                                  }
                                >
                                  {item.notes || (
                                    <span className="italic text-slate-400">Add notes...</span>
                                  )}
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
