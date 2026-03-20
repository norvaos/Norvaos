'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Upload,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ScanSearch,
  Trash2,
  RotateCcw,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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
import { EmptyState } from '@/components/shared/empty-state'
import {
  useIrccForms,
  useUploadIrccForm,
  useDeleteIrccForm,
  useRescanIrccForm,
  useIrccFormFields,
} from '@/lib/queries/ircc-forms'
import type { IrccForm } from '@/lib/types/ircc-forms'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scanStatusBadge(status: string) {
  switch (status) {
    case 'scanned':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Scanned
        </Badge>
      )
    case 'scanning':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scanning
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      )
  }
}

function MappingProgress({ formId }: { formId: string }) {
  const { data: fields } = useIrccFormFields(formId)
  if (!fields) return <Skeleton className="h-4 w-24" />

  const total = fields.length
  const mapped = fields.filter((f) => f.is_mapped).length
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0
  const isComplete = pct === 100

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <Progress value={pct} className="h-2 flex-1" />
      <span
        className={`text-xs font-medium tabular-nums ${
          isComplete ? 'text-green-600' : pct > 50 ? 'text-yellow-600' : 'text-red-600'
        }`}
      >
        {mapped}/{total}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminIrccFormsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [scanFilter, setScanFilter] = useState<string>('all')

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<IrccForm | null>(null)

  const { data: forms, isLoading, error } = useIrccForms()
  const uploadMutation = useUploadIrccForm()
  const deleteMutation = useDeleteIrccForm()
  const rescanMutation = useRescanIrccForm()

  // ── Filter ──
  const filtered = (forms ?? []).filter((f) => {
    if (scanFilter !== 'all' && f.scan_status !== scanFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        f.form_code.toLowerCase().includes(q) ||
        f.form_name.toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Upload handler ──
  const handleUpload = () => {
    if (!uploadFile || !formCode.trim() || !formName.trim()) {
      toast.error('File, form code, and form name are required')
      return
    }
    uploadMutation.mutate(
      {
        file: uploadFile,
        formCode: formCode.trim(),
        formName: formName.trim(),
        description: formDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          setUploadOpen(false)
          setUploadFile(null)
          setFormCode('')
          setFormName('')
          setFormDescription('')
        },
      },
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted')
      return
    }
    setUploadFile(file)
    // Auto-fill form code from filename (e.g., "IMM5257E.pdf" → "IMM5257E")
    const nameWithoutExt = file.name.replace(/\.pdf$/i, '')
    if (!formCode) setFormCode(nameWithoutExt)
    if (!formName) setFormName(nameWithoutExt)
  }

  // ── Loading / Error states ──
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">IRCC Form Library</h1>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">IRCC Form Library</h1>
        </div>
        <EmptyState
          icon={FileText}
          title="Access Denied"
          description={
            error instanceof Error
              ? error.message
              : 'Failed to load forms. Superadmin access required.'
          }
        />
      </div>
    )
  }

  // ── Stats ──
  const totalForms = forms?.length ?? 0
  const scannedForms = forms?.filter((f) => f.scan_status === 'scanned').length ?? 0
  const errorForms = forms?.filter((f) => f.scan_status === 'error').length ?? 0

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">IRCC Form Library</h1>
            <p className="text-muted-foreground text-sm">
              Upload IRCC PDF forms, manage XFA field mappings, and review mapping quality.
            </p>
          </div>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Form
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Forms</div>
          <div className="text-2xl font-bold">{totalForms}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Scanned</div>
          <div className="text-2xl font-bold text-green-600">{scannedForms}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Errors</div>
          <div className="text-2xl font-bold text-red-600">{errorForms}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by form code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={scanFilter} onValueChange={setScanFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Scan Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scanned">Scanned</SelectItem>
            <SelectItem value="scanning">Scanning</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {filtered.length} of {totalForms} forms
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No forms found"
          description={
            search || scanFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Upload your first IRCC form to get started.'
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form Code</TableHead>
                <TableHead>Form Name</TableHead>
                <TableHead>Scan Status</TableHead>
                <TableHead>XFA</TableHead>
                <TableHead>Mapping Progress</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((form) => (
                <TableRow
                  key={form.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/ircc-forms/${form.id}`)}
                >
                  <TableCell className="font-mono font-medium">
                    {form.form_code}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{form.form_name}</div>
                      {form.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {form.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{scanStatusBadge(form.scan_status)}</TableCell>
                  <TableCell>
                    {form.is_xfa ? (
                      <Badge variant="default">XFA</Badge>
                    ) : (
                      <Badge variant="outline">AcroForm</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <MappingProgress formId={form.id} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      v{form.current_version ?? 1}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Re-scan XFA fields"
                        disabled={rescanMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          rescanMutation.mutate(form.id)
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete form"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(form)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload IRCC Form</DialogTitle>
            <DialogDescription>
              Upload a PDF form. The system will scan for XFA fields and auto-map them to profile paths.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File picker */}
            <div className="space-y-2">
              <Label>PDF File</Label>
              <div
                className="flex items-center justify-center rounded-md border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <div className="text-center">
                    <FileText className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-2 text-sm font-medium">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Click to select a PDF file
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Form code */}
            <div className="space-y-2">
              <Label htmlFor="form-code">Form Code</Label>
              <Input
                id="form-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. IMM5257E"
              />
              <p className="text-xs text-muted-foreground">
                Must be unique. Uploading a duplicate code will replace the existing form and preserve mappings.
              </p>
            </div>

            {/* Form name */}
            <div className="space-y-2">
              <Label htmlFor="form-name">Form Name</Label>
              <Input
                id="form-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Application for Temporary Resident Visa"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="form-desc">Description (optional)</Label>
              <Input
                id="form-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of the form"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !uploadFile || !formCode || !formName}
            >
              {uploadMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Upload & Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.form_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the form and all its field mappings. Existing form instances will
              retain their data but new instances cannot be created from this form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  })
                }
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
