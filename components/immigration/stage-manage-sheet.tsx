'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
  useCreateCaseStage,
  useUpdateCaseStage,
  useDeleteCaseStage,
} from '@/lib/queries/immigration'
import type { Database } from '@/lib/types/database'

type CaseStageDefinition = Database['public']['Tables']['case_stage_definitions']['Row']

const STAGE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#22c55e', // green
  '#eab308', // yellow
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

interface StageManageSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: CaseStageDefinition[]
  caseTypeId: string
  tenantId: string
}

export function StageManageSheet({
  open,
  onOpenChange,
  stages,
  caseTypeId,
  tenantId,
}: StageManageSheetProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CaseStageDefinition | null>(null)

  // Form state for add/edit
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState(STAGE_COLORS[0])
  const [formTerminal, setFormTerminal] = useState(false)
  const [formRequiresChecklist, setFormRequiresChecklist] = useState(false)

  const createStage = useCreateCaseStage()
  const updateStage = useUpdateCaseStage()
  const deleteStage = useDeleteCaseStage()

  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order)

  function resetForm() {
    setFormName('')
    setFormColor(STAGE_COLORS[0])
    setFormTerminal(false)
    setFormRequiresChecklist(false)
  }

  function startEdit(stage: CaseStageDefinition) {
    setEditingId(stage.id)
    setFormName(stage.name)
    setFormColor(stage.color)
    setFormTerminal(stage.is_terminal)
    setFormRequiresChecklist(stage.requires_checklist_complete)
    setShowAdd(false)
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm()
  }

  function startAdd() {
    setEditingId(null)
    resetForm()
    setShowAdd(true)
  }

  function handleSaveNew() {
    if (!formName.trim()) return
    const maxSortOrder = sorted.length > 0 ? Math.max(...sorted.map((s) => s.sort_order)) : 0
    createStage.mutate(
      {
        tenant_id: tenantId,
        case_type_id: caseTypeId,
        name: formName.trim(),
        slug: slugify(formName.trim()),
        color: formColor,
        is_terminal: formTerminal,
        requires_checklist_complete: formRequiresChecklist,
        sort_order: maxSortOrder + 1,
      },
      {
        onSuccess: () => {
          setShowAdd(false)
          resetForm()
        },
      }
    )
  }

  function handleSaveEdit() {
    if (!editingId || !formName.trim()) return
    updateStage.mutate(
      {
        id: editingId,
        caseTypeId,
        name: formName.trim(),
        slug: slugify(formName.trim()),
        color: formColor,
        is_terminal: formTerminal,
        requires_checklist_complete: formRequiresChecklist,
      },
      {
        onSuccess: () => {
          setEditingId(null)
          resetForm()
        },
      }
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteStage.mutate(
      { id: deleteTarget.id, caseTypeId },
      {
        onSuccess: () => {
          setDeleteTarget(null)
        },
      }
    )
  }

  const isLoading = createStage.isPending || updateStage.isPending || deleteStage.isPending

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-base">Manage Stages</SheetTitle>
            <SheetDescription className="text-xs">
              Add, edit, or delete stages for this case type. Changes apply to all new matters.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {/* Stage list */}
            <div className="space-y-1">
              {sorted.map((stage, index) => {
                const isEditing = editingId === stage.id

                if (isEditing) {
                  return (
                    <StageFormRow
                      key={stage.id}
                      name={formName}
                      color={formColor}
                      isTerminal={formTerminal}
                      requiresChecklist={formRequiresChecklist}
                      onNameChange={setFormName}
                      onColorChange={setFormColor}
                      onTerminalChange={setFormTerminal}
                      onRequiresChecklistChange={setFormRequiresChecklist}
                      onSave={handleSaveEdit}
                      onCancel={cancelEdit}
                      isLoading={isLoading}
                      saveLabel="Save"
                    />
                  )
                }

                return (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 group hover:bg-slate-50 transition-colors"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate block">
                        {stage.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {stage.is_terminal && (
                          <span className="text-[10px] font-medium text-orange-600 bg-orange-950/30 border border-orange-500/20 rounded px-1 py-0">
                            Terminal
                          </span>
                        )}
                        {stage.requires_checklist_complete && (
                          <span className="text-[10px] font-medium text-blue-600 bg-blue-950/30 border border-blue-500/20 rounded px-1 py-0">
                            Checklist Gate
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                      #{index + 1}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(stage)}
                        disabled={isLoading}
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-red-600"
                        onClick={() => setDeleteTarget(stage)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add new stage form */}
            {showAdd && (
              <div className="mt-2">
                <StageFormRow
                  name={formName}
                  color={formColor}
                  isTerminal={formTerminal}
                  requiresChecklist={formRequiresChecklist}
                  onNameChange={setFormName}
                  onColorChange={setFormColor}
                  onTerminalChange={setFormTerminal}
                  onRequiresChecklistChange={setFormRequiresChecklist}
                  onSave={handleSaveNew}
                  onCancel={() => { setShowAdd(false); resetForm() }}
                  isLoading={isLoading}
                  saveLabel="Add"
                />
              </div>
            )}

            {/* Add button */}
            {!showAdd && !editingId && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={startAdd}
                disabled={isLoading}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Stage
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? Existing matters in this stage won&apos;t be affected, but this stage will no longer appear in new matters.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Inline form row ─────────────────────────────────────────────────────────

function StageFormRow({
  name,
  color,
  isTerminal,
  requiresChecklist,
  onNameChange,
  onColorChange,
  onTerminalChange,
  onRequiresChecklistChange,
  onSave,
  onCancel,
  isLoading,
  saveLabel,
}: {
  name: string
  color: string
  isTerminal: boolean
  requiresChecklist: boolean
  onNameChange: (v: string) => void
  onColorChange: (v: string) => void
  onTerminalChange: (v: boolean) => void
  onRequiresChecklistChange: (v: boolean) => void
  onSave: () => void
  onCancel: () => void
  isLoading: boolean
  saveLabel: string
}) {
  return (
    <div className="rounded-lg border-2 border-primary/20 bg-slate-50 p-3 space-y-3">
      {/* Name */}
      <div>
        <Label className="text-xs">Stage Name</Label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Application Prep"
          className="h-8 text-sm mt-1"
          autoFocus
        />
      </div>

      {/* Color picker */}
      <div>
        <Label className="text-xs">Color</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-all',
                color === c
                  ? 'border-slate-800 scale-110'
                  : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
            />
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="terminal"
            checked={isTerminal}
            onCheckedChange={onTerminalChange}
            className="scale-75"
          />
          <Label htmlFor="terminal" className="text-xs cursor-pointer">
            Terminal
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="checklist-gate"
            checked={requiresChecklist}
            onCheckedChange={onRequiresChecklistChange}
            className="scale-75"
          />
          <Label htmlFor="checklist-gate" className="text-xs cursor-pointer">
            Checklist Gate
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onSave}
          disabled={!name.trim() || isLoading}
        >
          <Check className="h-3 w-3 mr-1" />
          {saveLabel}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
          disabled={isLoading}
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  )
}
