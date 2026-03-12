'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTaskTableStore, type ConditionalColorRule } from '@/lib/stores/task-table-store'
import { TASK_STATUSES, PRIORITIES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ConditionalColorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RULE_COLUMNS = [
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'notes', label: 'Notes' },
  { value: 'owner', label: 'Owner' },
] as const

const BASE_CONDITIONS = [
  { value: 'is', label: 'Is' },
  { value: 'is_not', label: 'Is not' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
] as const

const DATE_CONDITIONS = [
  { value: 'is', label: 'Is' },
  { value: 'is_not', label: 'Is not' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'ends_before', label: 'Ends before' },
  { value: 'ends_after', label: 'Ends after' },
] as const

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function needsValue(condition: string): boolean {
  return !['is_empty', 'is_not_empty'].includes(condition)
}

function getConditionsForColumn(column: string) {
  return column === 'due_date' ? DATE_CONDITIONS : BASE_CONDITIONS
}

function getValueLabel(column: string, value: string): string {
  if (column === 'status') {
    return TASK_STATUSES.find((s) => s.value === value)?.label ?? value
  }
  if (column === 'priority') {
    return PRIORITIES.find((p) => p.value === value)?.label ?? value
  }
  return value
}

function getConditionLabel(condition: string): string {
  const all = [...BASE_CONDITIONS, ...DATE_CONDITIONS]
  return all.find((c) => c.value === condition)?.label ?? condition
}

function getColumnLabel(column: string): string {
  return RULE_COLUMNS.find((c) => c.value === column)?.label ?? column
}

// ---------------------------------------------------------------------------
// New rule form state
// ---------------------------------------------------------------------------
interface NewRuleForm {
  column: string
  condition: string
  value: string
  target: 'cell' | 'row'
  color: string
}

const DEFAULT_FORM: NewRuleForm = {
  column: 'status',
  condition: 'is',
  value: '',
  target: 'cell',
  color: PRESET_COLORS[0],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ConditionalColorDialog({
  open,
  onOpenChange,
}: ConditionalColorDialogProps) {
  const {
    conditionalColorRules,
    addConditionalColorRule,
    removeConditionalColorRule,
    toggleConditionalColorRule,
  } = useTaskTableStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<NewRuleForm>(DEFAULT_FORM)

  // ---- Handlers ----
  function handleAddRule() {
    const rule: ConditionalColorRule = {
      id: crypto.randomUUID(),
      column: form.column,
      condition: form.condition as ConditionalColorRule['condition'],
      value: needsValue(form.condition) ? form.value : '',
      target: form.target,
      color: form.color,
      enabled: true,
    }
    addConditionalColorRule(rule)
    setForm(DEFAULT_FORM)
    setShowAddForm(false)
  }

  function handleColumnChange(column: string) {
    const conditions = getConditionsForColumn(column)
    const currentConditionValid = conditions.some((c) => c.value === form.condition)
    setForm({
      ...form,
      column,
      condition: currentConditionValid ? form.condition : 'is',
      value: '',
    })
  }

  // ---- Value input renderer ----
  function renderValueInput() {
    if (!needsValue(form.condition)) return null

    if (form.column === 'status') {
      return (
        <Select
          value={form.value}
          onValueChange={(v) => setForm({ ...form, value: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    if (form.column === 'priority') {
      return (
        <Select
          value={form.value}
          onValueChange={(v) => setForm({ ...form, value: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // For due_date with ends_before / ends_after, show a date-style input
    if (form.column === 'due_date' && (form.condition === 'ends_before' || form.condition === 'ends_after')) {
      return (
        <Input
          type="date"
          className="h-8 text-xs"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
        />
      )
    }

    return (
      <Input
        className="h-8 text-xs"
        placeholder="Value..."
        value={form.value}
        onChange={(e) => setForm({ ...form, value: e.target.value })}
      />
    )
  }

  const conditions = getConditionsForColumn(form.column)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conditional Coloring</DialogTitle>
          <DialogDescription className="sr-only">Configure conditional coloring rules for this column</DialogDescription>
        </DialogHeader>

        {/* Existing rules list */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {conditionalColorRules.length === 0 && !showAddForm && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No color rules defined yet.
            </p>
          )}

          {conditionalColorRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              {/* Color swatch */}
              <span
                className="h-4 w-4 shrink-0 rounded-full border"
                style={{ backgroundColor: rule.color }}
              />

              {/* Rule description */}
              <span className="flex-1 truncate">
                {getColumnLabel(rule.column)}{' '}
                {getConditionLabel(rule.condition).toLowerCase()}
                {needsValue(rule.condition) && rule.value
                  ? ` "${getValueLabel(rule.column, rule.value)}"`
                  : ''}
                <span className="ml-1 text-muted-foreground">
                  ({rule.target === 'row' ? 'Entire row' : 'Cell only'})
                </span>
              </span>

              {/* Enable / disable toggle */}
              <Switch
                checked={rule.enabled}
                onCheckedChange={() => toggleConditionalColorRule(rule.id)}
                className="shrink-0"
              />

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => removeConditionalColorRule(rule.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add rule form */}
        {showAddForm && (
          <div className="space-y-3 rounded-md border p-3">
            {/* Column */}
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <Select
                value={form.column}
                onValueChange={handleColumnChange}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_COLUMNS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condition */}
            <div className="space-y-1">
              <Label className="text-xs">Condition</Label>
              <Select
                value={form.condition}
                onValueChange={(v) => setForm({ ...form, condition: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value */}
            {needsValue(form.condition) && (
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                {renderValueInput()}
              </div>
            )}

            {/* Target: Cell or Row */}
            <div className="space-y-1">
              <Label className="text-xs">Apply to</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.target === 'cell' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => setForm({ ...form, target: 'cell' })}
                >
                  Cell
                </Button>
                <Button
                  type="button"
                  variant={form.target === 'row' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => setForm({ ...form, target: 'row' })}
                >
                  Row
                </Button>
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                      form.color === color
                        ? 'border-foreground scale-110'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
            </div>

            {/* Form actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setShowAddForm(false)
                  setForm(DEFAULT_FORM)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddRule}
                disabled={needsValue(form.condition) && !form.value}
              >
                Save Rule
              </Button>
            </div>
          </div>
        )}

        {/* Add Rule button (shown when form is hidden) */}
        {!showAddForm && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
