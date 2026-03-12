'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ClipboardList,
  Plus,
  X,
  Search,
  AlertCircle,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
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
import { cn } from '@/lib/utils'
import {
  useIrccForms,
  useStreamFormsByMatterType,
  useAssignFormWithQuestions,
  useRemoveFormWithQuestions,
  useToggleQuestionSetCode,
  useClientFieldStats,
} from '@/lib/queries/ircc-forms'
import { useMatterTypeFormCodes } from '@/lib/queries/matter-types'
import { getFormQuestionStats, hasQuestionDefinitions } from '@/lib/ircc/form-question-utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface UnifiedFormsQuestionsSectionProps {
  matterTypeId: string
  tenantId: string
}

interface RemoveTarget {
  streamFormId: string
  formCode: string
  formName: string
  hasQuestions: boolean
}

// ── Main Component ───────────────────────────────────────────────────────────

export function UnifiedFormsQuestionsSection({
  matterTypeId,
  tenantId,
}: UnifiedFormsQuestionsSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)
  const [removeMode, setRemoveMode] = useState<'both' | 'form-only' | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteConfirmed, setBulkDeleteConfirmed] = useState(false)

  // Data
  const { data: streamForms, isLoading: formsLoading } = useStreamFormsByMatterType(matterTypeId)
  const { data: questionCodes = [] } = useMatterTypeFormCodes(matterTypeId)

  // Computed stats
  const { formCount, questionsCount } = useMemo(() => {
    const fc = streamForms?.length ?? 0
    let qc = 0
    if (streamForms) {
      for (const sf of streamForms) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (sf as any).form?.form_code as string | undefined
        if (code && questionCodes.includes(code)) qc++
      }
    }
    return { formCount: fc, questionsCount: qc }
  }, [streamForms, questionCodes])

  const allFormIds = useMemo(() => (streamForms ?? []).map((sf) => sf.id), [streamForms])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === allFormIds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allFormIds))
    }
  }, [selectedIds.size, allFormIds])

  const isAllSelected = allFormIds.length > 0 && selectedIds.size === allFormIds.length
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < allFormIds.length

  return (
    <div className="rounded-lg border bg-white">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">
            IRCC Forms & Questions
          </span>
          <span className="text-xs text-slate-400">
            {formCount} form{formCount !== 1 ? 's' : ''}
            {questionsCount > 0 && `, ${questionsCount} with questions`}
          </span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {formsLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !streamForms || streamForms.length === 0 ? (
            <div className="text-center py-6">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No forms assigned</p>
              <p className="text-xs text-slate-400 mt-1">
                Add IRCC forms to enable document templates and questionnaires
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Form
              </Button>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {/* Select All / Bulk Actions Bar */}
              <div className="flex items-center justify-between px-1 pb-1">
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  onClick={toggleSelectAll}
                >
                  {isAllSelected ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : isSomeSelected ? (
                    <MinusSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </button>
                {selectedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove {selectedIds.size} form{selectedIds.size !== 1 ? 's' : ''}
                  </Button>
                )}
              </div>

              {streamForms.map((sf) => (
                <AssignedFormRow
                  key={sf.id}
                  streamForm={sf}
                  questionCodes={questionCodes}
                  matterTypeId={matterTypeId}
                  selected={selectedIds.has(sf.id)}
                  onToggleSelect={() => toggleSelection(sf.id)}
                  onRemove={(target) => setRemoveTarget(target)}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Form
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add Form Dialog */}
      <AddFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        matterTypeId={matterTypeId}
        tenantId={tenantId}
        existingFormIds={(streamForms ?? []).map((sf) => sf.form_id)}
        streamFormCount={streamForms?.length ?? 0}
      />

      {/* Remove Confirmation Dialog */}
      {removeTarget && !removeMode && (
        <AlertDialog open onOpenChange={() => setRemoveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removeTarget.formCode}?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeTarget.hasQuestions ? (
                  <>
                    This form has questionnaire questions attached. How would you like to remove it?
                  </>
                ) : (
                  <>
                    Remove <strong>{removeTarget.formCode}</strong> ({removeTarget.formName}) from this matter type?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {removeTarget.hasQuestions ? (
                <>
                  <AlertDialogAction
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => setRemoveMode('form-only')}
                  >
                    Remove Form Only
                  </AlertDialogAction>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => setRemoveMode('both')}
                  >
                    Remove Form & Questions
                  </AlertDialogAction>
                </>
              ) : (
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => setRemoveMode('both')}
                >
                  Remove
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Execute removal */}
      {removeTarget && removeMode && (
        <RemoveExecutor
          target={removeTarget}
          mode={removeMode}
          matterTypeId={matterTypeId}
          onDone={() => {
            setRemoveTarget(null)
            setRemoveMode(null)
          }}
        />
      )}

      {/* Bulk Delete Confirmation */}
      {bulkDeleteOpen && (
        <AlertDialog open onOpenChange={() => setBulkDeleteOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {selectedIds.size} form{selectedIds.size !== 1 ? 's' : ''}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the selected forms and their associated questions from this matter type.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  setBulkDeleteOpen(false)
                  setBulkDeleteConfirmed(true)
                }}
              >
                Remove All Selected
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bulk Delete Executor */}
      {bulkDeleteConfirmed && selectedIds.size > 0 && (
        <BulkRemoveExecutor
          streamForms={streamForms ?? []}
          selectedIds={selectedIds}
          questionCodes={questionCodes}
          matterTypeId={matterTypeId}
          onDone={() => {
            setSelectedIds(new Set())
            setBulkDeleteConfirmed(false)
          }}
        />
      )}
    </div>
  )
}

// ── Assigned Form Row ────────────────────────────────────────────────────────

function AssignedFormRow({
  streamForm,
  questionCodes,
  matterTypeId,
  selected,
  onToggleSelect,
  onRemove,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamForm: any
  questionCodes: string[]
  matterTypeId: string
  selected: boolean
  onToggleSelect: () => void
  onRemove: (target: RemoveTarget) => void
}) {
  const toggleMutation = useToggleQuestionSetCode()
  const [showQuestions, setShowQuestions] = useState(false)

  const formCode: string = streamForm.form?.form_code ?? ''
  const formName: string = streamForm.form?.form_name ?? 'Unknown Form'
  const formId: string | null = streamForm.form_id ?? streamForm.form?.id ?? null
  const isRequired: boolean = streamForm.is_required ?? false
  const registryStats = getFormQuestionStats(formCode)
  const { data: dbStats } = useClientFieldStats(!registryStats ? formId : null)
  const stats = registryStats ?? (dbStats && dbStats.visibleCount > 0
    ? { sectionCount: 1, fieldCount: dbStats.visibleCount, sections: [] }
    : null)
  const questionsEnabled = questionCodes.includes(formCode)

  const handleToggleQuestions = () => {
    toggleMutation.mutate({
      matterTypeId,
      formCode,
      enabled: !questionsEnabled,
    })
  }

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-colors",
      selected ? "border-primary/40 bg-primary/5" : "bg-white"
    )}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          className="shrink-0"
        />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50">
          <FileText className="h-4 w-4 text-rose-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{formCode || 'Unknown Form'}</span>
            {isRequired && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                Required
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">{formName}</p>

          {/* Question status */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {stats ? (
              <>
                <button
                  type="button"
                  className="inline-flex"
                  onClick={() => setShowQuestions(!showQuestions)}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] gap-1 h-5 cursor-pointer hover:bg-blue-50 transition-colors',
                      questionsEnabled
                        ? 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:border-emerald-300'
                        : 'text-slate-400 border-slate-200 bg-slate-50 hover:border-slate-300'
                    )}
                  >
                    <ClipboardList className="h-2.5 w-2.5" />
                    {registryStats
                      ? `${stats.sectionCount} sections, ${stats.fieldCount} fields`
                      : `${stats.fieldCount} client fields configured`}
                    {showQuestions ? (
                      <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                    ) : (
                      <ChevronRight className="h-2.5 w-2.5 ml-0.5" />
                    )}
                  </Badge>
                </button>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={questionsEnabled}
                    onCheckedChange={handleToggleQuestions}
                    disabled={toggleMutation.isPending}
                    className="h-4 w-7 data-[state=checked]:bg-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    {questionsEnabled ? 'Questions on' : 'Questions off'}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-slate-400 italic">
                No questions defined
              </span>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 shrink-0"
          onClick={() =>
            onRemove({
              streamFormId: streamForm.id,
              formCode,
              formName,
              hasQuestions: !!stats && questionsEnabled,
            })
          }
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Question sections preview */}
      {showQuestions && stats && (
        <div className="border-t bg-slate-50/50 px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            Question Sections
          </p>
          {stats.sections.map((section) => (
            <div
              key={section.id}
              className="flex items-start gap-2 rounded-md bg-white border border-slate-100 px-2.5 py-1.5"
            >
              <ClipboardList className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">{section.title}</p>
                {section.description && (
                  <p className="text-[10px] text-slate-400 line-clamp-1">{section.description}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {section.fields.length} field{section.fields.length !== 1 ? 's' : ''}
                  {section.fields.length <= 6 && (
                    <span className="text-slate-300 ml-1">
                      — {section.fields.map(f => f.label).join(', ')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Remove Executor ──────────────────────────────────────────────────────────

function RemoveExecutor({
  target,
  mode,
  matterTypeId,
  onDone,
}: {
  target: RemoveTarget
  mode: 'both' | 'form-only'
  matterTypeId: string
  onDone: () => void
}) {
  const removeMutation = useRemoveFormWithQuestions()

  // Execute removal on mount
  useState(() => {
    removeMutation.mutate(
      {
        streamFormId: target.streamFormId,
        matterTypeId,
        formCode: target.formCode,
        removeQuestions: mode === 'both',
      },
      { onSettled: onDone }
    )
  })

  return null
}

// ── Bulk Remove Executor ─────────────────────────────────────────────────────

function BulkRemoveExecutor({
  streamForms,
  selectedIds,
  questionCodes,
  matterTypeId,
  onDone,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamForms: any[]
  selectedIds: Set<string>
  questionCodes: string[]
  matterTypeId: string
  onDone: () => void
}) {
  const removeMutation = useRemoveFormWithQuestions()

  useState(() => {
    const toRemove = streamForms.filter((sf) => selectedIds.has(sf.id))
    let completed = 0

    for (const sf of toRemove) {
      const formCode = sf.form?.form_code ?? ''
      removeMutation.mutate(
        {
          streamFormId: sf.id,
          matterTypeId,
          formCode,
          removeQuestions: true,
        },
        {
          onSettled: () => {
            completed++
            if (completed === toRemove.length) onDone()
          },
        }
      )
    }
  })

  return null
}

// ── Add Form Dialog ──────────────────────────────────────────────────────────

function AddFormDialog({
  open,
  onOpenChange,
  matterTypeId,
  tenantId,
  existingFormIds,
  streamFormCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterTypeId: string
  tenantId: string
  existingFormIds: string[]
  streamFormCount: number
}) {
  const [search, setSearch] = useState('')
  const { data: allForms, isLoading } = useIrccForms()
  const assignMutation = useAssignFormWithQuestions()

  const availableForms = useMemo(() => {
    if (!allForms) return []
    return allForms
      .filter((f: { id: string }) => !existingFormIds.includes(f.id))
      .filter((f: { form_code: string; form_name: string }) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          f.form_code?.toLowerCase().includes(q) ||
          f.form_name?.toLowerCase().includes(q)
        )
      })
  }, [allForms, existingFormIds, search])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAdd = (form: any) => {
    assignMutation.mutate(
      {
        tenantId,
        matterTypeId,
        formId: form.id,
        formCode: form.form_code,
        sortOrder: streamFormCount,
        isRequired: true,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add IRCC Form</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-600">
            Questions are automatically enabled when available for the selected form.
          </p>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : availableForms.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              {search ? 'No matching forms found' : 'All forms have been assigned'}
            </p>
          ) : (
            availableForms.map((form: { id: string; form_code: string; form_name: string }) => {
              const stats = getFormQuestionStats(form.form_code)
              return (
                <button
                  key={form.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  onClick={() => handleAdd(form)}
                  disabled={assignMutation.isPending}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50">
                    <FileText className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{form.form_code}</span>
                      {stats && (
                        <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 h-4">
                          <ClipboardList className="h-2 w-2" />
                          {stats.sectionCount} sections
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{form.form_name}</p>
                  </div>
                  <Plus className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
