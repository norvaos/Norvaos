'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useRemoveStreamFormFromMatterType,
  useAddStreamFormToMatterType,
} from '@/lib/queries/ircc-forms'
import { useCheckMoveImpact } from '@/lib/queries/form-instances'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = any

export function MoveFormDialog({
  open,
  onOpenChange,
  form,
  currentMatterTypeId,
  currentMatterTypeName,
  streamFormId,
  matterTypesWithPA,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormData | null
  currentMatterTypeId: string
  currentMatterTypeName: string
  streamFormId: string
  matterTypesWithPA: Array<{ id: string; name: string; practice_areas?: { name: string; color?: string } | null }> | undefined
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const removeMutation = useRemoveStreamFormFromMatterType()
  const addMutation = useAddStreamFormToMatterType()
  const checkImpact = useCheckMoveImpact()
  const [searchQuery, setSearchQuery] = useState('')
  const [moving, setMoving] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ id: string; name: string } | null>(null)
  const [impactCount, setImpactCount] = useState<number | null>(null)

  // Reset confirmation state when dialog closes
  useEffect(() => {
    if (!open) {
      setPendingMove(null)
      setImpactCount(null)
    }
  }, [open])

  // All matter types except the current one
  const availableMatterTypes = useMemo(() => {
    if (!matterTypesWithPA) return []
    return matterTypesWithPA.filter((mt) => mt.id !== currentMatterTypeId)
  }, [matterTypesWithPA, currentMatterTypeId])

  const filteredMatterTypes = useMemo(() => {
    if (!searchQuery) return availableMatterTypes
    const lower = searchQuery.toLowerCase()
    return availableMatterTypes.filter(
      (mt) =>
        mt.name.toLowerCase().includes(lower) ||
        mt.practice_areas?.name?.toLowerCase().includes(lower),
    )
  }, [availableMatterTypes, searchQuery])

  const handleMoveClick = async (targetId: string, targetName: string) => {
    if (!form || !streamFormId || moving) return

    // Check impact  -  count active matters using this template
    try {
      const result = await checkImpact.mutateAsync({ templateId: streamFormId })
      if (result.activeMatterCount > 0) {
        // Show confirmation with impact warning
        setPendingMove({ id: targetId, name: targetName })
        setImpactCount(result.activeMatterCount)
        return
      }
    } catch {
      // If impact check fails, proceed without warning (fail-open for UX)
    }

    await executeMove(targetId)
  }

  const executeMove = async (newMatterTypeId: string) => {
    if (!form || !streamFormId || moving) return
    setMoving(true)
    try {
      // 1. Remove from current matter type
      await removeMutation.mutateAsync({ streamFormId, matterTypeId: currentMatterTypeId })
      // 2. Add to new matter type
      await addMutation.mutateAsync({ tenantId, matterTypeId: newMatterTypeId, formId: form.id })
      onOpenChange(false)
      setSearchQuery('')
      setPendingMove(null)
      setImpactCount(null)
    } catch {
      toast.error('Failed to move form. Please try again.')
    } finally {
      setMoving(false)
    }
  }

  if (!form) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearchQuery('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move Form</DialogTitle>
          <DialogDescription>
            Move <strong>{form.form_code}</strong> from <strong>{currentMatterTypeName}</strong> to a different matter type.
          </DialogDescription>
        </DialogHeader>

        {/* Impact warning confirmation */}
        {pendingMove && impactCount !== null && impactCount > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/30 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900">
                    Active Matters Affected
                  </p>
                  <p className="text-sm text-amber-400">
                    This form template is used by <strong>{impactCount}</strong> active matter{impactCount !== 1 ? 's' : ''}.
                    Existing matters are unaffected  -  only new matters created after this change will use the updated assignment.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPendingMove(null); setImpactCount(null) }}
                disabled={moving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => executeMove(pendingMove.id)}
                disabled={moving}
                className="gap-1.5"
              >
                {moving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                )}
                Move to {pendingMove.name}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {availableMatterTypes.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search matter types..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredMatterTypes.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  {availableMatterTypes.length === 0
                    ? 'No other matter types available.'
                    : 'No matter types match your search.'}
                </p>
              ) : (
                filteredMatterTypes.map((mt) => (
                  <button
                    key={mt.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                    onClick={() => handleMoveClick(mt.id, mt.name)}
                    disabled={moving || checkImpact.isPending}
                  >
                    <ArrowRightLeft className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{mt.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {mt.practice_areas?.color && (
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: mt.practice_areas.color }}
                          />
                        )}
                        <span className="text-xs text-slate-500">
                          {mt.practice_areas?.name ?? 'Unknown'}
                        </span>
                      </div>
                    </div>
                    {(moving || checkImpact.isPending) && <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
