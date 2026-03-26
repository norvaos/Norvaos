'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Notify Staff Dialog  -  Front Desk
 *
 * Quick message presets (client is here, running late, etc.)
 * plus a free-text custom message option.
 */

const MESSAGE_PRESETS = [
  {
    id: 'client_arrived',
    label: '👋 Client is here',
    text: 'Your client has arrived and is waiting at reception.',
  },
  {
    id: 'client_late',
    label: '⏱ Client is running late',
    text: 'Your client called to say they are running late.',
  },
  {
    id: 'client_no_show',
    label: '❌ Client no-show',
    text: 'Your client has not arrived for their appointment. Please advise.',
  },
  {
    id: 'client_rescheduling',
    label: '📅 Client wants to reschedule',
    text: 'Your client would like to reschedule their appointment. Please contact them.',
  },
  {
    id: 'docs_ready',
    label: '📄 Documents ready for pick-up',
    text: 'Documents are ready for client pick-up at the front desk.',
  },
  {
    id: 'call_waiting',
    label: '📞 Call waiting for you',
    text: 'There is a call waiting for you at reception. Please come to the front desk.',
  },
  {
    id: 'urgent',
    label: '🚨 Urgent  -  please come to front desk',
    text: 'Please come to the front desk immediately.',
  },
  {
    id: 'custom',
    label: '✏️ Custom message…',
    text: '',
  },
]

interface StaffOption {
  value: string
  label: string
}

interface NotifyStaffDialogProps {
  isOpen: boolean
  isSubmitting: boolean
  staffOptions: StaffOption[]
  onClose: () => void
  onSubmit: (data: { recipientUserId: string; message: string }) => void
}

export function NotifyStaffDialog({
  isOpen,
  isSubmitting,
  staffOptions,
  onClose,
  onSubmit,
}: NotifyStaffDialogProps) {
  const [recipientUserId, setRecipientUserId] = useState('')
  const [selectedPreset, setSelectedPreset]   = useState('')
  const [customMessage, setCustomMessage]     = useState('')
  const [submitted, setSubmitted]             = useState(false)

  const isCustom = selectedPreset === 'custom'

  const effectiveMessage = isCustom
    ? customMessage.trim()
    : MESSAGE_PRESETS.find((p) => p.id === selectedPreset)?.text ?? ''

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setRecipientUserId(staffOptions[0]?.value ?? '')
      setSelectedPreset('')
      setCustomMessage('')
      setSubmitted(false)
    }
  }, [isOpen, staffOptions])

  const recipientEmpty = !recipientUserId
  const messageEmpty   = !effectiveMessage

  function handleSubmit() {
    setSubmitted(true)
    if (recipientEmpty || messageEmpty) return
    onSubmit({ recipientUserId, message: effectiveMessage })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notify Staff</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Recipient */}
          <div className="space-y-1.5">
            <Label>
              Notify <span className="text-red-500">*</span>
            </Label>
            <Select value={recipientUserId} onValueChange={setRecipientUserId} disabled={isSubmitting}>
              <SelectTrigger className={submitted && recipientEmpty ? 'border-red-400' : ''}>
                <SelectValue placeholder="Select staff member…" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {submitted && recipientEmpty && (
              <p className="text-xs text-red-600">Please select a recipient.</p>
            )}
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <div className="grid grid-cols-2 gap-2">
              {MESSAGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(preset.id)
                    if (preset.id !== 'custom') setCustomMessage('')
                  }}
                  disabled={isSubmitting}
                  className={`text-left px-3 py-2 text-sm rounded-md border transition-colors ${
                    selectedPreset === preset.id
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview / Custom Message */}
          {selectedPreset && (
            <div className="space-y-1.5">
              <Label htmlFor="notify-message">
                {isCustom ? (
                  <>Message <span className="text-red-500">*</span></>
                ) : (
                  <span className="text-muted-foreground text-xs">Preview (editable)</span>
                )}
              </Label>
              <Textarea
                id="notify-message"
                rows={3}
                value={isCustom ? customMessage : effectiveMessage}
                onChange={(e) => {
                  if (isCustom) {
                    setCustomMessage(e.target.value)
                  } else {
                    // Allow editing the preset  -  switches to custom mode
                    setSelectedPreset('custom')
                    setCustomMessage(e.target.value)
                  }
                }}
                disabled={isSubmitting}
                placeholder={isCustom ? 'Enter your message (min 5 characters)…' : ''}
                className={submitted && messageEmpty ? 'border-red-400 focus-visible:ring-red-400' : ''}
                autoFocus={isCustom}
              />
              {submitted && messageEmpty && (
                <p className="text-xs text-red-600">Message is required.</p>
              )}
            </div>
          )}

          {submitted && !selectedPreset && (
            <p className="text-xs text-red-600">Please select a message.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
            ) : (
              'Send Notification'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
