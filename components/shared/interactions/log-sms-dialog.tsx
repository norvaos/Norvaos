'use client'

import { useState, useCallback } from 'react'
import { useCreateActivity } from '@/lib/queries/activities'
import type { Json } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
  MessageSquare,
  Send,
  Inbox,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface LogSmsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string
  tenantId: string
  userId?: string
}

interface SmsMetadata {
  direction: 'sent' | 'received'
  message: string
}

export function LogSmsDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  tenantId,
  userId,
}: LogSmsDialogProps) {
  const createActivity = useCreateActivity()

  const [direction, setDirection] = useState<'sent' | 'received'>('sent')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setDirection('sent')
        setMessage('')
      }
      onOpenChange(isOpen)
    },
    [onOpenChange]
  )

  const handleSave = useCallback(async () => {
    if (!message.trim()) {
      toast.error('Message is required')
      return
    }

    setIsSaving(true)

    const dirLabel = direction === 'sent' ? 'Sent' : 'Received'
    const metadata: SmsMetadata = { direction, message }

    const title = `SMS ${direction === 'sent' ? 'sent to' : 'received from'} ${contactName}`
    const description = message.length > 120 ? `${message.slice(0, 120)}...` : message

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: direction === 'sent' ? 'sms_sent' : 'sms_received',
        title,
        description,
        contact_id: contactId,
        entity_type: 'contact',
        entity_id: contactId,
        user_id: userId ?? null,
        metadata: metadata as unknown as Json,
      })

      toast.success(`SMS ${dirLabel.toLowerCase()} logged`)
      onOpenChange(false)
    } catch {
      toast.error('Failed to log SMS')
    } finally {
      setIsSaving(false)
    }
  }, [direction, message, contactName, tenantId, contactId, userId, createActivity, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-amber-600" />
            Log SMS
          </DialogTitle>
          <DialogDescription>
            Log an SMS interaction with {contactName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Direction toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Direction</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === 'sent' ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1 gap-1.5', direction === 'sent' && 'bg-amber-600 hover:bg-amber-700')}
                onClick={() => setDirection('sent')}
              >
                <Send className="h-3.5 w-3.5" />
                Sent
              </Button>
              <Button
                type="button"
                variant={direction === 'received' ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1 gap-1.5', direction === 'received' && 'bg-amber-600 hover:bg-amber-700')}
                onClick={() => setDirection('received')}
              >
                <Inbox className="h-3.5 w-3.5" />
                Received
              </Button>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Message *</Label>
            <Textarea
              placeholder="SMS message content..."
              className="text-sm min-h-[100px] resize-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !message.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Log SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
