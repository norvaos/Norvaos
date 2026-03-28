'use client'

/**
 * ReturnForCorrectionModal
 *
 * Dialog opened when a lawyer clicks "Return for Correction" on the Review tab.
 *
 * On Send:
 *   1. Sets lawyer_review_status = 'returned_for_correction'
 *   2. Creates one task per correction item (category = 'correction', due = +7 days)
 *   3. Inserts a 'lawyer_return_for_correction' activity entry
 */

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { readinessKeys } from '@/lib/queries/immigration-readiness'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Props ──────────────────────────────────────────────────────────────────

export interface ReturnForCorrectionModalProps {
  open: boolean
  onClose: () => void
  matterId: string
  tenantId: string
  readinessData: ImmigrationReadinessData | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sevenDaysFromNow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

// ── Component ──────────────────────────────────────────────────────────────

export function ReturnForCorrectionModal({
  open,
  onClose,
  matterId,
  tenantId,
  readinessData,
}: ReturnForCorrectionModalProps) {
  const qc = useQueryClient()
  const { appUser } = useUser()

  // Pre-populate with detected gate blockers
  const defaultItems = (): string[] => {
    if (!readinessData) return []
    const items: string[] = []
    const matrix = readinessData.readinessMatrix
    if (matrix) {
      for (const b of matrix.draftingBlockers.slice(0, 10)) {
        items.push(b.label + (b.person_name ? ` (${b.person_name})` : ''))
      }
    } else {
      for (const r of readinessData.blockedReasons.slice(0, 10)) {
        if (r.trim()) items.push(r.trim())
      }
    }
    return items.length > 0 ? items : ['']
  }

  const [correctionItems, setCorrectionItems] = useState<string[]>(defaultItems)
  const [newItem, setNewItem] = useState('')
  const [clientMessage, setClientMessage] = useState('')

  // Reset state when modal opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose()
      } else {
        setCorrectionItems(defaultItems())
        setNewItem('')
        setClientMessage('')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClose, readinessData],
  )

  const addItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    setCorrectionItems((prev) => [...prev, trimmed])
    setNewItem('')
  }

  const removeItem = (idx: number) => {
    setCorrectionItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const now = new Date().toISOString()
      const dueDate = sevenDaysFromNow()
      const currentUserId = appUser?.id ?? null

      const nonEmptyItems = correctionItems.filter((s) => s.trim())

      // 1. Update lawyer_review_status
      const { error: updateError } = await supabase
        .from('matter_intake')
        .update({
          lawyer_review_status: 'returned_for_correction',
          lawyer_review_notes: clientMessage || null,
          lawyer_review_by: currentUserId,
          lawyer_review_at: now,
        })
        .eq('matter_id', matterId)
      if (updateError) throw updateError

      // 2. Create one task per correction item
      if (nonEmptyItems.length > 0) {
        const taskInserts = nonEmptyItems.map((item) => ({
          tenant_id: tenantId,
          matter_id: matterId,
          title: item,
          category: 'correction',
          status: 'todo',
          created_by: currentUserId,
          due_date: dueDate,
          task_type: 'standard',
          visibility: 'internal',
        }))
        const { error: taskError } = await supabase.from('tasks').insert(taskInserts)
        if (taskError) throw taskError
      }

      // 3. Insert activity entry
      const { error: activityError } = await supabase.from('activities').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        user_id: currentUserId,
        activity_type: 'lawyer_return_for_correction',
        title: 'File returned for correction',
        description:
          clientMessage ||
          `${nonEmptyItems.length} item${nonEmptyItems.length !== 1 ? 's' : ''} require correction`,
        entity_type: 'matter',
        entity_id: matterId,
      })
      if (activityError) throw activityError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(matterId) })
      onClose()
    },
  })

  const nonEmptyItems = correctionItems.filter((s) => s.trim())
  const canSend = nonEmptyItems.length > 0 && !sendMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Return for Correction
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Correction checklist */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Correction items
              <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                {nonEmptyItems.length}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              Each item creates a task assigned to this matter (due in 7 days).
            </p>

            {/* Existing items */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {correctionItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 rounded border border-input bg-muted/30 px-2.5 py-1.5 text-xs text-foreground">
                    {item || <span className="text-muted-foreground italic">Empty item</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new item */}
            <div className="flex gap-2">
              <Input
                placeholder="Add correction item…"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addItem() }
                }}
                className="text-sm h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-8 px-2 gap-1"
                onClick={addItem}
                disabled={!newItem.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          {/* Client message */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Message to client (optional)</p>
            <Textarea
              placeholder="Additional context for the client…"
              value={clientMessage}
              onChange={(e) => setClientMessage(e.target.value)}
              className="min-h-[70px] resize-none text-sm"
            />
          </div>

          {sendMutation.isError && (
            <p className="text-xs text-destructive">
              Failed to send  -  please try again.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={sendMutation.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            disabled={!canSend}
            onClick={() => sendMutation.mutate()}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
