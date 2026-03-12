'use client'

import { useState, useCallback } from 'react'
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
  GripVertical,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  Undo2,
  Type,
  Table2,
  Minus,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCreateVersion } from '@/lib/queries/document-engine'
import type {
  TemplateBody,
  TemplateSection,
  TemplateElement,
  ParagraphStyle,
} from '@/lib/types/document-engine'

// ─── Props ──────────────────────────────────────────────────────────────

interface TemplateStructureEditorProps {
  templateId: string
  version: Record<string, unknown>
  mappings: Record<string, unknown>[]
  conditions: Record<string, unknown>[]
  clauseAssignments: Record<string, unknown>[]
  onDone: () => void
}

// ─── Main Editor ────────────────────────────────────────────────────────

export function TemplateStructureEditor({
  templateId,
  version,
  mappings,
  conditions,
  clauseAssignments,
  onDone,
}: TemplateStructureEditorProps) {
  const originalBody = version.template_body as TemplateBody
  const [editBody, setEditBody] = useState<TemplateBody>(() =>
    JSON.parse(JSON.stringify(originalBody))
  )
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const createVersion = useCreateVersion(templateId)

  const isDirty = JSON.stringify(editBody) !== JSON.stringify(originalBody)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ─── Section operations ─────────────────────────────────────────────

  const handleSectionDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setEditBody((prev) => {
      const sorted = [...prev.sections].sort((a, b) => a.order - b.order)
      const oldIndex = sorted.findIndex((s) => s.id === active.id)
      const newIndex = sorted.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev

      const reordered = arrayMove(sorted, oldIndex, newIndex).map((s, i) => ({
        ...s,
        order: i,
      }))
      return { ...prev, sections: reordered }
    })
  }, [])

  const addSection = useCallback(() => {
    setEditBody((prev) => {
      const newId = `section_${Date.now()}`
      const maxOrder = Math.max(-1, ...prev.sections.map((s) => s.order))
      const newSection: TemplateSection = {
        id: newId,
        title: '',
        title_style: 'heading2',
        condition_key: null,
        order: maxOrder + 1,
        elements: [],
      }
      return { ...prev, sections: [...prev.sections, newSection] }
    })
  }, [])

  const deleteSection = useCallback((sectionId: string) => {
    setEditBody((prev) => ({
      ...prev,
      sections: prev.sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, order: i })),
    }))
    setExpandedSection((prev) => (prev === sectionId ? null : prev))
  }, [])

  const updateSectionTitle = useCallback((sectionId: string, title: string) => {
    setEditBody((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      ),
    }))
  }, [])

  const updateSectionTitleStyle = useCallback(
    (sectionId: string, titleStyle: 'heading1' | 'heading2' | 'heading3') => {
      setEditBody((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, title_style: titleStyle } : s
        ),
      }))
    },
    []
  )

  // ─── Element operations ─────────────────────────────────────────────

  const handleElementDragEnd = useCallback(
    (sectionId: string) => (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setEditBody((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s
          const sorted = [...s.elements].sort((a, b) => a.order - b.order)
          const oldIndex = sorted.findIndex((e) => e.id === active.id)
          const newIndex = sorted.findIndex((e) => e.id === over.id)
          if (oldIndex === -1 || newIndex === -1) return s

          const reordered = arrayMove(sorted, oldIndex, newIndex).map((e, i) => ({
            ...e,
            order: i,
          })) as TemplateElement[]
          return { ...s, elements: reordered }
        }),
      }))
    },
    []
  )

  const addElement = useCallback(
    (sectionId: string, type: 'paragraph' | 'table' | 'page_break') => {
      setEditBody((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s
          const maxOrder = Math.max(-1, ...s.elements.map((e) => e.order))
          let newElement: TemplateElement

          if (type === 'paragraph') {
            newElement = {
              id: `el_${Date.now()}`,
              type: 'paragraph',
              content: '',
              style: 'body' as ParagraphStyle,
              order: maxOrder + 1,
            }
          } else if (type === 'table') {
            newElement = {
              id: `el_${Date.now()}`,
              type: 'table',
              columns: ['Column 1', 'Column 2'],
              rows: [['', '']],
              order: maxOrder + 1,
            }
          } else {
            newElement = {
              id: `el_${Date.now()}`,
              type: 'page_break',
              order: maxOrder + 1,
            }
          }

          return { ...s, elements: [...s.elements, newElement] }
        }),
      }))
    },
    []
  )

  const deleteElement = useCallback((sectionId: string, elementId: string) => {
    setEditBody((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s
        return {
          ...s,
          elements: s.elements
            .filter((e) => e.id !== elementId)
            .map((e, i) => ({ ...e, order: i })) as TemplateElement[],
        }
      }),
    }))
  }, [])

  const updateElement = useCallback(
    (sectionId: string, elementId: string, updates: Record<string, unknown>) => {
      setEditBody((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s
          return {
            ...s,
            elements: s.elements.map((e) =>
              e.id === elementId ? ({ ...e, ...updates } as TemplateElement) : e
            ),
          }
        }),
      }))
    },
    []
  )

  // ─── Save ───────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const currentVersionNum = (version.version_number as number) ?? 0
    const nextLabel = `v${currentVersionNum + 1}`

    createVersion.mutate(
      {
        templateBody: editBody,
        versionLabel: nextLabel,
        changeSummary: 'Structure edit',
        mappings: mappings.map((m) => ({
          field_key: m.field_key,
          display_name: m.display_name,
          field_type: m.field_type,
          source_entity: m.source_entity,
          source_path: m.source_path,
          format_rule: m.format_rule ?? null,
          default_value: m.default_value ?? null,
          fallback_value: m.fallback_value ?? null,
          is_required: m.is_required ?? false,
          sort_order: m.sort_order ?? 0,
        })),
        conditions: conditions.map((c) => ({
          condition_key: c.condition_key,
          label: c.label,
          logic_operator: c.logic_operator ?? 'AND',
          rules: c.rules,
          sort_order: c.sort_order ?? 0,
        })),
        clauseAssignments: clauseAssignments.map((ca) => ({
          clause_id: ca.clause_id,
          placement_key: ca.placement_key,
          sort_order: ca.sort_order ?? 0,
          condition_id: ca.condition_id ?? null,
        })),
      },
      {
        onSuccess: () => onDone(),
      }
    )
  }, [editBody, version, mappings, conditions, clauseAssignments, createVersion, onDone])

  const handleDiscard = useCallback(() => {
    setEditBody(JSON.parse(JSON.stringify(originalBody)))
  }, [originalBody])

  // ─── Render ─────────────────────────────────────────────────────────

  const sortedSections = [...editBody.sections].sort((a, b) => a.order - b.order)
  const sectionIds = sortedSections.map((s) => s.id)

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Edit Structure</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={!isDirty || createVersion.isPending}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || createVersion.isPending}
          >
            {createVersion.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save Draft
          </Button>
        </div>
      </div>

      {/* Sections */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sortedSections.map((section) => (
              <SortableSectionItem
                key={section.id}
                section={section}
                isExpanded={expandedSection === section.id}
                onToggleExpand={() =>
                  setExpandedSection((prev) =>
                    prev === section.id ? null : section.id
                  )
                }
                onUpdateTitle={(title) => updateSectionTitle(section.id, title)}
                onUpdateTitleStyle={(style) =>
                  updateSectionTitleStyle(section.id, style)
                }
                onDelete={() => deleteSection(section.id)}
                onElementDragEnd={handleElementDragEnd(section.id)}
                onAddElement={(type) => addElement(section.id, type)}
                onDeleteElement={(elementId) =>
                  deleteElement(section.id, elementId)
                }
                onUpdateElement={(elementId, updates) =>
                  updateElement(section.id, elementId, updates)
                }
                sensors={sensors}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add Section button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={addSection}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Section
      </Button>
    </div>
  )
}

// ─── Sortable Section Item ────────────────────────────────────────────

interface SortableSectionItemProps {
  section: TemplateSection
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdateTitle: (title: string) => void
  onUpdateTitleStyle: (style: 'heading1' | 'heading2' | 'heading3') => void
  onDelete: () => void
  onElementDragEnd: (event: DragEndEvent) => void
  onAddElement: (type: 'paragraph' | 'table' | 'page_break') => void
  onDeleteElement: (elementId: string) => void
  onUpdateElement: (elementId: string, updates: Record<string, unknown>) => void
  sensors: ReturnType<typeof useSensors>
}

function SortableSectionItem({
  section,
  isExpanded,
  onToggleExpand,
  onUpdateTitle,
  onUpdateTitleStyle,
  onDelete,
  onElementDragEnd,
  onAddElement,
  onDeleteElement,
  onUpdateElement,
  sensors,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const sortedElements = [...section.elements].sort((a, b) => a.order - b.order)
  const elementIds = sortedElements.map((e) => e.id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-md ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      {/* Section header */}
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={onToggleExpand}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <Input
          value={section.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          placeholder="Section title..."
          className="h-7 text-sm font-medium flex-1 border-none shadow-none focus-visible:ring-1 px-1"
        />

        <Select
          value={section.title_style || 'heading2'}
          onValueChange={(val) =>
            onUpdateTitleStyle(val as 'heading1' | 'heading2' | 'heading3')
          }
        >
          <SelectTrigger className="h-7 w-[80px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="heading1">H1</SelectItem>
            <SelectItem value="heading2">H2</SelectItem>
            <SelectItem value="heading3">H3</SelectItem>
          </SelectContent>
        </Select>

        {section.condition_key && (
          <Badge variant="outline" className="text-[9px] shrink-0">
            if: {section.condition_key}
          </Badge>
        )}

        <span className="text-[10px] text-muted-foreground shrink-0">
          {section.elements.length} el
        </span>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="p-0.5 text-muted-foreground hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete section?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove &quot;{section.title || 'Untitled section'}&quot; and all its
                elements. This cannot be undone until you discard changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Expanded: show elements */}
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onElementDragEnd}
          >
            <SortableContext
              items={elementIds}
              strategy={verticalListSortingStrategy}
            >
              {sortedElements.map((element) => (
                <SortableElementItem
                  key={element.id}
                  element={element}
                  onDelete={() => onDeleteElement(element.id)}
                  onUpdate={(updates) => onUpdateElement(element.id, updates)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add element dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full border border-dashed text-xs h-7"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Element
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onAddElement('paragraph')}>
                <Type className="h-3.5 w-3.5 mr-2" />
                Paragraph
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddElement('table')}>
                <Table2 className="h-3.5 w-3.5 mr-2" />
                Table
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddElement('page_break')}>
                <Minus className="h-3.5 w-3.5 mr-2" />
                Page Break
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

// ─── Sortable Element Item ────────────────────────────────────────────

interface SortableElementItemProps {
  element: TemplateElement
  onDelete: () => void
  onUpdate: (updates: Record<string, unknown>) => void
}

function SortableElementItem({
  element,
  onDelete,
  onUpdate,
}: SortableElementItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1.5 border rounded px-2 py-1.5 bg-background ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      <div className="flex-1 min-w-0">
        {element.type === 'paragraph' && (
          <ParagraphEditor element={element} onUpdate={onUpdate} />
        )}
        {element.type === 'table' && (
          <TableEditor element={element} onUpdate={onUpdate} />
        )}
        {element.type === 'page_break' && (
          <div className="text-[10px] text-muted-foreground py-1">
            — PAGE BREAK —
          </div>
        )}
        {element.type === 'signature_block' && (
          <div className="text-[10px] text-muted-foreground py-1">
            Signature Block (edit in Preview)
          </div>
        )}
        {element.type === 'clause_placeholder' && (
          <div className="text-[10px] text-muted-foreground py-1">
            Clause: {element.clause_placement_key}
          </div>
        )}
      </div>

      {'condition_key' in element && element.condition_key && (
        <Badge variant="outline" className="text-[8px] shrink-0 mt-0.5">
          if: {element.condition_key as string}
        </Badge>
      )}

      <button
        onClick={onDelete}
        className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0 mt-0.5"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Paragraph Editor ─────────────────────────────────────────────────

function ParagraphEditor({
  element,
  onUpdate,
}: {
  element: TemplateElement
  onUpdate: (updates: Record<string, unknown>) => void
}) {
  const el = element as TemplateElement & { content?: string; style?: string }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Badge variant="secondary" className="text-[9px]">
          paragraph
        </Badge>
        <Select
          value={el.style || 'body'}
          onValueChange={(val) => onUpdate({ style: val })}
        >
          <SelectTrigger className="h-5 w-[90px] text-[10px] border-none shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="body">Body</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="heading1">Heading 1</SelectItem>
            <SelectItem value="heading2">Heading 2</SelectItem>
            <SelectItem value="heading3">Heading 3</SelectItem>
            <SelectItem value="bullet">Bullet</SelectItem>
            <SelectItem value="numbered">Numbered</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={el.content || ''}
        onChange={(e) => onUpdate({ content: e.target.value })}
        placeholder="Paragraph content... (use {{field_key}} for merge fields)"
        className="text-xs min-h-[40px] resize-y"
        rows={2}
      />
    </div>
  )
}

// ─── Table Editor ─────────────────────────────────────────────────────

function TableEditor({
  element,
  onUpdate,
}: {
  element: TemplateElement
  onUpdate: (updates: Record<string, unknown>) => void
}) {
  const el = element as TemplateElement & { columns?: string[]; rows?: string[][] }
  const columns = el.columns || []
  const rows = el.rows || []

  const updateColumn = (idx: number, val: string) => {
    const newCols = [...columns]
    newCols[idx] = val
    onUpdate({ columns: newCols })
  }

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    const newRows = rows.map((r) => [...r])
    newRows[rowIdx][colIdx] = val
    onUpdate({ rows: newRows })
  }

  const addRow = () => {
    const newRow = new Array(columns.length).fill('')
    onUpdate({ rows: [...rows, newRow] })
  }

  const deleteRow = (idx: number) => {
    onUpdate({ rows: rows.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-1">
      <Badge variant="secondary" className="text-[9px]">
        table
      </Badge>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((col, ci) => (
                <th key={ci} className="px-1 py-0.5">
                  <Input
                    value={col}
                    onChange={(e) => updateColumn(ci, e.target.value)}
                    className="h-5 text-[10px] border-none shadow-none bg-transparent px-0.5 font-medium"
                  />
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-1 py-0.5">
                    <Input
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="h-5 text-[10px] border-none shadow-none bg-transparent px-0.5"
                    />
                  </td>
                ))}
                <td className="px-0.5">
                  <button
                    onClick={() => deleteRow(ri)}
                    className="p-0.5 text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] px-2"
        onClick={addRow}
      >
        <Plus className="h-2.5 w-2.5 mr-0.5" />
        Row
      </Button>
    </div>
  )
}
