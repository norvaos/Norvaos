'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FieldCondition } from '@/lib/types/intake-field'

interface ConditionField {
  id: string
  label: string
  options?: { label: string; value: string }[]
}

interface ConditionBuilderProps {
  condition: FieldCondition | undefined
  onChange: (condition: FieldCondition | undefined) => void
  availableFields: ConditionField[]
}

/**
 * Reusable condition builder for form fields and sections.
 * Shows a "Show conditionally" toggle, and when enabled,
 * provides field selector, operator, and value inputs.
 */
export function ConditionBuilder({
  condition,
  onChange,
  availableFields,
}: ConditionBuilderProps) {
  const [enabled, setEnabled] = useState(!!condition)
  const [fieldId, setFieldId] = useState(condition?.field_id ?? '')
  const [operator, setOperator] = useState<FieldCondition['operator']>(condition?.operator ?? 'equals')
  const [value, setValue] = useState(
    Array.isArray(condition?.value)
      ? condition.value.join(',')
      : (condition?.value ?? '')
  )

  // Sync state when condition prop changes externally
  useEffect(() => {
    setEnabled(!!condition)
    setFieldId(condition?.field_id ?? '')
    setOperator(condition?.operator ?? 'equals')
    setValue(
      Array.isArray(condition?.value)
        ? condition.value.join(',')
        : (condition?.value ?? '')
    )
  }, [condition])

  const selectedField = availableFields.find((f) => f.id === fieldId)

  function buildCondition(): FieldCondition | undefined {
    if (!enabled || !fieldId) return undefined
    if (operator === 'is_truthy' || operator === 'is_falsy') {
      return { field_id: fieldId, operator }
    }
    if (operator === 'in' || operator === 'not_in') {
      return {
        field_id: fieldId,
        operator,
        value: value.split(',').map((v) => v.trim()).filter(Boolean),
      }
    }
    return { field_id: fieldId, operator, value }
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    if (!checked) {
      onChange(undefined)
    }
  }

  function handleFieldChange(id: string) {
    setFieldId(id)
    // Emit immediately so parent stays in sync
    if (!enabled) return
    const cond = buildConditionWith(id, operator, value)
    onChange(cond)
  }

  function handleOperatorChange(op: FieldCondition['operator']) {
    setOperator(op)
    if (!enabled || !fieldId) return
    const cond = buildConditionWith(fieldId, op, value)
    onChange(cond)
  }

  function handleValueChange(val: string) {
    setValue(val)
    if (!enabled || !fieldId) return
    const cond = buildConditionWith(fieldId, operator, val)
    onChange(cond)
  }

  function buildConditionWith(
    fid: string,
    op: FieldCondition['operator'],
    val: string,
  ): FieldCondition | undefined {
    if (!fid) return undefined
    if (op === 'is_truthy' || op === 'is_falsy') {
      return { field_id: fid, operator: op }
    }
    if (op === 'in' || op === 'not_in') {
      return {
        field_id: fid,
        operator: op,
        value: val.split(',').map((v) => v.trim()).filter(Boolean),
      }
    }
    return { field_id: fid, operator: op, value: val }
  }

  if (availableFields.length === 0) return null

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Show conditionally</p>
          <p className="text-xs text-muted-foreground">Only show when a condition is met</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
          <div>
            <label className="text-xs font-medium text-slate-600">When field</label>
            <Select value={fieldId} onValueChange={handleFieldChange}>
              <SelectTrigger className="mt-1 w-full text-sm">
                <SelectValue placeholder="Select a field…" />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Operator</label>
            <Select value={operator} onValueChange={(v) => handleOperatorChange(v as FieldCondition['operator'])}>
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

          {operator !== 'is_truthy' && operator !== 'is_falsy' && (
            <div>
              <label className="text-xs font-medium text-slate-600">
                Value{(operator === 'in' || operator === 'not_in') ? ' (comma-separated)' : ''}
              </label>
              {selectedField?.options && selectedField.options.length > 0 ? (
                <Select value={value} onValueChange={handleValueChange}>
                  <SelectTrigger className="mt-1 w-full text-sm">
                    <SelectValue placeholder="Select value…" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedField.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="mt-1 text-sm"
                  placeholder={operator === 'in' || operator === 'not_in' ? 'value1, value2' : 'value'}
                  value={value}
                  onChange={(e) => handleValueChange(e.target.value)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
