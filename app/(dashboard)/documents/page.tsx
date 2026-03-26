'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  useAllDocuments,
  useDocumentStats,
  useUploadDocument,
  useDeleteDocument,
  useDownloadDocument,
  type DocumentWithEntity,
} from '@/lib/queries/documents'
import { useMicrosoftConnection } from '@/lib/queries/microsoft-integration'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { EmptyState } from '@/components/shared/empty-state'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { formatDate } from '@/lib/utils/formatters'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Trash2,
  Download,
  Loader2,
  X,
  Eye,
  Search,
  LayoutGrid,
  List,
  HardDrive,
  FolderOpen,
  Tag,
  Briefcase,
  LinkIcon,
  Cloud,
} from 'lucide-react'

// ── Constants ───────────────────────────────────────────────────────────────

const DOCUMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'contract', label: 'Contract' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'court_filing', label: 'Court Filing' },
  { value: 'identification', label: 'Identification' },
  { value: 'financial', label: 'Financial' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'property', label: 'Property' },
  { value: 'other', label: 'Other' },
] as const

const ENTITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Documents' },
  { value: 'matter', label: 'Linked to Matter' },
  { value: 'contact', label: 'Linked to Contact' },
  { value: 'lead', label: 'Linked to Lead' },
  { value: 'task', label: 'Linked to Task' },
  { value: 'unlinked', label: 'Unlinked' },
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getFileIcon(fileType: string | null) {
  if (!fileType) return File
  if (fileType.startsWith('image/')) return FileImage
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv')) return FileSpreadsheet
  if (fileType.includes('pdf') || fileType.includes('word') || fileType.includes('document')) return FileText
  return File
}

function getFileNameWithoutExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return fileName
  return fileName.substring(0, lastDot)
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return ''
  return fileName.substring(lastDot)
}

function getEntityLabel(doc: DocumentWithEntity): string | null {
  if (doc.matter_title) return doc.matter_number ? `${doc.matter_number}  -  ${doc.matter_title}` : doc.matter_title
  if (doc.contact_id) return 'Contact'
  if (doc.lead_id) return 'Lead'
  if (doc.task_id) return 'Task'
  return null
}

const categoryLabelMap = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]))

// ── Upload Dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  userId: string
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileNames, setFileNames] = useState<Record<number, string>>({})
  const [category, setCategory] = useState('general')
  const [description, setDescription] = useState('')
  const [storageLocation, setStorageLocation] = useState<'local' | 'onedrive'>('local')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadDocument()

  // Check if OneDrive is connected and enabled
  const { data: msConnection } = useMicrosoftConnection(userId)
  const hasOneDrive = !!(msConnection?.is_active && msConnection?.onedrive_enabled)

  const handleFiles = useCallback((files: FileList | null) => {
    if (files) {
      const fileArray = Array.from(files)
      setSelectedFiles(fileArray)
      const names: Record<number, string> = {}
      fileArray.forEach((file, idx) => {
        names[idx] = getFileNameWithoutExtension(file.name)
      })
      setFileNames(names)
    }
  }, [])

  const handleRemoveFile = (idx: number) => {
    setSelectedFiles((files) => {
      const updated = files.filter((_, i) => i !== idx)
      const newNames: Record<number, string> = {}
      let newIdx = 0
      for (let i = 0; i < files.length; i++) {
        if (i !== idx) {
          newNames[newIdx] = fileNames[i] ?? getFileNameWithoutExtension(files[i].name)
          newIdx++
        }
      }
      setFileNames(newNames)
      return updated
    })
  }

  const handleUpload = async () => {
    if (!selectedFiles.length) return

    const metadataBase = {
      tenant_id: tenantId,
      uploaded_by: userId,
      category,
      description: description || undefined,
    }

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      const editedName = fileNames[i]
      const ext = getFileExtension(file.name)
      const displayName = editedName ? `${editedName}${ext}` : file.name
      await uploadMutation.mutateAsync({
        file,
        metadata: metadataBase,
        displayName,
        storageLocation: hasOneDrive ? storageLocation : undefined,
      })
    }

    setSelectedFiles([])
    setFileNames({})
    setCategory('general')
    setDescription('')
    setStorageLocation('local')
    onOpenChange(false)
  }

  const reset = () => {
    setSelectedFiles([])
    setFileNames({})
    setCategory('general')
    setDescription('')
    setStorageLocation('local')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload files to your firm document library
          </DialogDescription>
        </DialogHeader>

        {selectedFiles.length === 0 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-600">
              <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF, DOC, XLS, Images up to 50MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {selectedFiles.map((file, idx) => {
                const ext = getFileExtension(file.name)
                return (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 flex items-center gap-1">
                      <Input
                        value={fileNames[idx] ?? ''}
                        onChange={(e) => setFileNames((prev) => ({ ...prev, [idx]: e.target.value }))}
                        className="h-7 text-sm"
                        placeholder="File name"
                      />
                      <span className="text-xs text-slate-400 shrink-0">{ext}</span>
                    </div>
                    <span className="text-slate-400 text-xs shrink-0">{formatFileSize(file.size)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRemoveFile(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                className="mt-1"
                placeholder="Brief description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {hasOneDrive && (
              <div>
                <label className="text-sm font-medium">Save to</label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button"
                    variant={storageLocation === 'local' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setStorageLocation('local')}
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    NorvaOS
                  </Button>
                  <Button
                    type="button"
                    variant={storageLocation === 'onedrive' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setStorageLocation('onedrive')}
                  >
                    <Cloud className="h-4 w-4 mr-2" />
                    OneDrive
                  </Button>
                </div>
                {storageLocation === 'onedrive' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    File will be saved to your OneDrive in the NorvaOS folder.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploadMutation.isPending || !selectedFiles.length}>
            {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload {selectedFiles.length > 0 && `(${selectedFiles.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Document Card (Grid View) ────────────────────────────────────────────────

function DocumentCard({
  doc,
  onView,
  onDownload,
  onDelete,
  isDownloading,
}: {
  doc: DocumentWithEntity
  onView: () => void
  onDownload: () => void
  onDelete: () => void
  isDownloading: boolean
}) {
  const FileIcon = getFileIcon(doc.file_type)
  const entityLabel = getEntityLabel(doc)

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <FileIcon className="h-5 w-5 text-slate-500" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate" title={doc.file_name}>
              {doc.file_name}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-xs py-0">
                {categoryLabelMap[doc.category] ?? doc.category}
              </Badge>
              {entityLabel ? (
                <Badge variant="secondary" className="text-xs py-0 max-w-[160px] truncate">
                  <Briefcase className="mr-1 h-3 w-3 shrink-0" />
                  {entityLabel}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs py-0 text-slate-400">
                  <LinkIcon className="mr-1 h-3 w-3" />
                  Unlinked
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
              <span>{formatFileSize(doc.file_size)}</span>
              <span>&bull;</span>
              <span>{formatDate(doc.created_at)}</span>
            </div>
            {doc.description && (
              <p className="text-xs text-slate-500 mt-1 truncate">{doc.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 mt-3 pt-3 border-t">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onView}>
            <Eye className="mr-1 h-3.5 w-3.5" /> View
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDownload} disabled={isDownloading}>
            <Download className="mr-1 h-3.5 w-3.5" /> Download
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600 ml-auto" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Document Row (List View) ─────────────────────────────────────────────────

function DocumentRow({
  doc,
  onView,
  onDownload,
  onDelete,
  isDownloading,
}: {
  doc: DocumentWithEntity
  onView: () => void
  onDownload: () => void
  onDelete: () => void
  isDownloading: boolean
}) {
  const FileIcon = getFileIcon(doc.file_type)
  const entityLabel = getEntityLabel(doc)

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors">
      <div className="flex-shrink-0">
        <FileIcon className="h-7 w-7 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{doc.file_name}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{formatFileSize(doc.file_size)}</span>
          <span>&bull;</span>
          <Badge variant="outline" className="text-xs py-0">
            {categoryLabelMap[doc.category] ?? doc.category}
          </Badge>
          <span>&bull;</span>
          <span>{formatDate(doc.created_at)}</span>
          {entityLabel && (
            <>
              <span>&bull;</span>
              <span className="truncate max-w-[200px]">{entityLabel}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDownload} disabled={isDownloading}>
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()

  // ── State ──
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [entityType, setEntityType] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showUpload, setShowUpload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; storagePath: string; name: string } | null>(null)
  const [viewerDoc, setViewerDoc] = useState<{ storagePath: string; fileName: string; fileType: string | null; externalUrl?: string | null } | null>(null)

  // ── Debounce search ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // ── Queries ──
  const { data: stats, isLoading: statsLoading } = useDocumentStats(tenantId)
  const { data: result, isLoading: docsLoading } = useAllDocuments({
    tenantId,
    search: debouncedSearch || undefined,
    category: category !== 'all' ? category : undefined,
    entityType: entityType !== 'all' ? (entityType as 'matter' | 'contact' | 'lead' | 'task' | 'unlinked') : undefined,
  })

  const documents = result?.documents ?? []
  const totalCount = result?.total ?? 0
  const deleteMutation = useDeleteDocument()
  const downloadMutation = useDownloadDocument()

  // ── Handlers ──
  const handleDownload = async (storagePath: string, fileName: string) => {
    const blob = await downloadMutation.mutateAsync({ storagePath })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync({ id: deleteTarget.id, storagePath: deleteTarget.storagePath })
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Manage all firm documents in one place
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="mr-2 h-4 w-4" /> Upload
        </Button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Documents</p>
              {statsLoading ? (
                <Skeleton className="h-5 w-12 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{stats?.totalDocuments ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
              <HardDrive className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Storage</p>
              {statsLoading ? (
                <Skeleton className="h-5 w-16 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{formatFileSize(stats?.totalSize ?? 0)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
              <Tag className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Categories Used</p>
              {statsLoading ? (
                <Skeleton className="h-5 w-8 mt-0.5" />
              ) : (
                <p className="text-lg font-semibold">{stats?.categoryCount ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Linked to" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Results count ── */}
      {!docsLoading && totalCount > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {documents.length} of {totalCount} document{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Document Grid / List ── */}
      {docsLoading ? (
        <div className={viewMode === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          : 'space-y-2'
        }>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'h-48' : 'h-16'} />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents found"
          description={
            search || category !== 'all' || entityType !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Upload your first document to get started'
          }
          actionLabel={!search && category === 'all' && entityType === 'all' ? 'Upload Document' : undefined}
          onAction={!search && category === 'all' && entityType === 'all' ? () => setShowUpload(true) : undefined}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onView={() => setViewerDoc({ storagePath: doc.storage_path, fileName: doc.file_name, fileType: doc.file_type, externalUrl: doc.onedrive_web_url })}
              onDownload={() => handleDownload(doc.storage_path, doc.file_name)}
              onDelete={() => setDeleteTarget({ id: doc.id, storagePath: doc.storage_path, name: doc.file_name })}
              isDownloading={downloadMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onView={() => setViewerDoc({ storagePath: doc.storage_path, fileName: doc.file_name, fileType: doc.file_type, externalUrl: doc.onedrive_web_url })}
              onDownload={() => handleDownload(doc.storage_path, doc.file_name)}
              onDelete={() => setDeleteTarget({ id: doc.id, storagePath: doc.storage_path, name: doc.file_name })}
              isDownloading={downloadMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Upload Dialog ── */}
      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        tenantId={tenantId}
        userId={appUser?.id ?? ''}
      />

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Document Viewer ── */}
      {viewerDoc && (
        <DocumentViewer
          storagePath={viewerDoc.storagePath}
          fileName={viewerDoc.fileName}
          fileType={viewerDoc.fileType}
          externalUrl={viewerDoc.externalUrl}
          open={!!viewerDoc}
          onOpenChange={(open) => {
            if (!open) setViewerDoc(null)
          }}
        />
      )}
    </div>
  )
}
