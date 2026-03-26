'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Outcome field configuration ────────────────────────────────────

interface OutcomeField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date'
  required: boolean
  placeholder?: string
  minLength?: number
  options?: { value: string; label: string }[]
}

export interface OutcomeConfig {
  type: string
  label: string
  description: string
  fields: OutcomeField[]
}

// ─── Props ──────────────────────────────────────────────────────────

interface MeetingOutcomeDialogProps {
  config: OutcomeConfig
  matterId: string
  leadId?: string | null
  contactId?: string | null
  isOpen: boolean
  onClose: () => void
}

/**
 * Structured dialog for recording meeting outcomes.
 *
 * Rule #15: Command Centre outcomes drive everything.
 * Rule #12: Compliance required fields  -  enforced in each dialog.
 * Rule #1: All state changes go through the Action Executor.
 */
export function MeetingOutcomeDialog({
  config,
  matterId,
  leadId,
  contactId,
  isOpen,
  onClose,
}: MeetingOutcomeDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/actions/record_meeting_outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            matterId,
            leadId: leadId ?? undefined,
            contactId: contactId ?? undefined,
            outcomeType: config.type,
            outcomeData: data,
            notes: (data.notes as string) || (data.summary as string) || undefined,
          },
          source: 'command_centre',
          idempotencyKey: `record_meeting_outcome:${matterId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to record outcome')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success(`${config.label} recorded successfully`)
      // Invalidate matter and activity queries
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['meeting-outcomes'] })
      handleClose()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function handleClose() {
    setFormData({})
    setErrors({})
    onClose()
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    for (const field of config.fields) {
      const val = formData[field.name]

      if (field.required && (!val || (typeof val === 'string' && !val.trim()))) {
        newErrors[field.name] = `${field.label} is required`
      }

      if (field.minLength && typeof val === 'string' && val.length < field.minLength) {
        newErrors[field.name] = `${field.label} must be at least ${field.minLength} characters`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    mutation.mutate(formData)
  }

  function updateField(name: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.label}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {config.fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>

              {field.type === 'text' && (
                <Input
                  value={(formData[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className="text-sm"
                />
              )}

              {field.type === 'textarea' && (
                <Textarea
                  value={(formData[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="text-sm"
                />
              )}

              {field.type === 'number' && (
                <Input
                  type="number"
                  value={(formData[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value ? Number(e.target.value) : '')}
                  placeholder={field.placeholder}
                  className="text-sm"
                />
              )}

              {field.type === 'date' && (
                <Input
                  type="date"
                  value={(formData[field.name] as string) ?? ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  className="text-sm"
                />
              )}

              {field.type === 'select' && field.options && (
                <Select
                  value={(formData[field.name] as string) ?? ''}
                  onValueChange={(val) => updateField(field.name, val)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select..." />
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
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          ))}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
