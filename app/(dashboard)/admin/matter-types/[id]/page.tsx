'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Loader2, AlertCircle } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useAdminMatterType,
  useUpdateMatterType,
  useDocumentSlotsForMatterType,
  useCreateDocumentSlot,
  useUpdateDocumentSlot,
  useDeleteDocumentSlot,
  useTaskTemplatesForMatterType,
  useCreateTaskTemplateItem,
  useUpdateTaskTemplateItem,
  useDeleteTaskTemplateItem,
  useMatterStagePipelines,
  useMatterStages,
  useWorkflowTemplates,
  useCreateWorkflowTemplate,
  type AdminTaskTemplateItem,
} from '@/lib/queries/matter-types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type DocumentSlotTemplate = Database['public']['Tables']['document_slot_templates']['Row']
type MatterStage = Database['public']['Tables']['matter_stages']['Row']

// ─── SLA Classes ─────────────────────────────────────────────────────────────

const SLA_CLASSES = [
  { value: 'NONE', label: 'None' },
  { value: 'CLIENT_RESPONSE', label: 'Client Response (120 h)' },
  { value: 'DOCUMENT_REVIEW', label: 'Document Review (24 h)' },
  { value: 'LAWYER_REVIEW', label: 'Lawyer Review (48 h)' },
  { value: 'BILLING_CLEARANCE', label: 'Billing Clearance (72 h)' },
  { value: 'FILING', label: 'Filing (48 h)' },
  { value: 'IRCC_RESPONSE', label: 'IRCC Response (336 h)' },
] as const

// ─── Billing Types ────────────────────────────────────────────────────────────

const BILLING_TYPES = [
  { value: 'flat_fee', label: 'Flat Fee' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'hybrid', label: 'Hybrid' },
] as const

// ─── Assignee Roles ───────────────────────────────────────────────────────────

const ASSIGNEE_ROLES = [
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'legal_assistant', label: 'Legal Assistant' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'billing', label: 'Billing' },
  { value: 'admin', label: 'Admin' },
]

// ─── Colour swatches ─────────────────────────────────────────────────────────

const COLOUR_SWATCHES = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#14b8a6', '#6b7280',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMatterTypeConfig(raw: Database['public']['Tables']['matter_types']['Row']['matter_type_config']): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice_areas', 'all', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Icon Preview ─────────────────────────────────────────────────────────────

function IconPreview({ name }: { name: string }) {
  if (!name) return <span className="text-muted-foreground text-xs">No icon</span>
  const PascalName = name
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as Record<string, any>)[PascalName]
  if (!Icon) return <span className="text-xs text-destructive">Unknown icon</span>
  return <Icon className="size-5 text-foreground" />
}

// ─── Tab 1 — General ─────────────────────────────────────────────────────────

interface GeneralTabProps {
  matterTypeId: string
  tenantId: string
}

function GeneralTab({ matterTypeId, tenantId }: GeneralTabProps) {
  const { data: mt, isLoading } = useAdminMatterType(matterTypeId)
  const { data: practiceAreas } = usePracticeAreas(tenantId)
  const updateMatterType = useUpdateMatterType()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [practiceAreaId, setPracticeAreaId] = useState('')
  const [colour, setColour] = useState('#6366f1')
  const [colourInput, setColourInput] = useState('#6366f1')
  const [icon, setIcon] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (mt) {
      setName(mt.name)
      setDescription(mt.description ?? '')
      setPracticeAreaId(mt.practice_area_id)
      setColour(mt.color)
      setColourInput(mt.color)
      setIcon(mt.icon ?? '')
      setIsActive(mt.is_active)
      setDirty(false)
    }
  }, [mt])

  function markDirty() { setDirty(true) }

  async function handleSave() {
    await updateMatterType.mutateAsync({
      id: matterTypeId,
      tenantId,
      updates: {
        name: name.trim(),
        description: description.trim() || null,
        color: colour,
        practice_area_id: practiceAreaId,
        icon: icon.trim() || null,
        is_active: isActive,
      },
    })
    setDirty(false)
    toast.success('Matter type saved')
  }

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mt-name">Name</Label>
          <Input
            id="mt-name"
            value={name}
            onChange={(e) => { setName(e.target.value); markDirty() }}
            placeholder="e.g. Purchase, Work Permit…"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mt-desc">Description</Label>
          <Textarea
            id="mt-desc"
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty() }}
            placeholder="Brief description of this matter type…"
            rows={3}
          />
        </div>

        {/* Practice Area */}
        <div className="space-y-1.5">
          <Label htmlFor="mt-pa">Practice Area</Label>
          <Select value={practiceAreaId} onValueChange={(v) => { setPracticeAreaId(v); markDirty() }}>
            <SelectTrigger id="mt-pa">
              <SelectValue placeholder="Select practice area…" />
            </SelectTrigger>
            <SelectContent>
              {(practiceAreas ?? []).map((pa) => (
                <SelectItem key={pa.id} value={pa.id}>{pa.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Icon */}
        <div className="space-y-1.5">
          <Label htmlFor="mt-icon">Icon (Lucide name)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="mt-icon"
              value={icon}
              onChange={(e) => { setIcon(e.target.value); markDirty() }}
              placeholder="e.g. briefcase, file-text…"
              className="flex-1"
            />
            <div className="flex size-9 items-center justify-center rounded border border-border bg-muted">
              <IconPreview name={icon} />
            </div>
          </div>
        </div>

        {/* Colour */}
        <div className="space-y-2 sm:col-span-2">
          <Label>Colour</Label>
          <div className="flex flex-wrap gap-2">
            {COLOUR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setColour(c); setColourInput(c); markDirty() }}
                className="size-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                style={{
                  backgroundColor: c,
                  outline: colour === c ? '2px solid currentColor' : undefined,
                  outlineOffset: colour === c ? '2px' : undefined,
                }}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded border border-border" style={{ backgroundColor: colour }} />
            <Input
              value={colourInput}
              onChange={(e) => {
                setColourInput(e.target.value)
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  setColour(e.target.value)
                }
                markDirty()
              }}
              placeholder="#6366f1"
              className="w-32 font-mono text-sm"
            />
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:col-span-2">
          <Switch
            id="mt-active"
            checked={isActive}
            onCheckedChange={(v) => { setIsActive(v); markDirty() }}
          />
          <div>
            <Label htmlFor="mt-active" className="cursor-pointer">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive matter types are hidden from the matter creation form.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMatterType.isPending || !dirty} className="gap-2">
          {updateMatterType.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}

// ─── Tab 2 — Document Checklist ───────────────────────────────────────────────

interface DocChecklistTabProps {
  matterTypeId: string
  tenantId: string
}

function DocChecklistTab({ matterTypeId, tenantId }: DocChecklistTabProps) {
  const { data: slots, isLoading } = useDocumentSlotsForMatterType(matterTypeId)
  const createSlot = useCreateDocumentSlot()
  const updateSlot = useUpdateDocumentSlot()
  const deleteSlot = useDeleteDocumentSlot()

  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [newMandatory, setNewMandatory] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editMandatory, setEditMandatory] = useState(false)

  function startEdit(slot: DocumentSlotTemplate) {
    setEditingId(slot.id)
    setEditName(slot.slot_name)
    setEditDesc(slot.description ?? '')
    setEditCategory(slot.category)
    setEditMandatory(slot.is_required)
  }

  async function saveEdit() {
    if (!editingId) return
    await updateSlot.mutateAsync({
      id: editingId,
      matterTypeId,
      updates: {
        slot_name: editName.trim(),
        description: editDesc.trim() || null,
        category: editCategory.trim() || 'general',
        is_required: editMandatory,
      },
    })
    setEditingId(null)
  }

  async function handleAdd() {
    if (!newName.trim()) {
      toast.error('Slot name is required')
      return
    }
    await createSlot.mutateAsync({
      tenantId,
      matterTypeId,
      slotName: newName.trim(),
      description: newDesc.trim() || null,
      category: newCategory.trim() || 'general',
      isRequired: newMandatory,
      sortOrder: (slots?.length ?? 0) + 1,
    })
    setNewName('')
    setNewDesc('')
    setNewCategory('general')
    setNewMandatory(false)
    setAddingNew(false)
  }

  async function handleReorder(slot: DocumentSlotTemplate, direction: 'up' | 'down') {
    const list = slots ?? []
    const idx = list.findIndex((s) => s.id === slot.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return
    const swap = list[swapIdx]
    await Promise.all([
      updateSlot.mutateAsync({ id: slot.id, matterTypeId, updates: { sort_order: swap.sort_order } }),
      updateSlot.mutateAsync({ id: swap.id, matterTypeId, updates: { sort_order: slot.sort_order } }),
    ])
  }

  if (isLoading) {
    return <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define which documents must be collected for this matter type.
        </p>
        <Button size="sm" variant="outline" onClick={() => setAddingNew(true)} disabled={addingNew}>
          + Add Slot
        </Button>
      </div>

      {/* New slot form */}
      {addingNew && (
        <div className="rounded-lg border border-primary/40 bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">New Document Slot</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-slot-name">Slot Name</Label>
              <Input
                id="new-slot-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Passport Copy"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-slot-cat">Category</Label>
              <Input
                id="new-slot-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. identity, financial…"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="new-slot-desc">Description (optional)</Label>
              <Input
                id="new-slot-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this document…"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="new-slot-mandatory"
                checked={newMandatory}
                onCheckedChange={(v) => setNewMandatory(!!v)}
              />
              <Label htmlFor="new-slot-mandatory">Mandatory document</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={createSlot.isPending}>
              {createSlot.isPending ? 'Adding…' : 'Add Slot'}
            </Button>
          </div>
        </div>
      )}

      {/* Slot list */}
      {(slots ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <AlertCircle className="size-8 opacity-40" />
          <p className="text-sm">No document slots defined yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(slots ?? []).map((slot, idx) => (
            <div key={slot.id} className="rounded-lg border border-border bg-card p-3">
              {editingId === slot.id ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Slot Name</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Category</Label>
                      <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Description</Label>
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Checkbox
                        id={`edit-mand-${slot.id}`}
                        checked={editMandatory}
                        onCheckedChange={(v) => setEditMandatory(!!v)}
                      />
                      <Label htmlFor={`edit-mand-${slot.id}`}>Mandatory</Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={saveEdit} disabled={updateSlot.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleReorder(slot, 'up')}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(slot, 'down')}
                      disabled={idx === (slots ?? []).length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{slot.slot_name}</span>
                      {slot.is_required && <Badge variant="destructive" className="text-[10px]">Mandatory</Badge>}
                      <Badge variant="outline" className="text-[10px] shrink-0">{slot.category}</Badge>
                    </div>
                    {slot.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{slot.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(slot)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteSlot.mutate({ id: slot.id, matterTypeId })}
                      disabled={deleteSlot.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3 — Task Templates ───────────────────────────────────────────────────

interface TaskTemplatesTabProps {
  matterTypeId: string
  tenantId: string
}

function TaskTemplatesTab({ matterTypeId, tenantId }: TaskTemplatesTabProps) {
  const { data: items, isLoading } = useTaskTemplatesForMatterType(tenantId, matterTypeId)
  const { data: workflowTemplates } = useWorkflowTemplates(tenantId, matterTypeId)
  const createWorkflow = useCreateWorkflowTemplate()
  const createItem = useCreateTaskTemplateItem()
  const updateItem = useUpdateTaskTemplateItem()
  const deleteItem = useDeleteTaskTemplateItem()

  const [addingNew, setAddingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newRole, setNewRole] = useState<string>('lawyer')
  const [newOffset, setNewOffset] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editOffset, setEditOffset] = useState<string>('')

  // Ensure a default workflow template exists for this matter type
  async function ensureWorkflowTemplate(): Promise<string | null> {
    if (workflowTemplates && workflowTemplates.length > 0) {
      return workflowTemplates[0].id
    }
    const newWt = await createWorkflow.mutateAsync({
      tenant_id: tenantId,
      matter_type_id: matterTypeId,
      name: 'Default Task Template',
      description: 'Auto-created default task template',
      is_default: true,
      is_active: true,
    })
    return newWt.id
  }

  async function handleAdd() {
    if (!newTitle.trim()) {
      toast.error('Title is required')
      return
    }
    const wtId = await ensureWorkflowTemplate()
    if (!wtId) {
      toast.error('Could not create workflow template')
      return
    }
    await createItem.mutateAsync({
      tenantId,
      matterTypeId,
      workflowTemplateId: wtId,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      assignedRole: newRole || null,
      dueDaysOffset: newOffset ? parseInt(newOffset, 10) : null,
      sortOrder: (items?.length ?? 0) + 1,
    })
    setNewTitle('')
    setNewDesc('')
    setNewRole('lawyer')
    setNewOffset('')
    setAddingNew(false)
  }

  function startEdit(item: AdminTaskTemplateItem) {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDesc(item.description ?? '')
    setEditRole(item.assign_to_role ?? 'lawyer')
    setEditOffset(item.days_offset != null ? String(item.days_offset) : '')
  }

  async function saveEdit() {
    if (!editingId) return
    await updateItem.mutateAsync({
      id: editingId,
      tenantId,
      matterTypeId,
      updates: {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        assign_to_role: editRole || null,
        days_offset: editOffset ? parseInt(editOffset, 10) : null,
      },
    })
    setEditingId(null)
  }

  if (isLoading) {
    return <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Task templates are auto-created when a new matter of this type is opened.
        </p>
        <Button size="sm" variant="outline" onClick={() => setAddingNew(true)} disabled={addingNew}>
          + Add Task
        </Button>
      </div>

      {/* New task form */}
      {addingNew && (
        <div className="rounded-lg border border-primary/40 bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">New Task Template</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Collect client ID…" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description (optional)</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Brief instructions…" />
            </div>
            <div className="space-y-1">
              <Label>Assignee Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNEE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Offset (days)</Label>
              <Input
                type="number"
                value={newOffset}
                onChange={(e) => setNewOffset(e.target.value)}
                placeholder="e.g. 7"
                min={0}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={createItem.isPending}>
              {createItem.isPending ? 'Adding…' : 'Add Task'}
            </Button>
          </div>
        </div>
      )}

      {(items ?? []).length === 0 && !addingNew ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <AlertCircle className="size-8 opacity-40" />
          <p className="text-sm">No task templates defined yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(items ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              {editingId === item.id ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Title</Label>
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Description</Label>
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Role</Label>
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNEE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Due Offset (days)</Label>
                      <Input type="number" value={editOffset} onChange={(e) => setEditOffset(e.target.value)} min={0} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={saveEdit} disabled={updateItem.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{item.title}</span>
                      {item.assign_to_role && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {ASSIGNEE_ROLES.find((r) => r.value === item.assign_to_role)?.label ?? item.assign_to_role}
                        </Badge>
                      )}
                      {item.days_offset != null && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          +{item.days_offset}d
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteItem.mutate({ id: item.id, tenantId, matterTypeId })}
                      disabled={deleteItem.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 4 — SLA Config ───────────────────────────────────────────────────────

interface SlaTabProps {
  matterTypeId: string
  tenantId: string
}

function SlaTab({ matterTypeId, tenantId }: SlaTabProps) {
  const { data: mt, isLoading: mtLoading } = useAdminMatterType(matterTypeId)
  const { data: pipelines, isLoading: pipLoading } = useMatterStagePipelines(tenantId, matterTypeId)
  const updateMatterType = useUpdateMatterType()

  const defaultPipeline = pipelines?.[0] ?? null
  const { data: stages } = useMatterStages(defaultPipeline?.id)

  const [slaMap, setSlaMap] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (mt) {
      const cfg = parseMatterTypeConfig(mt.matter_type_config)
      setSlaMap((cfg['sla_classes'] as Record<string, string>) ?? {})
      setDirty(false)
    }
  }, [mt])

  async function handleSave() {
    if (!mt) return
    const cfg = parseMatterTypeConfig(mt.matter_type_config)
    const updated = { ...cfg, sla_classes: slaMap }
    await updateMatterType.mutateAsync({
      id: matterTypeId,
      tenantId,
      updates: {
        matter_type_config: updated as Database['public']['Tables']['matter_types']['Update']['matter_type_config'],
      },
    })
    setDirty(false)
    toast.success('SLA configuration saved')
  }

  const isLoading = mtLoading || pipLoading

  if (isLoading) {
    return <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }

  if (!stages || stages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <AlertCircle className="size-8 opacity-40" />
        <p className="text-sm">No stages found. Add a stage pipeline first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        Assign an SLA class to each stage. These govern how response-time targets are measured.
        {defaultPipeline && (
          <span className="ml-1 text-foreground font-medium">
            Pipeline: {defaultPipeline.name}
          </span>
        )}
      </p>

      <div className="space-y-2">
        {stages.map((stage: MatterStage) => (
          <div key={stage.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <span className="flex-1 text-sm font-medium">{stage.name}</span>
            <Select
              value={slaMap[stage.id] ?? 'NONE'}
              onValueChange={(v) => {
                setSlaMap((prev) => ({ ...prev, [stage.id]: v }))
                setDirty(true)
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLA_CLASSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMatterType.isPending || !dirty} className="gap-2">
          {updateMatterType.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save SLA Config
        </Button>
      </div>
    </div>
  )
}

// ─── Tab 5 — Billing Defaults ─────────────────────────────────────────────────

interface BillingTabProps {
  matterTypeId: string
  tenantId: string
}

function BillingTab({ matterTypeId, tenantId }: BillingTabProps) {
  const { data: mt, isLoading } = useAdminMatterType(matterTypeId)
  const updateMatterType = useUpdateMatterType()

  const [billingType, setBillingType] = useState<string>('flat_fee')
  const [flatFee, setFlatFee] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [retainer, setRetainer] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (mt) {
      const cfg = parseMatterTypeConfig(mt.matter_type_config)
      setBillingType((cfg['billing_type'] as string) ?? 'flat_fee')
      setFlatFee(cfg['default_flat_fee_amount'] != null ? String(cfg['default_flat_fee_amount']) : '')
      setHourlyRate(cfg['default_hourly_rate'] != null ? String(cfg['default_hourly_rate']) : '')
      setRetainer(cfg['default_retainer_amount'] != null ? String(cfg['default_retainer_amount']) : '')
      setDirty(false)
    }
  }, [mt])

  async function handleSave() {
    if (!mt) return
    const cfg = parseMatterTypeConfig(mt.matter_type_config)
    const updated = {
      ...cfg,
      billing_type: billingType,
      default_flat_fee_amount: flatFee ? parseFloat(flatFee) : null,
      default_hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
      default_retainer_amount: retainer ? parseFloat(retainer) : null,
    }
    await updateMatterType.mutateAsync({
      id: matterTypeId,
      tenantId,
      updates: {
        matter_type_config: updated as Database['public']['Tables']['matter_types']['Update']['matter_type_config'],
      },
    })
    setDirty(false)
    toast.success('Billing defaults saved')
  }

  if (isLoading) {
    return <div className="space-y-2 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }

  function mark() { setDirty(true) }

  return (
    <div className="space-y-6 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Billing Type */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="billing-type">Billing Type</Label>
          <Select value={billingType} onValueChange={(v) => { setBillingType(v); mark() }}>
            <SelectTrigger id="billing-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((bt) => (
                <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Flat Fee */}
        {(billingType === 'flat_fee' || billingType === 'hybrid') && (
          <div className="space-y-1.5">
            <Label htmlFor="flat-fee">Default Flat Fee (CAD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="flat-fee"
                type="number"
                min={0}
                step={0.01}
                value={flatFee}
                onChange={(e) => { setFlatFee(e.target.value); mark() }}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>
        )}

        {/* Hourly Rate */}
        {(billingType === 'hourly' || billingType === 'hybrid') && (
          <div className="space-y-1.5">
            <Label htmlFor="hourly-rate">Default Hourly Rate (CAD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="hourly-rate"
                type="number"
                min={0}
                step={0.01}
                value={hourlyRate}
                onChange={(e) => { setHourlyRate(e.target.value); mark() }}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>
        )}

        {/* Retainer */}
        <div className="space-y-1.5">
          <Label htmlFor="retainer">Default Retainer Amount (CAD)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              id="retainer"
              type="number"
              min={0}
              step={0.01}
              value={retainer}
              onChange={(e) => { setRetainer(e.target.value); mark() }}
              placeholder="0.00"
              className="pl-7"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMatterType.isPending || !dirty} className="gap-2">
          {updateMatterType.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Billing Defaults
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMatterTypeEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: mt, isLoading } = useAdminMatterType(id)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/admin/matter-types')}
          className="shrink-0"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground truncate">
                {mt?.name ?? 'Matter Type Editor'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {mt && (
                  <>
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: mt.color }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {mt.practice_areas?.name}
                    </span>
                    <Separator orientation="vertical" className="h-3" />
                    <Badge variant={mt.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {mt.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab matterTypeId={id} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="documents">
          <DocChecklistTab matterTypeId={id} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="tasks">
          <TaskTemplatesTab matterTypeId={id} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="sla">
          <SlaTab matterTypeId={id} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab matterTypeId={id} tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
