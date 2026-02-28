'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Loader2,
  FileInput,
  Copy,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Type,
  Mail,
  Phone,
  AlignLeft,
  ListFilter,
  Hash,
  Calendar,
  ToggleLeft,
  Link2,
  MoreHorizontal,
  Paperclip,
  X,
  User,
  FileText,
  Layers,
  Settings2,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Code2,
  Bell,
  UserPlus,
} from 'lucide-react'

import type { FieldCondition, FormSection, IntakeFormSettings } from '@/lib/types/intake-field'
import { ConditionBuilder } from '@/components/forms/condition-builder'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import {
  useIntakeForms,
  useCreateIntakeForm,
  useUpdateIntakeForm,
  useDeleteIntakeForm,
  usePublishIntakeForm,
  useIntakeSubmissions,
} from '@/lib/queries/intake-forms'
import { usePipelines, usePipelineStages } from '@/lib/queries/pipelines'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Database, Json } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

type IntakeForm = Database['public']['Tables']['intake_forms']['Row']
type IntakeSubmission = Database['public']['Tables']['intake_submissions']['Row']

// ---------- Types ----------

interface IntakeField {
  id: string
  field_type: string
  label: string
  placeholder?: string
  description?: string
  is_required: boolean
  options?: { label: string; value: string }[]
  sort_order: number
  mapping?: string
  allow_other?: boolean
  accept?: string
  section_id?: string
  condition?: FieldCondition
}

// ---------- Constants ----------

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'textarea', label: 'Long Text', icon: AlignLeft },
  { value: 'select', label: 'Dropdown', icon: ListFilter },
  { value: 'multi_select', label: 'Multi-Select', icon: ListFilter },
  { value: 'number', label: 'Number', icon: Hash },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'boolean', label: 'Yes/No', icon: ToggleLeft },
  { value: 'url', label: 'URL', icon: Link2 },
  { value: 'file', label: 'File Upload', icon: Paperclip },
] as const

const CONTACT_MAPPINGS = [
  { value: '', label: 'No mapping' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email_primary', label: 'Email' },
  { value: 'phone_primary', label: 'Phone' },
  { value: 'notes', label: 'Notes' },
]

function getFieldIcon(type: string) {
  const ft = FIELD_TYPES.find((t) => t.value === type)
  return ft?.icon ?? Type
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// ---------- Practice Areas hook (inline) ----------

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice-areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })
}

function useTeamMembers(tenantId: string) {
  return useQuery({
    queryKey: ['users', tenantId, 'team-members'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return data as { id: string; first_name: string | null; last_name: string | null; email: string }[]
    },
    enabled: !!tenantId,
  })
}

// ==========================================================
// Sortable Field Row
// ==========================================================

function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: IntakeField
  onEdit: (field: IntakeField) => void
  onDelete: (field: IntakeField) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Icon = getFieldIcon(field.field_type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition-shadow',
        isDragging && 'z-50 shadow-lg ring-2 ring-primary/20'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-slate-400 hover:text-slate-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {field.label}
          </span>
          {field.is_required && (
            <Badge variant="secondary" className="text-[10px] text-red-600 bg-red-50 border-red-200">
              Required
            </Badge>
          )}
          {field.mapping && (
            <Badge variant="secondary" className="text-[10px] text-blue-600 bg-blue-50 border-blue-200">
              {CONTACT_MAPPINGS.find((m) => m.value === field.mapping)?.label ?? field.mapping}
            </Badge>
          )}
          {field.allow_other && (
            <Badge variant="secondary" className="text-[10px] text-purple-600 bg-purple-50 border-purple-200">
              +Other
            </Badge>
          )}
          {field.condition && (
            <Badge variant="secondary" className="text-[10px] text-amber-600 bg-amber-50 border-amber-200">
              Conditional
            </Badge>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {FIELD_TYPES.find((t) => t.value === field.field_type)?.label ?? field.field_type}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
          onClick={() => onEdit(field)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
          onClick={() => onDelete(field)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ==========================================================
// Field Editor Dialog
// ==========================================================

function FieldEditorDialog({
  open,
  onOpenChange,
  field,
  onSave,
  allFields,
  sectionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: IntakeField | null
  onSave: (field: IntakeField) => void
  allFields?: IntakeField[]
  sectionId?: string
}) {
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const [placeholder, setPlaceholder] = useState('')
  const [description, setDescription] = useState('')
  const [isRequired, setIsRequired] = useState(false)
  const [mapping, setMapping] = useState('')
  const [options, setOptions] = useState<{ label: string; value: string }[]>([])
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [allowOther, setAllowOther] = useState(false)
  const [accept, setAccept] = useState('')
  const [hasCondition, setHasCondition] = useState(false)
  const [condFieldId, setCondFieldId] = useState('')
  const [condOperator, setCondOperator] = useState<FieldCondition['operator']>('equals')
  const [condValue, setCondValue] = useState('')

  useEffect(() => {
    if (open && field) {
      setLabel(field.label)
      setFieldType(field.field_type)
      setPlaceholder(field.placeholder ?? '')
      setDescription(field.description ?? '')
      setIsRequired(field.is_required)
      setMapping(field.mapping ?? '')
      setOptions(field.options ?? [])
      setAllowOther(field.allow_other ?? false)
      setAccept(field.accept ?? '')
      setHasCondition(!!field.condition)
      setCondFieldId(field.condition?.field_id ?? '')
      setCondOperator(field.condition?.operator ?? 'equals')
      setCondValue(
        Array.isArray(field.condition?.value)
          ? field.condition.value.join(',')
          : (field.condition?.value ?? '')
      )
    } else if (open) {
      setLabel('')
      setFieldType('text')
      setPlaceholder('')
      setDescription('')
      setIsRequired(false)
      setMapping('')
      setOptions([])
      setAllowOther(false)
      setAccept('')
      setHasCondition(false)
      setCondFieldId('')
      setCondOperator('equals')
      setCondValue('')
    }
    setNewOptionLabel('')
  }, [open, field])

  const isEditing = !!field
  const showOptions = fieldType === 'select' || fieldType === 'multi_select'
  const isFileType = fieldType === 'file'

  // Build condition object
  function buildCondition(): FieldCondition | undefined {
    if (!hasCondition || !condFieldId) return undefined
    const op = condOperator
    if (op === 'is_truthy' || op === 'is_falsy') {
      return { field_id: condFieldId, operator: op }
    }
    if (op === 'in' || op === 'not_in') {
      return { field_id: condFieldId, operator: op, value: condValue.split(',').map((v) => v.trim()).filter(Boolean) }
    }
    return { field_id: condFieldId, operator: op, value: condValue }
  }

  // Fields available for condition references (exclude self)
  const conditionableFields = (allFields ?? []).filter((f) => f.id !== field?.id)
  const selectedCondField = conditionableFields.find((f) => f.id === condFieldId)

  function handleSave() {
    if (!label.trim()) return
    onSave({
      id: field?.id ?? crypto.randomUUID(),
      field_type: fieldType,
      label: label.trim(),
      placeholder: placeholder.trim() || undefined,
      description: description.trim() || undefined,
      is_required: isRequired,
      options: showOptions ? options : undefined,
      sort_order: field?.sort_order ?? 0,
      mapping: isFileType ? undefined : (mapping || undefined),
      allow_other: showOptions ? allowOther : undefined,
      accept: isFileType ? (accept.trim() || undefined) : undefined,
      section_id: field?.section_id ?? sectionId,
      condition: buildCondition(),
    })
    onOpenChange(false)
  }

  function addOption() {
    const trimmed = newOptionLabel.trim()
    if (!trimmed) return
    const value = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    setOptions([...options, { label: trimmed, value }])
    setNewOptionLabel('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Field' : 'Add Field'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this form field.' : 'Add a new field to your form.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Field Type</label>
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Label</label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Email Address"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {!isFileType && (
            <div>
              <label className="text-sm font-medium">Placeholder (optional)</label>
              <Input
                className="mt-1.5"
                placeholder="e.g. you@example.com"
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              className="mt-1.5"
              placeholder="Help text shown below the field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isFileType && (
            <div>
              <label className="text-sm font-medium">Accepted File Types</label>
              <Input
                className="mt-1.5"
                placeholder=".pdf,.jpg,.png"
                value={accept}
                onChange={(e) => setAccept(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Comma-separated extensions. Leave empty for all files.
              </p>
            </div>
          )}

          {showOptions && (
            <div>
              <label className="text-sm font-medium">Options</label>
              <div className="mt-1.5 space-y-1.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 rounded border px-2.5 py-1.5 text-sm">{opt.label}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                      onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="New option"
                    value={newOptionLabel}
                    onChange={(e) => setNewOptionLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {showOptions && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Allow &quot;Other&quot; input</p>
                <p className="text-xs text-muted-foreground">Show a text field when &quot;Other&quot; is selected</p>
              </div>
              <Switch checked={allowOther} onCheckedChange={setAllowOther} />
            </div>
          )}

          {!isFileType && (
            <div>
              <label className="text-sm font-medium">Map to Contact Field</label>
              <Select value={mapping} onValueChange={setMapping}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="No mapping" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_MAPPINGS.map((m) => (
                    <SelectItem key={m.value || '__none__'} value={m.value || '__none__'}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Required</p>
              <p className="text-xs text-muted-foreground">Must be filled to submit</p>
            </div>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>

          {/* Condition builder */}
          {conditionableFields.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Show conditionally</p>
                  <p className="text-xs text-muted-foreground">Only show when a condition is met</p>
                </div>
                <Switch checked={hasCondition} onCheckedChange={setHasCondition} />
              </div>

              {hasCondition && (
                <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">When field</label>
                    <Select value={condFieldId} onValueChange={setCondFieldId}>
                      <SelectTrigger className="mt-1 w-full text-sm">
                        <SelectValue placeholder="Select a field…" />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionableFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600">Operator</label>
                    <Select value={condOperator} onValueChange={(v) => setCondOperator(v as FieldCondition['operator'])}>
                      <SelectTrigger className="mt-1 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">equals</SelectItem>
                        <SelectItem value="not_equals">does not equal</SelectItem>
                        <SelectItem value="in">is one of</SelectItem>
                        <SelectItem value="not_in">is not one of</SelectItem>
                        <SelectItem value="is_truthy">has a value</SelectItem>
                        <SelectItem value="is_falsy">is empty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {condOperator !== 'is_truthy' && condOperator !== 'is_falsy' && (
                    <div>
                      <label className="text-xs font-medium text-slate-600">
                        Value{(condOperator === 'in' || condOperator === 'not_in') ? ' (comma-separated)' : ''}
                      </label>
                      {selectedCondField?.options && selectedCondField.options.length > 0 ? (
                        <Select value={condValue} onValueChange={setCondValue}>
                          <SelectTrigger className="mt-1 w-full text-sm">
                            <SelectValue placeholder="Select value…" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedCondField.options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="mt-1 text-sm"
                          placeholder={condOperator === 'in' || condOperator === 'not_in' ? 'value1, value2' : 'value'}
                          value={condValue}
                          onChange={(e) => setCondValue(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!label.trim()}>
            {isEditing ? 'Save Changes' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Section Editor Dialog
// ==========================================================

function SectionEditorDialog({
  open,
  onOpenChange,
  section,
  onSave,
  allFields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: FormSection | null
  onSave: (section: FormSection) => void
  allFields?: IntakeField[]
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sectionCondition, setSectionCondition] = useState<FieldCondition | undefined>(undefined)

  useEffect(() => {
    if (open && section) {
      setTitle(section.title)
      setDescription(section.description ?? '')
      setSectionCondition(section.condition)
    } else if (open) {
      setTitle('')
      setDescription('')
      setSectionCondition(undefined)
    }
  }, [open, section])

  function handleSave() {
    if (!title.trim()) return
    onSave({
      id: section?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      sort_order: section?.sort_order ?? 0,
      condition: sectionCondition,
    })
    onOpenChange(false)
  }

  // All fields can be used for section conditions (fields from any section)
  const conditionableFields = (allFields ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    options: f.options,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section ? 'Edit Section' : 'Add Section'}</DialogTitle>
          <DialogDescription>
            Sections divide the form into steps. Each section becomes a page in the multi-step wizard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Section Title</label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Visitor Information"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              className="mt-1.5"
              placeholder="Brief instruction for this step"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Condition builder for section visibility */}
          <ConditionBuilder
            condition={sectionCondition}
            onChange={setSectionCondition}
            availableFields={conditionableFields}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {section ? 'Save' : 'Add Section'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Create Form Dialog
// ==========================================================

function CreateFormDialog({
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
  const createForm = useCreateIntakeForm()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  useEffect(() => {
    if (open) { setName(''); setSlug(''); setSlugEdited(false) }
  }, [open])

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  function handleSubmit() {
    if (!name.trim() || !slug.trim()) return
    createForm.mutate(
      {
        tenant_id: tenantId,
        name: name.trim(),
        slug: slug.trim(),
        created_by: userId,
        fields: [] as unknown as Json,
        settings: {} as unknown as Json,
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Form</DialogTitle>
          <DialogDescription>
            Create a new intake form to collect information from clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Form Name</label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Immigration Consultation Request"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">URL Slug</label>
            <Input
              className="mt-1.5"
              placeholder="e.g. immigration-consultation"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugEdited(true) }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Public URL: /forms/{slug || '...'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createForm.isPending || !name.trim() || !slug.trim()}>
            {createForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Rename Form Dialog
// ==========================================================

function RenameFormDialog({
  open,
  onOpenChange,
  form,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: IntakeForm | null
}) {
  const updateForm = useUpdateIntakeForm()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open && form) setName(form.name)
  }, [open, form])

  function handleSave() {
    if (!form || !name.trim()) return
    updateForm.mutate(
      { id: form.id, name: name.trim() },
      { onSuccess: () => { onOpenChange(false); toast.success('Form renamed') } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Form</DialogTitle>
          <DialogDescription>Enter a new name for this form.</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateForm.isPending || !name.trim()}>
            {updateForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Delete Form Dialog
// ==========================================================

function DeleteFormDialog({
  open,
  onOpenChange,
  form,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: IntakeForm | null
  onDeleted?: () => void
}) {
  const deleteForm = useDeleteIntakeForm()

  function handleDelete() {
    if (!form) return
    deleteForm.mutate(form.id, {
      onSuccess: () => {
        onOpenChange(false)
        onDeleted?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Form</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{form?.name}&rdquo;? This will also remove its
            public link. Existing submissions will be preserved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteForm.isPending}>
            {deleteForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Submission Detail Sheet
// ==========================================================

function SubmissionDetailSheet({
  open,
  onOpenChange,
  submission,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submission: IntakeSubmission | null
  fields: IntakeField[]
}) {
  if (!submission) return null

  const data = (submission.data ?? {}) as Record<string, unknown>
  const fieldMap = new Map(fields.map((f) => [f.id, f]))

  // Extract contact info
  const nameField = fields.find((f) => f.mapping === 'first_name')
  const lastNameField = fields.find((f) => f.mapping === 'last_name')
  const emailField = fields.find((f) => f.mapping === 'email_primary')
  const phoneField = fields.find((f) => f.mapping === 'phone_primary')

  const firstName = nameField ? String(data[nameField.id] ?? '') : ''
  const lastName = lastNameField ? String(data[lastNameField.id] ?? '') : ''
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Anonymous'
  const displayEmail = emailField ? String(data[emailField.id] ?? '') : ''
  const displayPhone = phoneField ? String(data[phoneField.id] ?? '') : ''

  function formatValue(fieldId: string, value: unknown): string {
    if (value === null || value === undefined) return '—'
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if (obj.selected === '__other__' && obj.custom) return `Other: ${obj.custom}`
      return JSON.stringify(value)
    }
    const field = fieldMap.get(fieldId)
    if (field?.field_type === 'file' && typeof value === 'string') {
      return value
    }
    return String(value)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Submission Details</SheetTitle>
          <SheetDescription>
            {new Date(submission.created_at).toLocaleString()}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="px-6 py-5 space-y-6">
            {/* Contact Info Header */}
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                  {displayEmail && <p className="text-xs text-slate-500">{displayEmail}</p>}
                  {displayPhone && <p className="text-xs text-slate-500">{displayPhone}</p>}
                </div>
              </div>
              {submission.contact_id && (
                <a
                  href={`/contacts/${submission.contact_id}`}
                  className="mt-3 inline-flex items-center text-xs text-primary hover:underline"
                >
                  View Contact Profile →
                </a>
              )}
            </div>

            {/* Status + Lead */}
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  submission.status === 'processed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : submission.status === 'error'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                )}
              >
                {submission.status}
              </Badge>
              {submission.lead_id && (
                <a
                  href={`/leads`}
                  className="text-xs text-primary hover:underline"
                >
                  View Lead →
                </a>
              )}
            </div>

            {/* All field values */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Submitted Data</h3>
              <div className="divide-y rounded-lg border">
                {fields
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((field) => {
                    const val = data[field.id]
                    if (val === undefined) return null
                    const isFile = field.field_type === 'file'
                    return (
                      <div key={field.id} className="flex gap-3 px-3 py-2.5">
                        <span className="shrink-0 text-xs font-medium text-slate-500 w-[140px] pt-0.5">
                          {field.label}
                        </span>
                        <span className="text-sm text-slate-800 break-words min-w-0">
                          {isFile && typeof val === 'string' && val.startsWith('http') ? (
                            <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <Paperclip className="h-3 w-3" /> Download file
                            </a>
                          ) : (
                            formatValue(field.id, val)
                          )}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* UTM / Metadata */}
            {(submission.utm_source || submission.source_ip) && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-500">Metadata</h3>
                <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-500 space-y-1">
                  {submission.utm_source && (
                    <p>UTM: {[submission.utm_source, submission.utm_medium, submission.utm_campaign].filter(Boolean).join(' / ')}</p>
                  )}
                  {submission.source_ip && <p>IP: {submission.source_ip}</p>}
                  {submission.user_agent && (
                    <p className="truncate" title={submission.user_agent}>UA: {submission.user_agent}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

// ==========================================================
// Submissions Panel
// ==========================================================

function SubmissionsPanel({ formId, fields }: { formId: string; fields: IntakeField[] }) {
  const { data: submissions, isLoading } = useIntakeSubmissions(formId)
  const [selectedSub, setSelectedSub] = useState<IntakeSubmission | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!submissions || submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileInput className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">No submissions yet</p>
        <p className="mt-1 text-sm text-slate-400">
          Publish the form and share the link to start collecting responses.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-1 pt-2">
        <p className="text-xs text-slate-500 mb-2">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
        <div className="rounded-lg border divide-y">
          {submissions.map((sub) => {
            const data = (sub.data ?? {}) as Record<string, unknown>
            const nameField = fields.find((f) => f.mapping === 'first_name')
            const lastNameField = fields.find((f) => f.mapping === 'last_name')
            const emailField = fields.find((f) => f.mapping === 'email_primary')
            const firstName = nameField ? String(data[nameField.id] ?? '') : ''
            const lastName = lastNameField ? String(data[lastNameField.id] ?? '') : ''
            const displayName = [firstName, lastName].filter(Boolean).join(' ')
            const displayEmail = emailField ? String(data[emailField.id] ?? '') : ''

            return (
              <button
                key={sub.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => setSelectedSub(sub)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {displayName || displayEmail || 'Anonymous'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(sub.created_at).toLocaleDateString()} {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px] shrink-0',
                    sub.status === 'processed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : sub.status === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                  )}
                >
                  {sub.status}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>

      <SubmissionDetailSheet
        open={!!selectedSub}
        onOpenChange={(open) => { if (!open) setSelectedSub(null) }}
        submission={selectedSub}
        fields={fields}
      />
    </>
  )
}

// ==========================================================
// Form Builder Panel (right panel)
// ==========================================================

function FormBuilderPanel({
  form,
  tenantId,
}: {
  form: IntakeForm
  tenantId: string
}) {
  const updateForm = useUpdateIntakeForm()
  const publishForm = usePublishIntakeForm()
  const { data: practiceAreas } = usePracticeAreas(tenantId)
  const { data: pipelines } = usePipelines(tenantId, 'lead')
  const { data: teamMembers } = useTeamMembers(tenantId)

  const fields = useMemo(() => {
    const raw = form.fields as unknown
    return (Array.isArray(raw) ? raw : []) as IntakeField[]
  }, [form.fields])

  const settings = useMemo(() => {
    const raw = form.settings as unknown
    return (raw && typeof raw === 'object' ? raw : {}) as IntakeFormSettings
  }, [form.settings])

  const sections = useMemo(
    () => (settings.sections ?? []).sort((a, b) => a.sort_order - b.sort_order),
    [settings.sections],
  )

  // Stage loading for selected pipeline
  const { data: stages } = usePipelineStages(form.pipeline_id ?? '')

  // Field editor state
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<IntakeField | null>(null)
  const [copied, setCopied] = useState(false)

  // Section management state
  const [activeSectionTab, setActiveSectionTab] = useState<string>('__all__')
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<FormSection | null>(null)

  // Settings form state
  const [formName, setFormName] = useState(form.name)
  const [formSlug, setFormSlug] = useState(form.slug)
  const [formDescription, setFormDescription] = useState(form.description ?? '')
  const [formPracticeAreaId, setFormPracticeAreaId] = useState(form.practice_area_id ?? '')
  const [formPipelineId, setFormPipelineId] = useState(form.pipeline_id ?? '')
  const [formStageId, setFormStageId] = useState(form.stage_id ?? '')
  const [successMessage, setSuccessMessage] = useState(settings.success_message ?? '')
  const [redirectUrl, setRedirectUrl] = useState(settings.redirect_url ?? '')
  const [notifyEmail, setNotifyEmail] = useState(settings.notify_email ?? '')
  const [autoAssignTo, setAutoAssignTo] = useState(settings.auto_assign_to ?? '')
  const [embedCopied, setEmbedCopied] = useState(false)

  // Reset settings when form changes
  useEffect(() => {
    setFormName(form.name)
    setFormSlug(form.slug)
    setFormDescription(form.description ?? '')
    setFormPracticeAreaId(form.practice_area_id ?? '')
    setFormPipelineId(form.pipeline_id ?? '')
    setFormStageId(form.stage_id ?? '')
    setSuccessMessage(settings.success_message ?? '')
    setRedirectUrl(settings.redirect_url ?? '')
    setNotifyEmail(settings.notify_email ?? '')
    setAutoAssignTo(settings.auto_assign_to ?? '')
    setActiveSectionTab('__all__')
  }, [form.id, form.name, form.slug, form.description, form.practice_area_id, form.pipeline_id, form.stage_id, settings])

  // Pipeline auto-association: filter pipelines by practice area name
  const filteredPipelines = useMemo(() => {
    if (!pipelines) return []
    if (!formPracticeAreaId) return pipelines
    const pa = practiceAreas?.find((p) => p.id === formPracticeAreaId)
    if (!pa) return pipelines
    return pipelines.filter(
      (p) => !p.practice_area || p.practice_area.toLowerCase() === pa.name.toLowerCase()
    )
  }, [pipelines, formPracticeAreaId, practiceAreas])

  // Auto-select pipeline when practice area changes
  function handlePracticeAreaChange(paId: string) {
    setFormPracticeAreaId(paId)
    if (!paId) {
      // Cleared practice area, keep pipeline as-is
      return
    }
    const pa = practiceAreas?.find((p) => p.id === paId)
    if (!pa || !pipelines) return
    const matching = pipelines.filter(
      (p) => p.practice_area && p.practice_area.toLowerCase() === pa.name.toLowerCase()
    )
    if (matching.length === 1) {
      setFormPipelineId(matching[0].id)
      setFormStageId('')
    } else if (matching.length === 0) {
      // No matching pipeline, clear selection
      setFormPipelineId('')
      setFormStageId('')
    }
  }

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fieldIds = useMemo(() => fields.map((f) => f.id), [fields])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      sort_order: i,
    }))

    updateForm.mutate({ id: form.id, fields: reordered as unknown as Json })
  }

  function handleFieldSave(field: IntakeField) {
    const existing = fields.findIndex((f) => f.id === field.id)
    let updated: IntakeField[]
    if (existing >= 0) {
      updated = fields.map((f) => (f.id === field.id ? field : f))
    } else {
      updated = [...fields, { ...field, sort_order: fields.length }]
    }
    updateForm.mutate({ id: form.id, fields: updated as unknown as Json })
  }

  function handleFieldDelete(field: IntakeField) {
    const updated = fields.filter((f) => f.id !== field.id).map((f, i) => ({
      ...f,
      sort_order: i,
    }))
    updateForm.mutate({ id: form.id, fields: updated as unknown as Json })
  }

  // Section CRUD
  function handleSectionSave(section: FormSection) {
    const existing = sections.findIndex((s) => s.id === section.id)
    let updated: FormSection[]
    if (existing >= 0) {
      updated = sections.map((s) => (s.id === section.id ? section : s))
    } else {
      updated = [...sections, { ...section, sort_order: sections.length }]
    }
    const newSettings = { ...settings, sections: updated }
    updateForm.mutate({ id: form.id, settings: newSettings as unknown as Json })
  }

  function handleSectionDelete(sectionId: string) {
    const updated = sections.filter((s) => s.id !== sectionId).map((s, i) => ({ ...s, sort_order: i }))
    // Remove section_id from fields that belonged to deleted section
    const updatedFields = fields.map((f) => (f.section_id === sectionId ? { ...f, section_id: undefined } : f))
    const newSettings = { ...settings, sections: updated }
    updateForm.mutate({
      id: form.id,
      fields: updatedFields as unknown as Json,
      settings: newSettings as unknown as Json,
    })
    if (activeSectionTab === sectionId) setActiveSectionTab('__all__')
  }

  function handleSectionMoveLeft(sectionId: string) {
    const idx = sections.findIndex((s) => s.id === sectionId)
    if (idx <= 0) return
    const updated = [...sections]
    ;[updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]]
    const reordered = updated.map((s, i) => ({ ...s, sort_order: i }))
    const newSettings = { ...settings, sections: reordered }
    updateForm.mutate({ id: form.id, settings: newSettings as unknown as Json })
  }

  function handleSectionMoveRight(sectionId: string) {
    const idx = sections.findIndex((s) => s.id === sectionId)
    if (idx < 0 || idx >= sections.length - 1) return
    const updated = [...sections]
    ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
    const reordered = updated.map((s, i) => ({ ...s, sort_order: i }))
    const newSettings = { ...settings, sections: reordered }
    updateForm.mutate({ id: form.id, settings: newSettings as unknown as Json })
  }

  function handleSettingsSave() {
    updateForm.mutate(
      {
        id: form.id,
        name: formName.trim(),
        slug: formSlug.trim(),
        description: formDescription.trim() || null,
        practice_area_id: formPracticeAreaId || null,
        pipeline_id: formPipelineId || null,
        stage_id: formStageId || null,
        settings: {
          ...settings,
          success_message: successMessage.trim() || undefined,
          redirect_url: redirectUrl.trim() || undefined,
          notify_email: notifyEmail.trim() || undefined,
          auto_assign_to: autoAssignTo || undefined,
        } as unknown as Json,
      },
      { onSuccess: () => toast.success('Settings saved') }
    )
  }

  function handlePublishToggle() {
    publishForm.mutate({ id: form.id, publish: form.status !== 'published' })
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/forms/${form.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const isPublished = form.status === 'published'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{form.name}</h2>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px]',
                isPublished
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              )}
            >
              {form.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">/forms/{form.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const token = btoa(`${form.id}:${Date.now()}`)
              window.open(`/forms/${form.slug}/preview?token=${token}`, '_blank')
            }}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview
          </Button>
          {isPublished && (
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          )}
          <Button
            variant={isPublished ? 'outline' : 'default'}
            size="sm"
            onClick={handlePublishToggle}
            disabled={publishForm.isPending}
          >
            {publishForm.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : isPublished ? (
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="fields" className="flex-1 flex flex-col pt-4">
        <TabsList className="mb-4">
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        {/* --- Fields Tab --- */}
        <TabsContent value="fields" className="flex-1">
          {/* Section bar */}
          {sections.length > 0 && (
            <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeSectionTab === '__all__'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
                onClick={() => setActiveSectionTab('__all__')}
              >
                All Fields
              </button>
              {sections.map((s) => (
                <DropdownMenu key={s.id}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      className={cn(
                        'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        activeSectionTab === s.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                      onClick={() => setActiveSectionTab(s.id)}
                    >
                      {s.title}
                    </button>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="ml-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                  </div>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setEditingSection(s); setSectionDialogOpen(true) }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit Section
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSectionMoveLeft(s.id)} disabled={sections.indexOf(s) === 0}>
                      <ChevronLeft className="mr-2 h-3.5 w-3.5" />
                      Move Left
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSectionMoveRight(s.id)} disabled={sections.indexOf(s) === sections.length - 1}>
                      <ChevronRight className="mr-2 h-3.5 w-3.5" />
                      Move Right
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleSectionDelete(s.id)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete Section
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                onClick={() => { setEditingSection(null); setSectionDialogOpen(true) }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">
              {(() => {
                const displayFields = activeSectionTab === '__all__'
                  ? fields
                  : fields.filter((f) => f.section_id === activeSectionTab)
                return `${displayFields.length} field${displayFields.length !== 1 ? 's' : ''}`
              })()}
              {sections.length > 0 && activeSectionTab !== '__all__' && (
                <span className="ml-1 text-slate-400">
                  in {sections.find((s) => s.id === activeSectionTab)?.title ?? 'section'}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {sections.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingSection(null); setSectionDialogOpen(true) }}
                >
                  <Layers className="mr-1 h-3.5 w-3.5" />
                  Add Section
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => { setEditingField(null); setFieldDialogOpen(true) }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Field
              </Button>
            </div>
          </div>

          {(() => {
            const displayFields = activeSectionTab === '__all__'
              ? fields
              : fields.filter((f) => f.section_id === activeSectionTab)
            const displayFieldIds = displayFields.map((f) => f.id)

            if (displayFields.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
                  <FileInput className="h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">
                    {activeSectionTab === '__all__' ? 'No fields yet' : 'No fields in this section'}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {activeSectionTab === '__all__'
                      ? 'Add fields to build your intake form.'
                      : 'Add fields to this section.'}
                  </p>
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={() => { setEditingField(null); setFieldDialogOpen(true) }}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Field
                  </Button>
                </div>
              )
            }

            return (
              <ScrollArea className="flex-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={displayFieldIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 pr-2">
                      {displayFields.map((field) => (
                        <SortableFieldRow
                          key={field.id}
                          field={field}
                          onEdit={(f) => { setEditingField(f); setFieldDialogOpen(true) }}
                          onDelete={handleFieldDelete}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
            )
          })()}

          <FieldEditorDialog
            open={fieldDialogOpen}
            onOpenChange={(open) => {
              setFieldDialogOpen(open)
              if (!open) setEditingField(null)
            }}
            field={editingField}
            onSave={handleFieldSave}
            allFields={fields}
            sectionId={activeSectionTab !== '__all__' ? activeSectionTab : undefined}
          />

          <SectionEditorDialog
            open={sectionDialogOpen}
            onOpenChange={(open) => {
              setSectionDialogOpen(open)
              if (!open) setEditingSection(null)
            }}
            section={editingSection}
            onSave={handleSectionSave}
            allFields={fields}
          />
        </TabsContent>

        {/* --- Settings Tab --- */}
        <TabsContent value="settings" className="flex-1">
          <ScrollArea className="flex-1">
            <div className="space-y-5 pr-2 pb-4">
              <div>
                <label className="text-sm font-medium">Form Name</label>
                <Input className="mt-1.5" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>

              <div>
                <label className="text-sm font-medium">URL Slug</label>
                <Input className="mt-1.5" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">Public URL: /forms/{formSlug || '...'}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  placeholder="Brief description shown at the top of the form"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <Separator />

              <div>
                <label className="text-sm font-medium">Practice Area</label>
                <Select
                  value={formPracticeAreaId || '__none__'}
                  onValueChange={(v) => handlePracticeAreaChange(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {practiceAreas?.map((pa) => (
                      <SelectItem key={pa.id} value={pa.id}>{pa.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Auto-create Lead in Pipeline</label>
                <Select value={formPipelineId || '__none__'} onValueChange={(v) => { setFormPipelineId(v === '__none__' ? '' : v); setFormStageId('') }}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="None — don't create leads" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {filteredPipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formPracticeAreaId && filteredPipelines.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No pipelines match this practice area.</p>
                )}
              </div>

              {formPipelineId && (
                <div>
                  <label className="text-sm font-medium">Initial Stage</label>
                  <Select value={formStageId || '__none__'} onValueChange={(v) => setFormStageId(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue placeholder="First stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">First stage (default)</SelectItem>
                      {stages?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div>
                <label className="text-sm font-medium">Success Message</label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  placeholder="Thank you for your submission!"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Redirect URL (optional)</label>
                <Input
                  className="mt-1.5"
                  placeholder="https://yoursite.com/thank-you"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                />
              </div>

              <Separator />

              {/* Notification & Assignment */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="h-4 w-4 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-900">Notifications & Assignment</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Notification Email</label>
                    <Input
                      className="mt-1.5"
                      type="email"
                      placeholder="team@yourfirm.com"
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Receive a notification when someone submits this form.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Auto-Assign Leads To</label>
                    <Select value={autoAssignTo || '__none__'} onValueChange={(v) => setAutoAssignTo(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue placeholder="No auto-assignment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No auto-assignment</SelectItem>
                        {teamMembers?.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-slate-500">
                      Automatically assign leads created from this form to a team member.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Shareable Link */}
              {isPublished && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800">Shareable Link</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded bg-white px-2.5 py-1.5 text-xs font-mono text-emerald-700 border">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/forms/{form.slug}
                    </code>
                    <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Embed Code */}
              {isPublished && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Embed on Your Website</span>
                  </div>
                  <p className="mt-1 text-xs text-blue-700/70">
                    Copy the code below and paste it into your website&apos;s HTML.
                  </p>
                  <div className="mt-2">
                    <code className="block rounded bg-white px-2.5 py-2 text-[11px] font-mono text-blue-800 border border-blue-200 overflow-x-auto whitespace-nowrap">
                      {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/forms/${form.slug}?embed=true" width="100%" height="700" frameborder="0" style="border:none;"></iframe>`}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        const code = `<iframe src="${window.location.origin}/forms/${form.slug}?embed=true" width="100%" height="700" frameborder="0" style="border:none;"></iframe>`
                        navigator.clipboard.writeText(code)
                        setEmbedCopied(true)
                        toast.success('Embed code copied!')
                        setTimeout(() => setEmbedCopied(false), 2000)
                      }}
                    >
                      {embedCopied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      {embedCopied ? 'Copied' : 'Copy Embed Code'}
                    </Button>
                  </div>
                </div>
              )}

              <Button onClick={handleSettingsSave} disabled={updateForm.isPending}>
                {updateForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* --- Submissions Tab --- */}
        <TabsContent value="submissions" className="flex-1">
          <SubmissionsPanel formId={form.id} fields={fields} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==========================================================
// Form Card (with dropdown menu for edit/delete)
// ==========================================================

function FormCard({
  form,
  isSelected,
  submissionCount,
  onClick,
  onRename,
  onDuplicate,
  onDelete,
}: {
  form: IntakeForm
  isSelected: boolean
  submissionCount?: number
  onClick: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer p-4 transition-all hover:shadow-sm',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'hover:border-slate-300'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              {form.name}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] shrink-0',
                form.status === 'published'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : form.status === 'archived'
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
              )}
            >
              {form.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">/forms/{form.slug}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {submissionCount !== undefined && submissionCount > 0 && (
            <span className="text-xs text-slate-400 mr-1">
              {submissionCount}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <CopyPlus className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  )
}

function FormCardWithCount({
  form,
  isSelected,
  onClick,
  onRename,
  onDuplicate,
  onDelete,
}: {
  form: IntakeForm
  isSelected: boolean
  onClick: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { data: submissions } = useIntakeSubmissions(form.id)
  return (
    <FormCard
      form={form}
      isSelected={isSelected}
      submissionCount={submissions?.length}
      onClick={onClick}
      onRename={onRename}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  )
}

// ==========================================================
// Main Page
// ==========================================================

export default function FormsPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  // Practice area filter from global header
  const { filter: practiceFilter, effectiveId: practiceAreaId, isFiltered: isPracticeFiltered } = usePracticeAreaContext()

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<IntakeForm | null>(null)
  const [renameTarget, setRenameTarget] = useState<IntakeForm | null>(null)

  const { data: forms, isLoading: formsLoading } = useIntakeForms(tenantId)
  const createForm = useCreateIntakeForm()

  // Filter forms by practice area
  const filteredForms = useMemo(() => {
    if (!forms) return []
    if (!isPracticeFiltered) return forms
    return forms.filter((f) => f.practice_area_id === practiceAreaId)
  }, [forms, isPracticeFiltered, practiceAreaId])

  const selectedForm = useMemo(
    () => filteredForms.find((f) => f.id === selectedFormId) ?? null,
    [filteredForms, selectedFormId]
  )

  // Clear selection if form was deleted or filtered out
  useEffect(() => {
    if (selectedFormId && !filteredForms.find((f) => f.id === selectedFormId)) {
      setSelectedFormId(null)
    }
  }, [filteredForms, selectedFormId])

  const handleDuplicateForm = useCallback(async (form: IntakeForm) => {
    const fields = Array.isArray(form.fields) ? JSON.parse(JSON.stringify(form.fields)) : []
    // Generate new IDs for each field to avoid conflicts
    const idMap = new Map<string, string>()
    for (const field of fields as IntakeField[]) {
      const oldId = field.id
      const newId = crypto.randomUUID()
      idMap.set(oldId, newId)
      field.id = newId
    }
    // Deep copy settings and remap section IDs + condition field references
    const settings = form.settings ? JSON.parse(JSON.stringify(form.settings)) as IntakeFormSettings : {}
    if (settings.sections) {
      for (const section of settings.sections) {
        const oldSectionId = section.id
        const newSectionId = crypto.randomUUID()
        // Update field references to the new section ID
        for (const field of fields as IntakeField[]) {
          if (field.section_id === oldSectionId) {
            field.section_id = newSectionId
          }
        }
        section.id = newSectionId
        // Remap condition field references
        if (section.condition?.field_id && idMap.has(section.condition.field_id)) {
          section.condition.field_id = idMap.get(section.condition.field_id)!
        }
      }
    }
    // Remap field condition references
    for (const field of fields as IntakeField[]) {
      if (field.condition?.field_id && idMap.has(field.condition.field_id)) {
        field.condition.field_id = idMap.get(field.condition.field_id)!
      }
    }
    const uniqueSlug = `${form.slug}-copy-${Date.now().toString(36)}`
    const newForm = await createForm.mutateAsync({
      tenant_id: tenantId,
      name: `${form.name} (Copy)`,
      slug: uniqueSlug,
      fields: fields as any,
      settings: settings as any,
      practice_area_id: form.practice_area_id,
      pipeline_id: form.pipeline_id,
      stage_id: form.stage_id,
      status: 'draft',
      is_active: true,
      created_by: userId,
    })
    setSelectedFormId(newForm.id)
  }, [createForm, tenantId, userId])

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="flex gap-6">
          <div className="w-2/5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex-1">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Intake Forms
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Build custom intake forms and share them with a public link to collect client information.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Form
        </Button>
      </div>

      <Separator />

      {/* Main content: two panels */}
      <div className="flex gap-6" style={{ minHeight: '65vh' }}>
        {/* Left panel: form list */}
        <div className="w-2/5 flex flex-col">
          {formsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredForms.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <FileInput className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                {isPracticeFiltered ? 'No forms for this practice area' : 'No intake forms yet'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {isPracticeFiltered
                  ? 'Create a form and assign it to this practice area.'
                  : 'Create your first form to start collecting responses.'}
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Create Form
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {filteredForms.map((f) => (
                  <FormCardWithCount
                    key={f.id}
                    form={f}
                    isSelected={selectedFormId === f.id}
                    onClick={() => setSelectedFormId(f.id)}
                    onRename={() => setRenameTarget(f)}
                    onDuplicate={() => handleDuplicateForm(f)}
                    onDelete={() => setDeleteTarget(f)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right panel: form builder */}
        <div className="flex-1 rounded-lg border bg-slate-50/50 p-5">
          {selectedForm ? (
            <FormBuilderPanel
              key={selectedForm.id}
              form={selectedForm}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <FileInput className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No form selected
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Select a form from the left to edit its fields and settings.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
        userId={userId}
      />

      <RenameFormDialog
        open={!!renameTarget}
        onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
        form={renameTarget}
      />

      <DeleteFormDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        form={deleteTarget}
        onDeleted={() => {
          if (deleteTarget?.id === selectedFormId) setSelectedFormId(null)
        }}
      />
    </div>
  )
}
