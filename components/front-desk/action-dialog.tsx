'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

export interface ActionField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'datetime' | 'date' | 'time'
  placeholder?: string
  required?: boolean
  minLength?: number
  options?: { value: string; label: string }[]
}

interface ActionDialogProps {
  title: string
  fields: ActionField[]
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (data: Record<string, unknown>) => void
}

/**
 * Generic structured action dialog for Front Desk.
 *
 * Rule #12: Compliance required fields — validates minimum lengths,
 * required fields, etc. before submission.
 *
 * Each dialog maps fields → input → validates → calls onSubmit.
 */
export function ActionDialog({
  title,
  fields,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: ActionDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  function updateField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    for (const field of fields) {
      const val = values[field.name]

      if (field.required && (!val || (typeof val === 'string' && !val.trim()))) {
        newErrors[field.name] = `${field.label} is required`
        continue
      }

      if (field.minLength && typeof val === 'string' && val.trim().length > 0 && val.trim().length < field.minLength) {
        newErrors[field.name] = `${field.label} must be at least ${field.minLength} characters`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit() {
    if (!validate()) return

    // Clean up values — convert empty strings to undefined, numbers
    const cleaned: Record<string, unknown> = {}
    for (const field of fields) {
      const val = values[field.name]
      if (val === undefined || val === '') continue

      if (field.type === 'number') {
        cleaned[field.name] = val ? Number(val) : null
      } else {
        cleaned[field.name] = val
      }
    }

    onSubmit(cleaned)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Fill in the required fields and submit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>

              {field.type === 'text' && (
                <Input
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                />
              )}

              {field.type === 'textarea' && (
                <Textarea
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                />
              )}

              {field.type === 'number' && (
                <Input
                  type="number"
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                />
              )}

              {field.type === 'datetime' && (
                <Input
                  type="datetime-local"
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                />
              )}

              {field.type === 'date' && (
                <Input
                  type="date"
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                />
              )}

              {field.type === 'time' && (
                <Input
                  type="time"
                  value={(values[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                />
              )}

              {field.type === 'select' && field.options && (
                <Select
                  value={(values[field.name] as string) ?? ''}
                  onValueChange={(v) => updateField(field.name, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {errors[field.name] && (
                <p className="text-xs text-red-600">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
