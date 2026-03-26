'use client'

import { useState, useMemo } from 'react'
import { useSendDocumentRequest } from '@/lib/queries/document-requests'
import { useDocumentSlots, useCreateCustomSlot } from '@/lib/queries/document-slots'
import { PORTAL_LOCALES, type PortalLocale } from '@/lib/utils/portal-translations'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Mail, Globe, Plus } from 'lucide-react'

interface SendDocumentRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId: string
}

const STATUS_LABELS: Record<string, string> = {
  empty: 'Needed',
  needs_re_upload: 'Re-upload Needed',
  rejected: 'Rejected',
}

export function SendDocumentRequestDialog({
  open,
  onOpenChange,
  matterId,
}: SendDocumentRequestDialogProps) {
  const { data: slots, isLoading } = useDocumentSlots(matterId)
  const sendRequest = useSendDocumentRequest()
  const createCustomSlot = useCreateCustomSlot()

  // Outstanding = active, required, not accepted, not pending_review
  const outstandingSlots = useMemo(() => {
    if (!slots) return []
    return slots.filter(
      (s) => s.is_required && s.is_active && s.status !== 'accepted' && s.status !== 'pending_review'
    )
  }, [slots])

  // All active slots (for "include all" mode when nothing outstanding)
  const allActiveSlots = useMemo(() => {
    if (!slots) return []
    return slots.filter((s) => s.is_active)
  }, [slots])

  // Whether all required docs are already done
  const allAccepted = useMemo(() => {
    if (!slots) return false
    const required = slots.filter((s) => s.is_required && s.is_active)
    return required.length > 0 && required.every((s) => s.status === 'accepted' || s.status === 'pending_review')
  }, [slots])

  const [includeAccepted, setIncludeAccepted] = useState(false)

  // Effective list shown to user
  const effectiveSlots = useMemo(() => {
    if (includeAccepted) return allActiveSlots
    return outstandingSlots
  }, [includeAccepted, outstandingSlots, allActiveSlots])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [language, setLanguage] = useState<PortalLocale>('en')
  const [customName, setCustomName] = useState('')

  // Auto-select all outstanding when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedIds(new Set(outstandingSlots.map((s) => s.id)))
      setMessage('')
      setLanguage('en')
      setCustomName('')
      setIncludeAccepted(false)
    }
    onOpenChange(nextOpen)
  }

  const allSelected = effectiveSlots.length > 0 && selectedIds.size === effectiveSlots.length
  const noneSelected = selectedIds.size === 0

  const toggleSlot = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(effectiveSlots.map((s) => s.id)))
    }
  }

  const handleAddCustom = () => {
    const trimmed = customName.trim()
    if (!trimmed || createCustomSlot.isPending) return
    createCustomSlot.mutate(
      { matterId, slotName: trimmed },
      {
        onSuccess: (data) => {
          // Auto-select the newly created slot
          setSelectedIds((prev) => new Set([...prev, data.slot.id]))
          setCustomName('')
        },
      },
    )
  }

  const handleSend = () => {
    if (noneSelected) return
    sendRequest.mutate(
      {
        matterId,
        slotIds: Array.from(selectedIds),
        message: message.trim() || undefined,
        language,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Document Request</DialogTitle>
          <DialogDescription>
            Email the client a list of outstanding documents with a link to the upload portal.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Add custom document */}
            <div className="flex items-center gap-2">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustom()
                  }
                }}
                placeholder="Add custom document, e.g. Employment letter"
                className="h-8 text-sm"
                disabled={createCustomSlot.isPending}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={handleAddCustom}
                disabled={!customName.trim() || createCustomSlot.isPending}
              >
                {createCustomSlot.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-3.5 w-3.5" />
                )}
                Add
              </Button>
            </div>

            {effectiveSlots.length === 0 && !allAccepted && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No outstanding required documents. Add a custom document above.
              </div>
            )}

            {effectiveSlots.length === 0 && allAccepted && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 space-y-2">
                <p className="font-medium">All required documents have been accepted ✓</p>
                <p className="text-xs text-green-700">
                  You can still send a follow-up request for re-submission or additional documents.
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-green-700 underline underline-offset-2 hover:text-green-900"
                  onClick={() => {
                    setIncludeAccepted(true)
                    setSelectedIds(new Set(allActiveSlots.map((s) => s.id)))
                  }}
                >
                  Show all documents to re-request
                </button>
              </div>
            )}

            {effectiveSlots.length > 0 && (
              <>
                {/* Toggle  -  show accepted when visible */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                    <Label htmlFor="select-all" className="text-sm font-medium">
                      Select all ({effectiveSlots.length})
                    </Label>
                  </div>
                  {includeAccepted && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => {
                        setIncludeAccepted(false)
                        setSelectedIds(new Set(outstandingSlots.map((s) => s.id)))
                      }}
                    >
                      Show outstanding only
                    </button>
                  )}
                </div>

                {/* Slot list */}
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {effectiveSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`slot-${slot.id}`}
                        checked={selectedIds.has(slot.id)}
                        onCheckedChange={() => toggleSlot(slot.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`slot-${slot.id}`}
                          className="text-sm font-medium leading-tight cursor-pointer"
                        >
                          {slot.slot_name}
                        </Label>
                        {slot.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {slot.description}
                          </p>
                        )}
                      </div>
                      {!slot.slot_template_id && (
                        <Badge
                          variant="outline"
                          className="border-blue-300 text-blue-700 bg-blue-50"
                        >
                          Custom
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          slot.status === 'accepted'
                            ? 'border-green-300 text-green-700 bg-green-50'
                            : slot.status === 'needs_re_upload'
                              ? 'border-orange-300 text-orange-700 bg-orange-50'
                              : slot.status === 'rejected'
                                ? 'border-red-300 text-red-700 bg-red-50'
                                : 'border-amber-300 text-amber-700 bg-amber-50'
                        }
                      >
                        {slot.status === 'accepted' ? 'Accepted' : (STATUS_LABELS[slot.status] ?? 'Needed')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Language selector */}
            <div className="space-y-2">
              <Label htmlFor="request-language" className="text-sm flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Client Language
              </Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as PortalLocale)}>
                <SelectTrigger id="request-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_LOCALES.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.nativeLabel} ({loc.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The email and upload portal will be displayed in this language.
              </p>
            </div>

            {/* Optional message */}
            <div className="space-y-2">
              <Label htmlFor="request-message" className="text-sm">
                Message to client (optional)
              </Label>
              <Textarea
                id="request-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please upload the following documents at your earliest convenience..."
                rows={3}
                className="resize-none"
              />
            </div>

          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={noneSelected || sendRequest.isPending}
          >
            {sendRequest.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            Send Request
            {!noneSelected && ` (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
