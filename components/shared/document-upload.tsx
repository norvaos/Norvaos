'use client'

import { useState, useRef, useCallback } from 'react'
import { useDocuments, useUploadDocument, useDeleteDocument, useDownloadDocument, usePersistScanData, type DocumentScanResult } from '@/lib/queries/documents'
import { useMicrosoftConnection } from '@/lib/queries/microsoft-integration'
import { useUser } from '@/lib/hooks/use-user'
import { formatDate } from '@/lib/utils/formatters'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { Skeleton } from '@/components/ui/skeleton'
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
  Paperclip,
  Eye,
  Cloud,
  HardDrive,
  ExternalLink,
  ScanSearch,
} from 'lucide-react'
import { DocumentScanButton } from '@/components/shared/document-scan-button'

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
]

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/rtf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/tiff',
  'image/bmp',
  'image/webp',
]

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.jpg,.jpeg,.png,.heic,.tiff,.tif,.bmp,.webp'

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

interface DocumentUploadProps {
  entityType: 'matter' | 'contact' | 'lead' | 'task'
  entityId: string
  tenantId: string
  entityName?: string
  /** When true, only renders the upload area — hides the document list below */
  hideList?: boolean
}

export function DocumentUpload({ entityType, entityId, tenantId, entityName, hideList }: DocumentUploadProps) {
  const { appUser } = useUser()
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileNames, setFileNames] = useState<Record<number, string>>({})
  const [category, setCategory] = useState('general')
  const [description, setDescription] = useState('')
  const [storageLocation, setStorageLocation] = useState<'local' | 'onedrive'>('local')
  const [deleteId, setDeleteId] = useState<{ id: string; storagePath: string; name: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<{ storagePath: string; fileName: string; fileType: string | null } | null>(null)
  const [scanExtracted, setScanExtracted] = useState<Record<string, string | number | null> | null>(null)
  const [pendingScanData, setPendingScanData] = useState<DocumentScanResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check if OneDrive is connected and enabled
  const { data: msConnection } = useMicrosoftConnection(appUser?.id || '')
  const hasOneDrive = !!(msConnection?.is_active && msConnection?.onedrive_enabled)

  const entityKey =
    entityType === 'matter'
      ? 'matterId'
      : entityType === 'contact'
        ? 'contactId'
        : entityType === 'task'
          ? 'taskId'
          : 'leadId'
  const { data: documents, isLoading } = useDocuments({ tenantId, [entityKey]: entityId })
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()
  const downloadMutation = useDownloadDocument()
  const persistScanMutation = usePersistScanData()

  /** Build an auto-generated display name: {EntityName}_{Category}_{Date}_v{N} */
  const buildAutoName = useCallback(
    (originalName: string, cat: string, idx: number) => {
      if (!entityName) return getFileNameWithoutExtension(originalName)
      const safeName = entityName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '')
      const catLabel = DOCUMENT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat
      const datePart = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      // Determine version number by counting existing docs with similar prefix
      const existingCount =
        documents?.filter(
          (d) => d.file_name.startsWith(`${safeName}_${catLabel}_`)
        ).length ?? 0
      const version = existingCount + idx + 1
      return `${safeName}_${catLabel}_${datePart}_v${version}`
    },
    [entityName, documents]
  )

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of fileArray) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}" exceeds the 25 MB limit (${formatFileSize(file.size)})`)
        continue
      }
      // Validate file type — check MIME type or extension fallback
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const allowedExts = ACCEPTED_EXTENSIONS.split(',').map((e) => e.replace('.', ''))
      if (!ACCEPTED_FILE_TYPES.includes(file.type) && !allowedExts.includes(ext)) {
        errors.push(`"${file.name}" has an unsupported file type`)
        continue
      }
      validFiles.push(file)
    }

    if (errors.length > 0) {
      toast.error(errors.join('. '))
    }

    if (validFiles.length === 0) return

    setSelectedFiles(validFiles)
    // Initialize editable file names — auto-name if entityName provided
    const names: Record<number, string> = {}
    validFiles.forEach((file, idx) => {
      names[idx] = buildAutoName(file.name, category, idx)
    })
    setFileNames(names)
    setShowUploadDialog(true)
  }, [buildAutoName, category])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleUpload = async () => {
    if (!selectedFiles.length || !appUser) return

    const metadataBase = {
      tenant_id: tenantId,
      [`${entityType}_id`]: entityId,
      uploaded_by: appUser?.id ?? '',
      category,
      description: description || undefined,
    }

    let successCount = 0
    const errors: string[] = []

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      const editedName = fileNames[i]
      const ext = getFileExtension(file.name)
      const displayName = editedName ? `${editedName}${ext}` : file.name
      try {
        const uploadedDoc = await uploadMutation.mutateAsync({
          file,
          metadata: metadataBase,
          displayName,
          storageLocation: hasOneDrive ? storageLocation : undefined,
        })
        successCount++

        // Persist scan data to the uploaded document's ai_extracted_data
        if (pendingScanData && uploadedDoc?.id) {
          persistScanMutation.mutate({
            documentId: uploadedDoc.id,
            scanData: pendingScanData,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        errors.push(`"${displayName}": ${msg}`)
      }
    }

    if (successCount > 0 && errors.length === 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`)
    } else if (successCount > 0 && errors.length > 0) {
      toast.warning(`${successCount} uploaded, ${errors.length} failed: ${errors.join('; ')}`)
    } else if (errors.length > 0) {
      toast.error(`Upload failed: ${errors.join('; ')}`)
    }

    setShowUploadDialog(false)
    setSelectedFiles([])
    setFileNames({})
    setCategory('general')
    setDescription('')
    setStorageLocation('local')
    setScanExtracted(null)
    setPendingScanData(null)
  }

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
    if (!deleteId) return
    await deleteMutation.mutateAsync({ id: deleteId.id, storagePath: deleteId.storagePath })
    setDeleteId(null)
  }

  const handleRemoveFile = (idx: number) => {
    setSelectedFiles(files => {
      const updated = files.filter((_, i) => i !== idx)
      // Re-index fileNames
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        {!hideList && (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
        <p className="text-sm text-slate-600">
          <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, XLS, XLSX, CSV, Images up to 25 MB</p>
      </div>

      {/* Document list (hidden when parent manages its own list) */}
      {!hideList && (documents && documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.file_type)
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <FileIcon className="h-8 w-8 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.file_name}</p>
                    {doc.external_provider === 'microsoft_onedrive' && (
                      <Badge variant="secondary" className="text-xs py-0 gap-1 shrink-0">
                        <Cloud className="h-3 w-3" /> OneDrive
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>&bull;</span>
                    <Badge variant="outline" className="text-xs py-0">{doc.category}</Badge>
                    <span>&bull;</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                  {doc.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{doc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (doc.onedrive_web_url) {
                        window.open(doc.onedrive_web_url, '_blank')
                      } else {
                        setViewerDoc({
                          storagePath: doc.storage_path,
                          fileName: doc.file_name,
                          fileType: doc.file_type,
                        })
                      }
                    }}
                  >
                    {doc.onedrive_web_url ? <ExternalLink className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (doc.onedrive_web_url) {
                        window.open(doc.onedrive_web_url, '_blank')
                      } else {
                        handleDownload(doc.storage_path, doc.file_name)
                      }
                    }}
                    disabled={!doc.onedrive_web_url && downloadMutation.isPending}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={() => setDeleteId({ id: doc.id, storagePath: doc.storage_path, name: doc.file_name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <Paperclip className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm">No documents yet</p>
          <p className="text-xs text-slate-400">Upload files to get started</p>
        </div>
      ))}

      {/* Upload dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
            <DialogDescription>
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              {selectedFiles.map((file, idx) => {
                const ext = getFileExtension(file.name)
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="flex-1 flex items-center gap-1">
                        <Input
                          value={fileNames[idx] ?? ''}
                          onChange={(e) =>
                            setFileNames((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                          className="h-7 text-sm"
                          placeholder="File name"
                        />
                        <span className="text-xs text-slate-400 shrink-0">{ext}</span>
                      </div>
                      <span className="text-slate-400 text-xs shrink-0">{formatFileSize(file.size)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleRemoveFile(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Scan Document */}
            {selectedFiles.length === 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <DocumentScanButton
                    file={selectedFiles[0]}
                    documentTypeHint={category}
                    onScanComplete={(scanResult) => {
                      // Store the full scan result for persistence after upload
                      setPendingScanData(scanResult)
                    }}
                    onFieldsExtracted={(fields, detectedType) => {
                      setScanExtracted(fields)
                      // Auto-set category based on detected type
                      const typeMap: Record<string, string> = {
                        passport: 'identification',
                        drivers_licence: 'identification',
                        birth_certificate: 'identification',
                        government_id: 'identification',
                        marriage_certificate: 'identification',
                        bank_statement: 'financial',
                        tax_document: 'financial',
                        employment_letter: 'financial',
                        court_order: 'court_filing',
                        police_clearance: 'general',
                      }
                      const detectedKey = detectedType.toLowerCase().replace(/[\s/]+/g, '_')
                      const mapped = typeMap[detectedKey]
                      if (mapped) setCategory(mapped)
                      if (detectedKey.startsWith('ircc')) setCategory('immigration')
                    }}
                    disabled={uploadMutation.isPending}
                  />
                  <span className="text-xs text-muted-foreground">AI-powered extraction</span>
                </div>
                {scanExtracted && (
                  <div className="border rounded-lg bg-green-50/50 border-green-200 divide-y divide-green-100">
                    <div className="px-3 py-1.5 text-xs font-medium text-green-700 flex items-center gap-1.5">
                      <ScanSearch className="h-3.5 w-3.5" />
                      Extracted Information
                    </div>
                    {Object.entries(scanExtracted)
                      .filter(([, v]) => v !== null)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between px-3 py-1.5 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={category}
                onValueChange={(val) => {
                  setCategory(val)
                  // Regenerate auto-names with new category if entityName provided
                  if (entityName) {
                    const names: Record<number, string> = {}
                    selectedFiles.forEach((file, idx) => {
                      names[idx] = buildAutoName(file.name, val, idx)
                    })
                    setFileNames(names)
                  }
                }}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !selectedFiles.length}>
              {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteId?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer */}
      {viewerDoc && (
        <DocumentViewer
          storagePath={viewerDoc.storagePath}
          fileName={viewerDoc.fileName}
          fileType={viewerDoc.fileType}
          open={!!viewerDoc}
          onOpenChange={(open) => {
            if (!open) setViewerDoc(null)
          }}
        />
      )}
    </div>
  )
}
