'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import {
  Upload,
  FileText,
  FileStack,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  RotateCcw,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Link2,
  Link2Off,
  Scan,
  Eye,
  Folder,
  ClipboardList,
  Plus,
  Pencil,
  History,
  RefreshCw,
  Archive,
  Database,
  ArrowRightLeft,
  LayoutGrid,
  FolderTree,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useIrccForms,
  useUploadIrccForm,
  useDeleteIrccForm,
  useAddStreamFormToMatterType,
  useStreamFormsByMatterType,
  useScanFolder,
  useSyncForms,
} from '@/lib/queries/ircc-forms'
import { useMatterTypes, useMatterTypesByPractice } from '@/lib/queries/matter-types'
import {
  useDocumentSlotTemplatesByMatterType,
  useCreateDocumentSlotTemplate,
  useUpdateDocumentSlotTemplate,
  useDeleteDocumentSlotTemplate,
  type DocumentSlotTemplate,
} from '@/lib/queries/document-slot-templates'
import {
  useMatterFolderTemplates,
  useCreateMatterFolderTemplate,
  useUpdateMatterFolderTemplate,
  useDeleteMatterFolderTemplate,
  useCopyFolderTemplates,
  type FolderTemplateTreeNode,
} from '@/lib/queries/matter-folders'
import { DOCUMENT_SLOT_CATEGORIES, PERSON_ROLE_SCOPES } from '@/lib/utils/constants'
import { TranslationsEditor } from '@/components/ui/translations-editor'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { IrccFormWithStats, FolderScanResult, FolderScanItem, SyncFormRequest } from '@/lib/types/ircc-forms'
import {
  FormCard,
  FormDetailView,
  MoveFormDialog,
  FormVersionHistoryDialog,
  MatterTypeFolder,
  UploadFormDialog,
} from '@/components/ircc'
import { getFormQuestionStats } from '@/lib/ircc/form-question-utils'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = any // API returns untyped data until DB types are generated

// ── Document Slot Dialog ──────────────────────────────────────────────────────

function DocumentSlotDialog({
  open,
  onOpenChange,
  matterTypeId,
  editingSlot,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterTypeId: string
  editingSlot: DocumentSlotTemplate | null
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const createMutation = useCreateDocumentSlotTemplate()
  const updateMutation = useUpdateDocumentSlotTemplate()
  const { data: folderTree } = useMatterFolderTemplates(matterTypeId)

  const [slotName, setSlotName] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({})
  const [category, setCategory] = useState('general')
  const [personRoleScope, setPersonRoleScope] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [folderTemplateId, setFolderTemplateId] = useState<string>('')

  // Flat list of folders for the picker (indented for visual hierarchy)
  const folderOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = []
    function walk(nodes: FolderTemplateTreeNode[], depth: number) {
      for (const node of nodes) {
        opts.push({ id: node.id, label: '\u00a0\u00a0'.repeat(depth) + node.name })
        walk(node.children as FolderTemplateTreeNode[], depth + 1)
      }
    }
    walk(folderTree ?? [], 0)
    return opts
  }, [folderTree])

  // Populate form when editing
  const prevEditId = useRef<string | null>(null)
  if (editingSlot && editingSlot.id !== prevEditId.current) {
    prevEditId.current = editingSlot.id
    setSlotName(editingSlot.slot_name)
    setDescription(editingSlot.description ?? '')
    setDescriptionTranslations(
      (editingSlot.description_translations as Record<string, string>) ?? {},
    )
    setCategory(editingSlot.category)
    setPersonRoleScope(editingSlot.person_role_scope ?? '')
    setIsRequired(editingSlot.is_required)
    setFolderTemplateId(editingSlot.folder_template_id ?? '')
  }

  const resetForm = () => {
    prevEditId.current = null
    setSlotName('')
    setDescription('')
    setDescriptionTranslations({})
    setCategory('general')
    setPersonRoleScope('')
    setIsRequired(true)
    setFolderTemplateId('')
  }

  const handleClose = (v: boolean) => {
    if (!v) resetForm()
    onOpenChange(v)
  }

  const handleSave = async () => {
    if (!slotName.trim()) {
      toast.error('Document name is required')
      return
    }

    const translations = Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : null

    if (editingSlot) {
      await updateMutation.mutateAsync({
        id: editingSlot.id,
        matterTypeId,
        slot_name: slotName.trim(),
        description: description || null,
        description_translations: translations,
        category,
        person_role_scope: personRoleScope || null,
        is_required: isRequired,
        folder_template_id: folderTemplateId || null,
      })
    } else {
      await createMutation.mutateAsync({
        tenant_id: tenantId,
        matter_type_id: matterTypeId,
        slot_name: slotName.trim(),
        description: description || null,
        description_translations: translations,
        category,
        person_role_scope: personRoleScope || null,
        is_required: isRequired,
        folder_template_id: folderTemplateId || null,
      })
    }
    handleClose(false)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingSlot ? 'Edit Document' : 'Add Required Document'}</DialogTitle>
          <DialogDescription>
            {editingSlot
              ? 'Update the document requirements.'
              : 'Define a document that clients must upload for this matter type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document Name */}
          <div className="space-y-1.5">
            <Label>Document Name</Label>
            <Input
              placeholder="e.g. Passport Copy"
              value={slotName}
              onChange={(e) => setSlotName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>
              Description <span className="text-slate-400 text-xs">(shown to client)</span>
            </Label>
            <Textarea
              className="min-h-[60px] text-sm resize-none"
              placeholder="Explain what the client needs to provide (English)"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <TranslationsEditor
              translations={descriptionTranslations}
              onChange={setDescriptionTranslations}
              placeholder="Translated description..."
            />
          </div>

          {/* Category + Person Role */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_SLOT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Person Scope</Label>
              <Select value={personRoleScope} onValueChange={setPersonRoleScope}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_ROLE_SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value || '_none'}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Save to Folder */}
          {folderOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                Save to Folder{' '}
                <span className="text-slate-400 text-xs">(overrides category auto-routing)</span>
              </Label>
              <Select
                value={folderTemplateId || '_none'}
                onValueChange={(v) => setFolderTemplateId(v === '_none' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Auto-route by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">
                    <span className="text-slate-400">Auto-route by category</span>
                  </SelectItem>
                  {folderOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Required */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="slot-required"
              checked={isRequired}
              onCheckedChange={(v) => setIsRequired(!!v)}
            />
            <Label htmlFor="slot-required" className="text-sm font-normal cursor-pointer">
              Required document
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!slotName.trim() || isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingSlot ? 'Save Changes' : 'Add Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Document Slot List (inside folder) ────────────────────────────────────────

function DocumentSlotList({ matterTypeId }: { matterTypeId: string }) {
  const { data: slots, isLoading } = useDocumentSlotTemplatesByMatterType(matterTypeId)
  const deleteMutation = useDeleteDocumentSlotTemplate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<DocumentSlotTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentSlotTemplate | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs"
          onClick={() => {
            setEditingSlot(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Document
        </Button>
      </div>

      {slots && slots.length > 0 ? (
        <div className="space-y-1.5">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 group"
            >
              <ClipboardList className="h-4 w-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{slot.slot_name}</p>
                {slot.description && (
                  <p className="text-xs text-slate-400 truncate">{slot.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {DOCUMENT_SLOT_CATEGORIES.find((c) => c.value === slot.category)?.label ?? slot.category}
                </Badge>
                {slot.is_required && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-amber-600 bg-amber-50">
                    Required
                  </Badge>
                )}
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-opacity"
                  onClick={() => {
                    setEditingSlot(slot)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-opacity"
                  onClick={() => setDeleteTarget(slot)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic py-2">
          No required documents configured yet. Click Add Document to start.
        </p>
      )}

      {/* Document Slot Dialog */}
      <DocumentSlotDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        matterTypeId={matterTypeId}
        editingSlot={editingSlot}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.slot_name}</strong>?
              This will deactivate the document requirement. Existing uploaded documents will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({
                    id: deleteTarget.id,
                    matterTypeId,
                  })
                  setDeleteTarget(null)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Folder Template Dialog ────────────────────────────────────────────────────

function FolderTemplateDialog({
  open,
  onOpenChange,
  matterTypeId,
  editingFolder,
  parentOptions,
  defaultParentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterTypeId: string
  editingFolder: FolderTemplateTreeNode | null
  parentOptions: { id: string; name: string }[]
  defaultParentId?: string
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const createMutation = useCreateMatterFolderTemplate()
  const updateMutation = useUpdateMatterFolderTemplate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({})
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '')
  const [autoAssignCategory, setAutoAssignCategory] = useState<string>('')
  const [sortOrder, setSortOrder] = useState(0)

  // Sync defaultParentId when dialog opens
  const prevDefaultParent = useRef(defaultParentId)
  if (defaultParentId !== prevDefaultParent.current) {
    prevDefaultParent.current = defaultParentId
    setParentId(defaultParentId ?? '')
  }

  // Populate form when editing
  const prevEditId = useRef<string | null>(null)
  if (editingFolder && editingFolder.id !== prevEditId.current) {
    prevEditId.current = editingFolder.id
    setName(editingFolder.name)
    setDescription(editingFolder.description ?? '')
    setDescriptionTranslations(
      (editingFolder.description_translations as Record<string, string>) ?? {},
    )
    setParentId(editingFolder.parent_id ?? '')
    setAutoAssignCategory(editingFolder.auto_assign_category ?? '')
    setSortOrder(editingFolder.sort_order)
  }

  const resetForm = () => {
    prevEditId.current = null
    setName('')
    setDescription('')
    setDescriptionTranslations({})
    setParentId('')
    setAutoAssignCategory('')
    setSortOrder(0)
  }

  const handleClose = (v: boolean) => {
    if (!v) resetForm()
    onOpenChange(v)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Folder name is required')
      return
    }

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const translations = Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : undefined

    if (editingFolder) {
      await updateMutation.mutateAsync({
        id: editingFolder.id,
        matterTypeId,
        name: name.trim(),
        description: description || null,
        description_translations: translations ?? {},
        auto_assign_category: autoAssignCategory || null,
        sort_order: sortOrder,
      })
    } else {
      await createMutation.mutateAsync({
        tenant_id: tenantId,
        matter_type_id: matterTypeId,
        parent_id: parentId || null,
        name: name.trim(),
        slug,
        description: description || null,
        description_translations: translations,
        sort_order: sortOrder,
        folder_type: 'general',
        auto_assign_category: autoAssignCategory || null,
      })
    }
    handleClose(false)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingFolder ? 'Edit Folder' : 'Add Folder'}</DialogTitle>
          <DialogDescription>
            {editingFolder
              ? 'Update the folder template settings.'
              : 'Create a new folder template for this matter type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Folder Name */}
          <div className="space-y-1.5">
            <Label>Folder Name</Label>
            <Input
              placeholder="e.g. Client Information"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>
              Description <span className="text-slate-400 text-xs">(optional)</span>
            </Label>
            <Input
              placeholder="Brief description (English)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <TranslationsEditor
              translations={descriptionTranslations}
              onChange={setDescriptionTranslations}
              placeholder="Translated description..."
            />
          </div>

          {/* Parent Folder (only for new, not editing) */}
          {!editingFolder && parentOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label>Parent Folder <span className="text-slate-400 text-xs">(optional)</span></Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Root level (no parent)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Root level (no parent)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Auto-assign Category + Sort Order */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Auto-assign Category <span className="text-slate-400 text-xs">(optional)</span></Label>
              <Select value={autoAssignCategory} onValueChange={setAutoAssignCategory}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {DOCUMENT_SLOT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingFolder ? 'Save Changes' : 'Add Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Folder Template Tree Row ──────────────────────────────────────────────────

function FolderTemplateRow({
  folder,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  folder: FolderTemplateTreeNode
  depth: number
  onEdit: (folder: FolderTemplateTreeNode) => void
  onDelete: (folder: FolderTemplateTreeNode) => void
  onAddChild: (parentId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const hasChildren = folder.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 group"
        style={{ marginLeft: depth * 20 }}
      >
        {/* Expand/Collapse */}
        {hasChildren ? (
          <button type="button" onClick={() => setIsOpen(!isOpen)} className="shrink-0">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <Folder className="h-4 w-4 text-amber-500 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{folder.name}</p>
          {folder.description && (
            <p className="text-xs text-slate-400 truncate">{folder.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {folder.auto_assign_category && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {DOCUMENT_SLOT_CATEGORIES.find((c) => c.value === folder.auto_assign_category)?.label ?? folder.auto_assign_category}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-slate-500">
            #{folder.sort_order}
          </Badge>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-opacity"
            title="Add subfolder"
            onClick={() => onAddChild(folder.id)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-opacity"
            onClick={() => onEdit(folder)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-opacity"
            onClick={() => onDelete(folder)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {isOpen && hasChildren && (
        <div className="mt-1 space-y-1">
          {folder.children.map((child) => (
            <FolderTemplateRow
              key={child.id}
              folder={child as FolderTemplateTreeNode}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Folder Template List ──────────────────────────────────────────────────────

function FolderTemplateList({ matterTypeId }: { matterTypeId: string }) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { data: folderTree, isLoading } = useMatterFolderTemplates(matterTypeId)
  const { data: allMatterTypes } = useMatterTypes(tenantId)
  const deleteMutation = useDeleteMatterFolderTemplate()
  const copyMutation = useCopyFolderTemplates()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<FolderTemplateTreeNode | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FolderTemplateTreeNode | null>(null)
  const [newParentId, setNewParentId] = useState<string>('')
  const [copyFromOpen, setCopyFromOpen] = useState(false)
  const [copySourceId, setCopySourceId] = useState<string>('')

  // Build flat list of folder templates for parent dropdown
  const parentOptions = useMemo(() => {
    if (!folderTree) return []
    const options: { id: string; name: string }[] = []
    function walk(nodes: FolderTemplateTreeNode[], prefix: string) {
      for (const node of nodes) {
        options.push({ id: node.id, name: prefix + node.name })
        walk(node.children as FolderTemplateTreeNode[], prefix + '  ')
      }
    }
    walk(folderTree, '')
    return options
  }, [folderTree])

  // All matter types except this one, for the copy-from dropdown
  const otherMatterTypes = useMemo(
    () => (allMatterTypes ?? []).filter((mt) => mt.id !== matterTypeId),
    [allMatterTypes, matterTypeId],
  )

  const handleCopyConfirm = () => {
    if (!copySourceId || !tenantId) return
    copyMutation.mutate(
      { sourceMatterTypeId: copySourceId, targetMatterTypeId: matterTypeId, tenantId },
      { onSuccess: () => { setCopyFromOpen(false); setCopySourceId('') } },
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {otherMatterTypes.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setCopyFromOpen(true)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy from…
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs"
          onClick={() => {
            setEditingFolder(null)
            setNewParentId('')
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Folder
        </Button>
      </div>

      {folderTree && folderTree.length > 0 ? (
        <div className="space-y-1">
          {folderTree.map((folder) => (
            <FolderTemplateRow
              key={folder.id}
              folder={folder}
              depth={0}
              onEdit={(f) => {
                setEditingFolder(f)
                setDialogOpen(true)
              }}
              onDelete={setDeleteTarget}
              onAddChild={(parentId) => {
                setEditingFolder(null)
                setNewParentId(parentId)
                setDialogOpen(true)
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic py-2">
          No folder templates configured yet. Click Add Folder to create the folder structure.
        </p>
      )}

      {/* Folder Template Dialog */}
      <FolderTemplateDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) {
            setEditingFolder(null)
            setNewParentId('')
          }
        }}
        matterTypeId={matterTypeId}
        editingFolder={editingFolder}
        parentOptions={parentOptions}
        defaultParentId={newParentId || undefined}
      />

      {/* Copy From Dialog */}
      <Dialog open={copyFromOpen} onOpenChange={(v) => { setCopyFromOpen(v); if (!v) setCopySourceId('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Copy Folder Structure</DialogTitle>
            <DialogDescription>
              Copy all folder templates from another matter type into this one. Folders with the same slug will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs text-slate-600 mb-1.5 block">Copy from</Label>
            <Select value={copySourceId} onValueChange={setCopySourceId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select a matter type…" />
              </SelectTrigger>
              <SelectContent>
                {otherMatterTypes.map((mt) => (
                  <SelectItem key={mt.id} value={mt.id}>
                    {mt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCopyFromOpen(false); setCopySourceId('') }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!copySourceId || copyMutation.isPending}
              onClick={handleCopyConfirm}
            >
              {copyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Copy Folders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?.children && deleteTarget.children.length > 0 && (
                <> This folder has subfolders that will also be removed.</>
              )}
              {' '}Existing matter folders will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({
                    id: deleteTarget.id,
                    matterTypeId,
                  })
                  setDeleteTarget(null)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Add Existing Form Dialog ─────────────────────────────────────────────────

function AddExistingFormDialog({
  open,
  onOpenChange,
  matterTypeId,
  matterTypeName,
  allForms,
  formToMatterTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterTypeId: string
  matterTypeName: string
  allForms: FormData[]
  formToMatterTypes: Record<string, string[]>
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const addMutation = useAddStreamFormToMatterType()
  const [searchQuery, setSearchQuery] = useState('')

  // Forms not yet assigned to this matter type
  const availableForms = useMemo(() => {
    return allForms.filter((f: FormData) => {
      const mtIds = formToMatterTypes[f.id]
      return !mtIds || !mtIds.includes(matterTypeId)
    })
  }, [allForms, formToMatterTypes, matterTypeId])

  const filteredAvailable = useMemo(() => {
    if (!searchQuery) return availableForms
    const lower = searchQuery.toLowerCase()
    return availableForms.filter(
      (f: FormData) =>
        f.form_code.toLowerCase().includes(lower) ||
        f.form_name.toLowerCase().includes(lower),
    )
  }, [availableForms, searchQuery])

  const handleAdd = (formId: string) => {
    addMutation.mutate({
      tenantId,
      matterTypeId,
      formId,
    })
    onOpenChange(false)
    setSearchQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearchQuery('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Existing Form</DialogTitle>
          <DialogDescription>
            Assign an already uploaded form to <strong>{matterTypeName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {availableForms.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search forms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filteredAvailable.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              {availableForms.length === 0
                ? 'All uploaded forms are already assigned to this matter type.'
                : 'No forms match your search.'}
            </p>
          ) : (
            filteredAvailable.map((f: FormData) => (
              <button
                key={f.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => handleAdd(f.id)}
                disabled={addMutation.isPending}
              >
                <FileStack className="h-4 w-4 shrink-0 text-rose-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{f.form_code}</p>
                  <p className="text-xs text-slate-500 truncate">{f.form_name}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {f.scan_status === 'scanned' ? `${f.field_count ?? 0} fields` : f.scan_status}
                </Badge>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Assign to Matter Type Dialog (for unassigned forms) ──────────────────────

function AssignToMatterTypeDialog({
  open,
  onOpenChange,
  form,
  matterTypesWithPA,
  formToMatterTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormData | null
  matterTypesWithPA: Array<{ id: string; name: string; practice_areas?: { name: string; color?: string } | null }> | undefined
  formToMatterTypes: Record<string, string[]>
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const addMutation = useAddStreamFormToMatterType()
  const [searchQuery, setSearchQuery] = useState('')

  // Matter types not yet assigned to this form
  const availableMatterTypes = useMemo(() => {
    if (!matterTypesWithPA || !form) return []
    const assignedMtIds = new Set(formToMatterTypes[form.id] ?? [])
    return matterTypesWithPA.filter((mt) => !assignedMtIds.has(mt.id))
  }, [matterTypesWithPA, form, formToMatterTypes])

  const filteredMatterTypes = useMemo(() => {
    if (!searchQuery) return availableMatterTypes
    const lower = searchQuery.toLowerCase()
    return availableMatterTypes.filter(
      (mt) =>
        mt.name.toLowerCase().includes(lower) ||
        mt.practice_areas?.name?.toLowerCase().includes(lower),
    )
  }, [availableMatterTypes, searchQuery])

  const handleAssign = (matterTypeId: string) => {
    if (!form) return
    addMutation.mutate({
      tenantId,
      matterTypeId,
      formId: form.id,
    })
    onOpenChange(false)
    setSearchQuery('')
  }

  if (!form) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearchQuery('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to Matter Type</DialogTitle>
          <DialogDescription>
            Choose a matter type to assign <strong>{form.form_code}</strong> to.
            The same form can be assigned to multiple matter types.
          </DialogDescription>
        </DialogHeader>

        {availableMatterTypes.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search matter types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filteredMatterTypes.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              {availableMatterTypes.length === 0
                ? 'This form is already assigned to all matter types.'
                : 'No matter types match your search.'}
            </p>
          ) : (
            filteredMatterTypes.map((mt) => (
              <button
                key={mt.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => handleAssign(mt.id)}
                disabled={addMutation.isPending}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{mt.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {mt.practice_areas?.color && (
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: mt.practice_areas.color }}
                      />
                    )}
                    <span className="text-xs text-slate-500">
                      {mt.practice_areas?.name ?? 'Unknown'}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Folder Sync Section (IRCC Forms Vault) ──────────────────────────────────

function FolderSyncSection() {
  const scanMutation = useScanFolder()
  const syncMutation = useSyncForms()
  const [scanResult, setScanResult] = useState<FolderScanResult | null>(null)
  const [formNames, setFormNames] = useState<Record<string, string>>({})
  const [formDates, setFormDates] = useState<Record<string, string>>({})
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set())

  const handleScan = async () => {
    const result = await scanMutation.mutateAsync()
    setScanResult(result)
    // Pre-populate form names with form codes for new items
    const names: Record<string, string> = {}
    for (const item of result.items) {
      if (item.status === 'new') {
        names[item.formCode] = item.formCode
      }
    }
    setFormNames(names)
  }

  const handleSyncItem = async (item: FolderScanItem) => {
    setSyncingItems((prev) => new Set([...prev, item.formCode]))
    const request: SyncFormRequest = {
      fileName: item.fileName,
      formCode: item.formCode,
      formName: formNames[item.formCode] || item.formCode,
      formDate: formDates[item.formCode] || null,
      action: item.status === 'new' ? 'add' : 'update',
    }
    await syncMutation.mutateAsync([request])
    setSyncingItems((prev) => {
      const next = new Set(prev)
      next.delete(item.formCode)
      return next
    })
    // Re-scan to refresh the diff
    const result = await scanMutation.mutateAsync()
    setScanResult(result)
  }

  const handleSyncAll = async () => {
    if (!scanResult) return
    const actionable = scanResult.items.filter(
      (i) => i.status === 'new' || i.status === 'updated',
    )
    if (!actionable.length) return
    const requests: SyncFormRequest[] = actionable.map((item) => ({
      fileName: item.fileName,
      formCode: item.formCode,
      formName: formNames[item.formCode] || item.formCode,
      formDate: formDates[item.formCode] || null,
      action: item.status === 'new' ? 'add' : 'update',
    }))
    await syncMutation.mutateAsync(requests)
    // Re-scan
    const result = await scanMutation.mutateAsync()
    setScanResult(result)
  }

  const actionableCount = scanResult?.items.filter(
    (i) => i.status === 'new' || i.status === 'updated',
  ).length ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Database className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">IRCC Forms Vault</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">public/ircc-forms/</code> for new or updated PDFs
              </p>
            </div>
          </div>
          <Button
            onClick={handleScan}
            variant="outline"
            size="sm"
            disabled={scanMutation.isPending}
            className="gap-2"
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Scan for Changes
          </Button>
        </div>
      </CardHeader>

      {scanResult && (
        <CardContent className="pt-0">
          {/* Summary badges */}
          <div className="flex items-center gap-2 mb-3">
            {scanResult.summary.new > 0 && (
              <Badge className="bg-green-50 text-green-700 border-green-200">
                {scanResult.summary.new} new
              </Badge>
            )}
            {scanResult.summary.updated > 0 && (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                {scanResult.summary.updated} updated
              </Badge>
            )}
            {scanResult.summary.unchanged > 0 && (
              <Badge variant="outline" className="text-slate-400">
                {scanResult.summary.unchanged} unchanged
              </Badge>
            )}
            {scanResult.summary.missing > 0 && (
              <Badge className="bg-red-50 text-red-700 border-red-200">
                {scanResult.summary.missing} missing from folder
              </Badge>
            )}
          </div>

          {/* Results table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-[90px] text-xs">Status</TableHead>
                  <TableHead className="text-xs">Form Code</TableHead>
                  <TableHead className="text-xs">File</TableHead>
                  <TableHead className="text-xs w-[80px]">Size</TableHead>
                  <TableHead className="text-xs w-[140px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanResult.items.map((item) => (
                  <TableRow key={item.formCode + item.status} className="text-sm">
                    <TableCell>
                      {item.status === 'new' && (
                        <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200">New</Badge>
                      )}
                      {item.status === 'updated' && (
                        <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Updated</Badge>
                      )}
                      {item.status === 'unchanged' && (
                        <Badge variant="outline" className="text-[10px] text-slate-400">OK</Badge>
                      )}
                      {item.status === 'missing' && (
                        <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.formCode}
                      {item.existingForm && (
                        <span className="text-xs text-slate-400 ml-1">
                          v{item.existingForm.current_version}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500 whitespace-normal">
                      {item.status === 'new' ? (
                        <div className="space-y-1">
                          <Input
                            className="h-7 text-xs"
                            placeholder="Form name..."
                            value={formNames[item.formCode] || ''}
                            onChange={(e) =>
                              setFormNames((prev) => ({ ...prev, [item.formCode]: e.target.value }))
                            }
                          />
                          <Input
                            type="date"
                            className="h-7 text-xs"
                            value={formDates[item.formCode] || ''}
                            title="IRCC form date"
                            onChange={(e) =>
                              setFormDates((prev) => ({ ...prev, [item.formCode]: e.target.value }))
                            }
                          />
                        </div>
                      ) : item.status === 'updated' ? (
                        <div className="space-y-1">
                          <span className="text-xs">{item.fileName}</span>
                          <Input
                            type="date"
                            className="h-7 text-xs"
                            value={formDates[item.formCode] || ''}
                            title="IRCC form date"
                            onChange={(e) =>
                              setFormDates((prev) => ({ ...prev, [item.formCode]: e.target.value }))
                            }
                          />
                        </div>
                      ) : item.status === 'missing' ? (
                        <span className="text-xs italic text-slate-400">Not in folder</span>
                      ) : (
                        <span className="text-xs">{item.fileName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {item.fileSizeBytes > 0
                        ? `${(item.fileSizeBytes / 1024).toFixed(0)} KB`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {(item.status === 'new' || item.status === 'updated') && (
                        <Button
                          size="sm"
                          variant={item.status === 'new' ? 'default' : 'outline'}
                          className="h-7 text-xs gap-1"
                          disabled={syncingItems.has(item.formCode) || syncMutation.isPending}
                          onClick={() => handleSyncItem(item)}
                        >
                          {syncingItems.has(item.formCode) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : item.status === 'new' ? (
                            <Plus className="h-3 w-3" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {item.status === 'new' ? 'Add' : 'Update'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Sync All button */}
          {actionableCount > 0 && (
            <div className="flex justify-end mt-3">
              <Button
                onClick={handleSyncAll}
                disabled={syncMutation.isPending}
                className="gap-2"
                size="sm"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync All ({actionableCount})
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ── Version History Dialog ───────────────────────────────────────────────────

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IrccFormLibraryPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { data: forms, isLoading } = useIrccForms()
  const deleteMutation = useDeleteIrccForm()
  const { data: matterTypesWithPA } = useMatterTypesByPractice(tenantId)

  // Fetch form → matter_type assignments
  const { data: streamAssignments } = useQuery({
    queryKey: ['ircc-stream-form-assignments', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_stream_forms')
        .select('id, form_id, matter_type_id')
        .not('matter_type_id', 'is', null)

      if (error) throw error
      return data as { id: string; form_id: string; matter_type_id: string }[]
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })

  // Fetch matter type IDs that have document slot templates
  const { data: docSlotMatterTypeIds } = useQuery({
    queryKey: ['doc-slot-matter-type-ids', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slot_templates')
        .select('matter_type_id')
        .not('matter_type_id', 'is', null)
        .eq('is_active', true)

      if (error) throw error
      return [...new Set((data as { matter_type_id: string }[]).map((d) => d.matter_type_id))]
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })

  // Fetch matter type IDs that have folder templates
  const { data: folderTemplateMatterTypeIds } = useQuery({
    queryKey: ['folder-template-matter-type-ids', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_folder_templates')
        .select('matter_type_id')
        .eq('is_active', true)

      if (error) throw error
      return [...new Set((data as { matter_type_id: string }[]).map((d) => d.matter_type_id))]
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadContext, setUploadContext] = useState<{ practiceAreaId: string; matterTypeId: string } | null>(null)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FormData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Add Existing Form dialog state
  const [addExistingContext, setAddExistingContext] = useState<{ matterTypeId: string; matterTypeName: string } | null>(null)

  // Assign to Matter Type dialog state (for unassigned forms)
  const [assignFormTarget, setAssignFormTarget] = useState<FormData | null>(null)

  // Version history dialog state
  const [historyTarget, setHistoryTarget] = useState<FormData | null>(null)

  // View mode: 'all' shows flat grid, 'by-matter-type' shows folder view
  const [viewMode, setViewMode] = useState<'all' | 'by-matter-type'>('all')

  // Move form dialog state
  const [moveTarget, setMoveTarget] = useState<{ form: FormData; matterTypeId: string; matterTypeName: string } | null>(null)

  const selectedForm = useMemo(
    () => (forms as FormData[] | undefined)?.find((f: FormData) => f.id === selectedFormId) ?? null,
    [forms, selectedFormId],
  )

  const filteredForms = useMemo(() => {
    if (!forms) return []
    if (!searchQuery) return forms as FormData[]
    const lower = searchQuery.toLowerCase()
    return (forms as FormData[]).filter(
      (f: FormData) =>
        f.form_code.toLowerCase().includes(lower) ||
        f.form_name.toLowerCase().includes(lower),
    )
  }, [forms, searchQuery])

  // Build form_id → matter_type_id[] map
  const formToMatterTypes = useMemo(() => {
    const map: Record<string, string[]> = {}
    if (streamAssignments) {
      for (const a of streamAssignments) {
        if (!map[a.form_id]) map[a.form_id] = []
        map[a.form_id].push(a.matter_type_id)
      }
    }
    return map
  }, [streamAssignments])

  // Build lookup: "formId::matterTypeId" → streamFormId (junction table id)
  const streamFormIdMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (streamAssignments) {
      for (const a of streamAssignments) {
        map[`${a.form_id}::${a.matter_type_id}`] = a.id
      }
    }
    return map
  }, [streamAssignments])

  // Build matter type name/color lookup for "All Forms" view badges
  const matterTypeInfoMap = useMemo(() => {
    const map: Record<string, { name: string; color?: string }> = {}
    if (matterTypesWithPA) {
      for (const mt of matterTypesWithPA) {
        map[mt.id] = { name: mt.name, color: mt.practice_areas?.color ?? undefined }
      }
    }
    return map
  }, [matterTypesWithPA])

  // Build grouped folders: matter_type_id → { name, practiceArea, forms[] }
  const { folders, unassignedForms } = useMemo(() => {
    const mtMap = new Map(
      (matterTypesWithPA ?? []).map((mt) => [
        mt.id,
        { name: mt.name, paId: mt.practice_area_id, paName: mt.practice_areas?.name ?? 'Unknown', paColor: mt.practice_areas?.color },
      ]),
    )

    // Collect assigned form IDs and build folder map
    const assignedFormIds = new Set<string>()
    const folderMap: Record<string, FormData[]> = {}

    for (const form of filteredForms) {
      const mtIds = formToMatterTypes[form.id]
      if (mtIds && mtIds.length > 0) {
        assignedFormIds.add(form.id)
        for (const mtId of mtIds) {
          if (!folderMap[mtId]) folderMap[mtId] = []
          folderMap[mtId].push(form)
        }
      }
    }

    // Also include matter types that have document slots but no forms
    if (docSlotMatterTypeIds) {
      for (const mtId of docSlotMatterTypeIds) {
        if (!folderMap[mtId]) folderMap[mtId] = []
      }
    }

    // Also include matter types that have folder templates but no forms
    if (folderTemplateMatterTypeIds) {
      for (const mtId of folderTemplateMatterTypeIds) {
        if (!folderMap[mtId]) folderMap[mtId] = []
      }
    }

    // Build folder array sorted by practice area then matter type name
    const folderArray = Object.entries(folderMap)
      .map(([mtId, mtForms]) => {
        const info = mtMap.get(mtId)
        return {
          id: mtId,
          name: info?.name ?? 'Unknown Matter Type',
          paId: info?.paId ?? '',
          paName: info?.paName ?? 'Unknown',
          paColor: info?.paColor,
          forms: mtForms,
        }
      })
      .sort((a, b) => a.paName.localeCompare(b.paName) || a.name.localeCompare(b.name))

    // When searching, hide empty folders so results feel filtered
    const finalFolders = searchQuery
      ? folderArray.filter((f) => f.forms.length > 0)
      : folderArray

    const unassigned = filteredForms.filter((f) => !assignedFormIds.has(f.id))

    return { folders: finalFolders, unassignedForms: unassigned }
  }, [filteredForms, matterTypesWithPA, formToMatterTypes, docSlotMatterTypeIds, folderTemplateMatterTypeIds, searchQuery])

  // ── Detail View ───────────────────────────────────────────────────────
  if (selectedForm) {
    return (
      <FormDetailView
        form={selectedForm}
        onBack={() => setSelectedFormId(null)}
      />
    )
  }

  // ── List View ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* IRCC Forms Vault */}
      <FolderSyncSection />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Forms &amp; Documents Library</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage IRCC form templates and required documents, organized by matter type.
          </p>
        </div>
        <Button onClick={() => { setUploadContext(null); setUploadOpen(true) }} className="gap-2 shrink-0">
          <Upload className="h-4 w-4" />
          Upload Form
        </Button>
      </div>

      {/* View Toggle + Search */}
      {(forms as FormData[] | undefined)?.length ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setViewMode('all')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              All Forms
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'by-matter-type'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setViewMode('by-matter-type')}
            >
              <FolderTree className="h-3.5 w-3.5" />
              By Matter Type
            </button>
          </div>
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search forms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {/* Form Folders + Cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-lg" />
          ))}
        </div>
      ) : filteredForms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-slate-50 p-4">
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {searchQuery ? 'No Forms Found' : 'No Forms Uploaded'}
            </h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {searchQuery
                ? 'Try a different search term.'
                : 'Upload your first IRCC PDF form to get started. The system will automatically extract all fillable fields.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setUploadOpen(true)} className="mt-4 gap-2">
                <Upload className="h-4 w-4" />
                Upload First Form
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'all' ? (
        /* ── All Forms View ─────────────────────────────────────── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredForms.map((form: FormData) => {
            const mtIds = formToMatterTypes[form.id] ?? []
            const badges = mtIds.map((mtId: string) => matterTypeInfoMap[mtId]).filter(Boolean)
            const isAssigned = mtIds.length > 0

            return (
              <FormCard
                key={form.id}
                form={form}
                onSelect={setSelectedFormId}
                onDelete={setDeleteTarget}
                onShowHistory={setHistoryTarget}
                matterTypeBadges={badges}
                questionStats={getFormQuestionStats(form.form_code)}
                onAssignForm={!isAssigned ? (f) => setAssignFormTarget(f) : undefined}
                onMoveForm={isAssigned ? () => {
                  // For All Forms view, move from the first assigned matter type
                  const firstMtId = mtIds[0]
                  const firstMtInfo = matterTypeInfoMap[firstMtId]
                  setMoveTarget({
                    form,
                    matterTypeId: firstMtId,
                    matterTypeName: firstMtInfo?.name ?? 'Unknown',
                  })
                } : undefined}
              />
            )
          })}
        </div>
      ) : (
        /* ── By Matter Type View ────────────────────────────────── */
        <div className="space-y-4">
          {/* Matter Type Folders */}
          {folders.map((folder) => (
            <MatterTypeFolder
              key={folder.id}
              matterTypeId={folder.id}
              matterTypeName={folder.name}
              practiceAreaId={folder.paId}
              practiceAreaName={folder.paName}
              practiceAreaColor={folder.paColor}
              forms={folder.forms}
              defaultOpen={true}
              onSelectForm={setSelectedFormId}
              onDeleteForm={setDeleteTarget}
              onUploadForm={(mtId, paId) => {
                setUploadContext({ practiceAreaId: paId, matterTypeId: mtId })
                setUploadOpen(true)
              }}
              onAddExistingForm={(mtId, mtName) => {
                setAddExistingContext({ matterTypeId: mtId, matterTypeName: mtName })
              }}
              onShowHistory={setHistoryTarget}
              onMoveForm={(form, mtId, mtName) => {
                setMoveTarget({ form, matterTypeId: mtId, matterTypeName: mtName })
              }}
              DocumentSlotList={DocumentSlotList}
              FolderTemplateList={FolderTemplateList}
            />
          ))}

          {/* Unassigned Forms */}
          {unassignedForms.length > 0 && (
            <div className="space-y-3">
              {folders.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Unassigned Forms</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unassignedForms.map((form: FormData) => (
                  <FormCard
                    key={form.id}
                    form={form}
                    onSelect={setSelectedFormId}
                    onDelete={setDeleteTarget}
                    onShowHistory={setHistoryTarget}
                    questionStats={getFormQuestionStats(form.form_code)}
                    onMoveForm={undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <UploadFormDialog
        open={uploadOpen}
        onOpenChange={(v) => {
          setUploadOpen(v)
          if (!v) setUploadContext(null)
        }}
        defaultPracticeAreaId={uploadContext?.practiceAreaId}
        defaultMatterTypeId={uploadContext?.matterTypeId}
      />

      {/* Add Existing Form Dialog (from matter type folder) */}
      <AddExistingFormDialog
        open={!!addExistingContext}
        onOpenChange={(v) => { if (!v) setAddExistingContext(null) }}
        matterTypeId={addExistingContext?.matterTypeId ?? ''}
        matterTypeName={addExistingContext?.matterTypeName ?? ''}
        allForms={(forms as FormData[]) ?? []}
        formToMatterTypes={formToMatterTypes}
      />

      {/* Assign to Matter Type Dialog (from unassigned forms) */}
      <AssignToMatterTypeDialog
        open={!!assignFormTarget}
        onOpenChange={(v) => { if (!v) setAssignFormTarget(null) }}
        form={assignFormTarget}
        matterTypesWithPA={matterTypesWithPA}
        formToMatterTypes={formToMatterTypes}
      />

      {/* Version History Dialog */}
      <FormVersionHistoryDialog
        formId={historyTarget?.id ?? null}
        formCode={historyTarget?.form_code ?? ''}
        open={!!historyTarget}
        onOpenChange={(v) => { if (!v) setHistoryTarget(null) }}
      />

      {/* Move Form Dialog */}
      <MoveFormDialog
        open={!!moveTarget}
        onOpenChange={(v) => { if (!v) setMoveTarget(null) }}
        form={moveTarget?.form ?? null}
        currentMatterTypeId={moveTarget?.matterTypeId ?? ''}
        currentMatterTypeName={moveTarget?.matterTypeName ?? ''}
        streamFormId={moveTarget ? (streamFormIdMap[`${moveTarget.form.id}::${moveTarget.matterTypeId}`] ?? '') : ''}
        matterTypesWithPA={matterTypesWithPA}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.form_code}</strong>?
              This will remove the form template, all field mappings, and any stream assignments.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id)
                  setDeleteTarget(null)
                  if (selectedFormId === deleteTarget.id) {
                    setSelectedFormId(null)
                  }
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
