'use client'

import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  Shield,
  ShieldCheck,
  Users,
  Pencil,
  Check,
  Plus,
  Trash2,
  List,
  Tags,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  useIrccForm,
  useIrccFormFields,
  useIrccFormSections,
  useUpdateIrccFormField,
  useUpdateIrccFormSection,
  useIrccFormPreview,
  useRescanIrccForm,
  useRelabelIrccFormFields,
  useIrccFormArrayMaps,
  useCreateIrccFormArrayMap,
  useDeleteIrccFormArrayMap,
  type IrccFormPreviewResult,
} from '@/lib/queries/ircc-forms'
import type { IrccFormSection } from '@/lib/types/ircc-forms'
import { PROFILE_PATH_CATALOG } from '@/lib/ircc/profile-path-catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { IrccFormField, IrccFieldType, IrccFormArrayMap } from '@/lib/types/ircc-forms'

// ── Field type options ─────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'country', label: 'Country' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'repeater', label: 'Repeater' },
]

// ── Profile path autocomplete ──────────────────────────────────────────────────

function ProfilePathCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return PROFILE_PATH_CATALOG.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q),
    ).slice(0, 8)
  }, [query])

  return (
    <div className="relative">
      <Input
        value={query}
        className="h-7 text-xs font-mono"
        placeholder="e.g. personal.family_name"
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
          {matches.map((e) => (
            <button
              key={e.path}
              type="button"
              className="w-full text-left px-2.5 py-1.5 hover:bg-muted text-xs"
              onMouseDown={() => {
                setQuery(e.path)
                onChange(e.path)
                setOpen(false)
              }}
            >
              <span className="font-mono text-blue-600">{e.path}</span>
              <span className="text-muted-foreground ml-1.5"> -  {e.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Preview Panel ─────────────────────────────────────────────────────────────

function PreviewPanel({
  formId,
  pageCount,
  open,
  onClose,
}: {
  formId: string
  pageCount: number
  open: boolean
  onClose: () => void
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [previewResult, setPreviewResult] = useState<IrccFormPreviewResult | null>(null)
  const preview = useIrccFormPreview()

  const runPreview = useCallback(
    (page: number) => {
      preview.mutate(
        { formId, page },
        {
          onSuccess: (result) => {
            setPreviewResult(result)
          },
        },
      )
    },
    [formId, preview],
  )

  const handlePageChange = (newPage: number) => {
    setPageIndex(newPage)
    runPreview(newPage)
  }

  const currentImage = previewResult?.images.find((img) => img.page === pageIndex)

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-[560px] max-w-full flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Form Preview</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                Approximate render  -  verify final output in Adobe Reader
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Controls */}
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
          {/* Page navigation */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={pageIndex === 0}
              onClick={() => handlePageChange(pageIndex - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              Page {pageIndex + 1}
              {previewResult ? ` / ${previewResult.page_count}` : ''}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={previewResult ? pageIndex >= previewResult.page_count - 1 : false}
              onClick={() => handlePageChange(pageIndex + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            disabled={preview.isPending}
            onClick={() => runPreview(pageIndex)}
          >
            {preview.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {previewResult ? 'Refresh' : 'Render'}
          </Button>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto bg-slate-100 flex items-start justify-center p-4">
          {preview.isPending && (
            <div className="flex flex-col items-center gap-3 mt-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Rendering PDF…</span>
            </div>
          )}

          {!preview.isPending && !previewResult && (
            <div className="flex flex-col items-center gap-3 mt-20 text-muted-foreground">
              <Eye className="h-8 w-8 opacity-40" />
              <p className="text-sm text-center max-w-[200px]">
                Click Render to generate a preview with placeholder field values
              </p>
            </div>
          )}

          {!preview.isPending && currentImage?.base64_png && (
            <img
              src={`data:image/png;base64,${currentImage.base64_png}`}
              alt={`Page ${pageIndex + 1} preview`}
              className="w-full shadow-md rounded"
              style={{ maxWidth: currentImage.width }}
            />
          )}

          {!preview.isPending && currentImage?.error && (
            <div className="flex flex-col items-center gap-2 mt-20 text-destructive">
              <AlertCircle className="h-6 w-6" />
              <p className="text-sm">{currentImage.error}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Section Header Row ────────────────────────────────────────────────────────

function SectionHeaderRow({
  section,
  fieldCount,
}: {
  section: IrccFormSection
  fieldCount: number
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(section.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateSection = useUpdateIrccFormSection()

  const startEdit = () => {
    setTitle(section.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSave = () => {
    if (!title.trim() || title.trim() === section.title) {
      setEditing(false)
      return
    }
    updateSection.mutate(
      { sectionId: section.id, formId: section.form_id, title: title.trim() },
      { onSuccess: () => setEditing(false) },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditing(false); setTitle(section.title) }
  }

  return (
    <TableRow className="bg-slate-50 hover:bg-slate-100 border-t-2 border-slate-200">
      <TableCell colSpan={7} className="py-1.5 px-4">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className="text-xs font-semibold text-slate-700 bg-white border border-blue-400 rounded px-2 py-0.5 w-64 outline-none"
              />
              <button
                onClick={handleSave}
                disabled={updateSection.isPending}
                className="h-5 w-5 flex items-center justify-center rounded text-green-600 hover:bg-emerald-950/30"
              >
                {updateSection.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                onClick={() => { setEditing(false); setTitle(section.title) }}
                className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                {section.title}
              </span>
              <button
                onClick={startEdit}
                className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-600 hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Rename section"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              <span className="text-[10px] text-slate-400 ml-1">{fieldCount} field{fieldCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Editable Row ──────────────────────────────────────────────────────────────

function FieldRow({ field }: { field: IrccFormField }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(field.label ?? field.suggested_label ?? '')
  const [profilePath, setProfilePath] = useState(field.profile_path ?? '')
  const [fieldType, setFieldType] = useState<IrccFieldType>(field.field_type ?? 'text')
  const [isRequired, setIsRequired] = useState(field.is_required ?? false)
  const [isClientVisible, setIsClientVisible] = useState(field.is_client_visible ?? false)

  const updateField = useUpdateIrccFormField()

  const handleSave = () => {
    updateField.mutate(
      {
        fieldId: field.id,
        formId: field.form_id,
        updates: {
          label: label || null,
          profile_path: profilePath || null,
          field_type: fieldType,
          is_required: isRequired,
          is_client_visible: isClientVisible,
        },
      },
      {
        onSuccess: () => setEditing(false),
      },
    )
  }

  const handleCancel = () => {
    setLabel(field.label ?? field.suggested_label ?? '')
    setProfilePath(field.profile_path ?? '')
    setFieldType(field.field_type ?? 'text')
    setIsRequired(field.is_required ?? false)
    setIsClientVisible(field.is_client_visible ?? false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <TableRow
        className="cursor-pointer hover:bg-muted/40 group"
        onClick={() => setEditing(true)}
      >
        <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate">
          {field.xfa_path}
        </TableCell>
        <TableCell className="text-xs max-w-[150px] truncate">{field.label ?? field.suggested_label ?? ' - '}</TableCell>
        <TableCell className="font-mono text-xs text-blue-600 max-w-[180px] truncate">
          {field.profile_path ?? (
            <span className="text-muted-foreground italic">unmapped</span>
          )}
        </TableCell>
        <TableCell className="text-xs">{field.field_type ?? ' - '}</TableCell>
        <TableCell className="text-center">
          {field.is_required ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
          ) : (
            <span className="text-muted-foreground"> - </span>
          )}
        </TableCell>
        <TableCell className="text-center">
          {field.is_client_visible ? (
            <Eye className="h-3.5 w-3.5 text-blue-600 mx-auto" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground mx-auto opacity-40" />
          )}
        </TableCell>
        <TableCell className="text-center">
          {field.is_mapped ? (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-400 bg-emerald-950/30">
              mapped
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-muted-foreground">
              raw
            </Badge>
          )}
        </TableCell>
      </TableRow>
    )
  }

  // Editing mode
  return (
    <TableRow className="bg-muted/20">
      <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate align-top pt-2">
        {field.xfa_path}
      </TableCell>
      <TableCell className="align-top pt-1.5">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-7 text-xs"
          placeholder="Field label"
        />
      </TableCell>
      <TableCell className="align-top pt-1.5">
        <ProfilePathCombobox value={profilePath} onChange={setProfilePath} />
      </TableCell>
      <TableCell className="align-top pt-1.5">
        <Select value={fieldType} onValueChange={(v) => setFieldType(v as IrccFieldType)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-center align-top pt-2">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="h-3.5 w-3.5 accent-green-600"
        />
      </TableCell>
      <TableCell className="text-center align-top pt-2">
        <input
          type="checkbox"
          checked={isClientVisible}
          onChange={(e) => setIsClientVisible(e.target.checked)}
          className="h-3.5 w-3.5 accent-blue-600"
        />
      </TableCell>
      <TableCell className="align-top pt-1.5">
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-6 text-[11px] px-2"
            disabled={updateField.isPending}
            onClick={handleSave}
          >
            {updateField.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Array Maps Panel ──────────────────────────────────────────────────────────

function AddArrayMapDialog({
  formId,
  open,
  onClose,
}: {
  formId: string
  open: boolean
  onClose: () => void
}) {
  const [profilePath, setProfilePath] = useState('')
  const [xfaBasePath, setXfaBasePath] = useState('')
  const [xfaEntryName, setXfaEntryName] = useState('')
  const [maxEntries, setMaxEntries] = useState('6')
  // sub_fields as an ordered list of [key, xfaSubPath] pairs
  const [subFields, setSubFields] = useState<Array<[string, string]>>([['', '']])

  const create = useCreateIrccFormArrayMap()

  const reset = () => {
    setProfilePath('')
    setXfaBasePath('')
    setXfaEntryName('')
    setMaxEntries('6')
    setSubFields([['', '']])
  }

  const handleClose = () => { reset(); onClose() }

  const handleAddRow = () => setSubFields((prev) => [...prev, ['', '']])

  const handleRemoveRow = (i: number) =>
    setSubFields((prev) => prev.filter((_, idx) => idx !== i))

  const handleSubFieldChange = (i: number, col: 0 | 1, val: string) =>
    setSubFields((prev) => prev.map((row, idx) => idx === i ? (col === 0 ? [val, row[1]] : [row[0], val]) : row))

  const handleSubmit = () => {
    if (!profilePath || !xfaBasePath || !xfaEntryName) {
      toast.error('Profile path, XFA base path, and entry name are required')
      return
    }
    const sub: Record<string, string> = {}
    for (const [k, v] of subFields) {
      if (k && v) sub[k] = v
    }
    if (Object.keys(sub).length === 0) {
      toast.error('At least one sub-field mapping is required')
      return
    }
    create.mutate(
      {
        form_id: formId,
        profile_path: profilePath.trim(),
        xfa_base_path: xfaBasePath.trim(),
        xfa_entry_name: xfaEntryName.trim(),
        max_entries: parseInt(maxEntries) || 6,
        sub_fields: sub,
      },
      { onSuccess: handleClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Array Map</DialogTitle>
          <DialogDescription>
            Map a profile array (e.g. <code className="text-xs bg-muted px-1 rounded">family.children</code>) to
            a repeating XFA table section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Profile Path <span className="text-red-500">*</span></label>
              <Input
                value={profilePath}
                onChange={(e) => setProfilePath(e.target.value)}
                placeholder="e.g. family.children"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Dot-path to the array in the profile object</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">XFA Base Path <span className="text-red-500">*</span></label>
              <Input
                value={xfaBasePath}
                onChange={(e) => setXfaBasePath(e.target.value)}
                placeholder="e.g. SectionB.SectionBinfo"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">XFA path to the repeating container</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Entry Name <span className="text-red-500">*</span></label>
              <Input
                value={xfaEntryName}
                onChange={(e) => setXfaEntryName(e.target.value)}
                placeholder="e.g. Child"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Name of each XFA entry element</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Max Entries</label>
              <Input
                type="number"
                min="1"
                max="20"
                value={maxEntries}
                onChange={(e) => setMaxEntries(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Maximum items to fill from the array</p>
            </div>
          </div>

          {/* Sub-fields editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">Sub-field Mappings <span className="text-red-500">*</span></label>
              <Button type="button" variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={handleAddRow}>
                <Plus className="h-3 w-3" /> Add Row
              </Button>
            </div>
            <div className="rounded border overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-0 bg-muted/40 border-b px-2 py-1">
                <span className="text-[10px] font-medium text-muted-foreground">Profile Key</span>
                <span className="text-[10px] font-medium text-muted-foreground">XFA Sub-path</span>
                <span className="w-6" />
              </div>
              <div className="divide-y">
                {subFields.map(([k, v], i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-0 items-center px-2 py-1">
                    <Input
                      value={k}
                      onChange={(e) => handleSubFieldChange(i, 0, e.target.value)}
                      placeholder="e.g. family_name"
                      className="h-7 text-xs font-mono border-0 shadow-none focus-visible:ring-0 rounded-none"
                    />
                    <Input
                      value={v}
                      onChange={(e) => handleSubFieldChange(i, 1, e.target.value)}
                      placeholder="e.g. PaddedEntry.Row.FamilyName"
                      className="h-7 text-xs font-mono border-0 border-l shadow-none focus-visible:ring-0 rounded-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending} className="gap-1">
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create Array Map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ArrayMapsPanel({ formId }: { formId: string }) {
  const [addOpen, setAddOpen] = useState(false)
  const { data: arrayMaps = [], isLoading } = useIrccFormArrayMaps(formId)
  const deleteMap = useDeleteIrccFormArrayMap()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Array Maps</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Map profile arrays (children, siblings, addresses…) to repeating XFA table sections.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Array Map
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : arrayMaps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed text-muted-foreground gap-2">
          <List className="h-8 w-8 opacity-30" />
          <p className="text-sm">No array maps defined for this form.</p>
          <p className="text-xs">Add one to fill repeating XFA table sections from profile arrays.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs h-8">Profile Path</TableHead>
                <TableHead className="text-xs h-8">XFA Base Path</TableHead>
                <TableHead className="text-xs h-8">Entry Name</TableHead>
                <TableHead className="text-xs h-8 text-center">Max</TableHead>
                <TableHead className="text-xs h-8 text-center">Sub-fields</TableHead>
                <TableHead className="text-xs h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {arrayMaps.map((am: IrccFormArrayMap) => (
                <TableRow key={am.id} className="group">
                  <TableCell className="font-mono text-xs text-blue-600">{am.profile_path}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{am.xfa_base_path}</TableCell>
                  <TableCell className="text-xs">{am.xfa_entry_name}</TableCell>
                  <TableCell className="text-xs text-center tabular-nums">{am.max_entries}</TableCell>
                  <TableCell className="text-xs text-center">
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 cursor-default">
                          {Object.keys(am.sub_fields).length} fields
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-0.5 text-xs font-mono">
                          {Object.entries(am.sub_fields).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-blue-400">{k}</span>
                              <span className="text-muted-foreground"> → </span>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => deleteMap.mutate({ mapId: am.id, formId })}
                      disabled={deleteMap.isPending}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete array map"
                    >
                      {deleteMap.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddArrayMapDialog formId={formId} open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IrccFormEditorPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId
  const router = useRouter()

  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'fields' | 'array-maps'>('fields')
  const [search, setSearch] = useState('')
  const [filterMapped, setFilterMapped] = useState<'all' | 'mapped' | 'unmapped'>('all')

  const { data: form, isLoading: formLoading, error: formError } = useIrccForm(formId)
  const { data: fields, isLoading: fieldsLoading } = useIrccFormFields(formId)
  const { data: sections = [] } = useIrccFormSections(formId)
  const rescan = useRescanIrccForm()
  const relabel = useRelabelIrccFormFields()

  const pageCount = 1 // page_number per field used for page selector if available

  const filteredFields = useMemo(() => {
    if (!fields) return []
    return fields.filter((f: IrccFormField) => {
      const matchSearch =
        !search ||
        f.xfa_path?.toLowerCase().includes(search.toLowerCase()) ||
        f.label?.toLowerCase().includes(search.toLowerCase()) ||
        f.profile_path?.toLowerCase().includes(search.toLowerCase())

      const matchMapped =
        filterMapped === 'all' ||
        (filterMapped === 'mapped' && f.is_mapped) ||
        (filterMapped === 'unmapped' && !f.is_mapped)

      return matchSearch && matchMapped
    })
  }, [fields, search, filterMapped])

  const mappedCount = useMemo(() => fields?.filter((f: IrccFormField) => f.is_mapped).length ?? 0, [fields])
  const clientVisibleCount = useMemo(
    () => fields?.filter((f: IrccFormField) => f.is_client_visible).length ?? 0,
    [fields],
  )

  if (formLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (formError || !form) {
    return (
      <div className="flex flex-col items-center gap-3 h-64 justify-center text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">Form not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-background">
          <Link
            href="/settings/ircc-form-library"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Forms Library
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{form.form_code}</span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={form.scan_status === 'error' ? 'destructive' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={rescan.isPending}
              onClick={() => rescan.mutate(formId)}
            >
              {rescan.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {form.scan_status === 'error' ? 'Rescan (Error)' : 'Rescan'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={relabel.isPending}
              onClick={() => relabel.mutate(formId)}
              title="Re-read label text from the PDF and update all suggested labels"
            >
              {relabel.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tags className="h-3.5 w-3.5" />
              )}
              Re-label
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
          </div>
        </div>

        {/* Form info bar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b bg-muted/20 text-sm">
          <div>
            <span className="font-semibold font-mono">{form.form_code}</span>
            {form.form_name && (
              <span className="text-muted-foreground ml-1.5"> -  {form.form_name}</span>
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                  <span>{mappedCount} mapped</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Fields with a profile_path assigned</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  <span>{clientVisibleCount} client-visible</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Fields shown in the client portal questionnaire</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1">
                  {form.scan_status === 'scanned' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : form.scan_status === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{form.scan_status}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>XFA scan status</TooltipContent>
            </Tooltip>

            <span>{fields?.length ?? 0} total fields</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-6 border-b bg-background">
          {([
            { id: 'fields', label: 'Fields' },
            { id: 'array-maps', label: 'Array Maps' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Fields tab */}
        {activeTab === 'fields' && (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 px-6 py-3 border-b">
              <Input
                placeholder="Search XFA path, label, profile path…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs max-w-xs"
              />
              <div className="flex items-center gap-1">
                {(['all', 'mapped', 'unmapped'] as const).map((v) => (
                  <Button
                    key={v}
                    variant={filterMapped === v ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => setFilterMapped(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredFields.length} of {fields?.length ?? 0} fields
              </span>
            </div>

            {/* Fields table */}
            <div className="flex-1 overflow-auto">
              {fieldsLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredFields.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  No fields match your filter.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs h-8 w-[180px]">XFA Path</TableHead>
                      <TableHead className="text-xs h-8 w-[150px]">Label</TableHead>
                      <TableHead className="text-xs h-8 w-[180px]">Profile Path</TableHead>
                      <TableHead className="text-xs h-8 w-[100px]">Type</TableHead>
                      <TableHead className="text-xs h-8 w-[70px] text-center">Required</TableHead>
                      <TableHead className="text-xs h-8 w-[80px] text-center">Client</TableHead>
                      <TableHead className="text-xs h-8 w-[80px] text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sections.length > 0 ? (
                      <>
                        {sections.map((section) => {
                          const sectionFields = filteredFields.filter(
                            (f: IrccFormField) => f.section_id === section.id,
                          )
                          if (sectionFields.length === 0) return null
                          return (
                            <React.Fragment key={section.id}>
                              <SectionHeaderRow section={section} fieldCount={sectionFields.length} />
                              {sectionFields.map((field: IrccFormField) => (
                                <FieldRow key={field.id} field={field} />
                              ))}
                            </React.Fragment>
                          )
                        })}
                        {filteredFields.filter((f: IrccFormField) => !f.section_id).length > 0 && (
                          <>
                            <TableRow className="bg-slate-50 border-t-2 border-slate-200">
                              <TableCell colSpan={7} className="py-1.5 px-4">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                  Other ({filteredFields.filter((f: IrccFormField) => !f.section_id).length})
                                </span>
                              </TableCell>
                            </TableRow>
                            {filteredFields
                              .filter((f: IrccFormField) => !f.section_id)
                              .map((field: IrccFormField) => (
                                <FieldRow key={field.id} field={field} />
                              ))}
                          </>
                        )}
                      </>
                    ) : (
                      filteredFields.map((field: IrccFormField) => (
                        <FieldRow key={field.id} field={field} />
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {/* Array Maps tab */}
        {activeTab === 'array-maps' && (
          <div className="flex-1 overflow-auto">
            <ArrayMapsPanel formId={formId} />
          </div>
        )}
      </div>

      {/* Preview panel */}
      <PreviewPanel
        formId={formId}
        pageCount={pageCount}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </TooltipProvider>
  )
}
