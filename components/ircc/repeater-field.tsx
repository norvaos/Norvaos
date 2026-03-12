'use client'

import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IRCCFieldMapping } from '@/lib/types/ircc-profile'

// ── Props ─────────────────────────────────────────────────────────────────────

interface RepeaterFieldProps {
  /** Display label for the repeater section */
  label: string
  /** Optional description shown below the label */
  description?: string
  /** Sub-field definitions for each item in the array */
  fields: IRCCFieldMapping[]
  /** Current array of items */
  value: Record<string, unknown>[]
  /** Callback when the array changes */
  onChange: (items: Record<string, unknown>[]) => void
  /** Whether at least one item is required */
  isRequired?: boolean
  /** Whether all fields are read-only */
  readOnly?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RepeaterField({
  label,
  description,
  fields,
  value,
  onChange,
  isRequired = false,
  readOnly = false,
}: RepeaterFieldProps) {
  const items = Array.isArray(value) ? value : []

  const handleAddItem = useCallback(() => {
    const emptyItem: Record<string, unknown> = {}
    for (const field of fields) {
      // Use the last segment of the profile_path as the key within each item
      const key = getFieldKey(field.profile_path)
      emptyItem[key] = field.field_type === 'boolean' ? false : ''
    }
    onChange([...items, emptyItem])
  }, [fields, items, onChange])

  const handleRemoveItem = useCallback(
    (index: number) => {
      const updated = items.filter((_, i) => i !== index)
      onChange(updated)
    },
    [items, onChange],
  )

  const handleFieldChange = useCallback(
    (index: number, fieldKey: string, fieldValue: unknown) => {
      const updated = items.map((item, i) => {
        if (i !== index) return item
        return { ...item, [fieldKey]: fieldValue }
      })
      onChange(updated)
    },
    [items, onChange],
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium">
            {label}
            {isRequired && <span className="text-destructive ml-1">*</span>}
          </Label>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          )}
        </div>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-6 text-centre">
          <p className="text-muted-foreground text-sm">No items added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="bg-muted/30 border-border relative rounded-lg border p-4"
            >
              {/* Remove button */}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive absolute top-2 right-2"
                  onClick={() => handleRemoveItem(index)}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}

              {/* Sub-fields grid */}
              <div className="grid grid-cols-1 gap-3 pr-6 md:grid-cols-2">
                {fields.map((field) => {
                  const fieldKey = getFieldKey(field.profile_path)
                  const fieldValue = item[fieldKey]

                  return (
                    <div key={field.profile_path} className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        {field.label}
                        {field.is_required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </Label>
                      {renderSubField(field, fieldValue, readOnly, (val) =>
                        handleFieldChange(index, fieldKey, val),
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          className="w-full"
        >
          <Plus className="size-4" />
          Add {label.replace(/s$/, '').toLowerCase()}
        </Button>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the last segment of a dot-notation profile path to use as
 * the field key within a repeater item.
 * e.g. "family.children.given_name" -> "given_name"
 */
function getFieldKey(profilePath: string): string {
  const parts = profilePath.split('.')
  return parts[parts.length - 1]
}

/**
 * Render the appropriate input control for a sub-field within a repeater item.
 */
function renderSubField(
  field: IRCCFieldMapping,
  value: unknown,
  readOnly: boolean,
  onChange: (value: unknown) => void,
): React.ReactNode {
  const stringValue = value != null ? String(value) : ''

  switch (field.field_type) {
    case 'text':
    case 'phone':
      return (
        <Input
          type={field.field_type === 'phone' ? 'tel' : 'text'}
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'email':
      return (
        <Input
          type="email"
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          onChange={(e) => {
            const num = e.target.value === '' ? '' : Number(e.target.value)
            onChange(num)
          }}
        />
      )

    case 'date':
      return (
        <DatePicker
          value={stringValue}
          onChange={(val) => onChange(val)}
          placeholder="Select a date"
          disabled={readOnly}
        />
      )

    case 'textarea':
      return (
        <Textarea
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'select':
    case 'country':
      return (
        <Select
          value={stringValue || undefined}
          onValueChange={(val) => onChange(val)}
          disabled={readOnly}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    default:
      return (
        <Input
          type="text"
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
