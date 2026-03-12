'use client'

import { useState, useCallback } from 'react'
import { useCreateActivity } from '@/lib/queries/activities'
import type { Json } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Mail,
  MailOpen,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface LogEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string
  tenantId: string
  userId?: string
}

interface EmailMetadata {
  direction: 'sent' | 'received'
  subject: string
  notes: string
}

export function LogEmailDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  tenantId,
  userId,
}: LogEmailDialogProps) {
  const createActivity = useCreateActivity()

  const [direction, setDirection] = useState<'sent' | 'received'>('sent')
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setDirection('sent')
        setSubject('')
        setNotes('')
      }
      onOpenChange(isOpen)
    },
    [onOpenChange]
  )

  const handleSave = useCallback(async () => {
    if (!subject.trim()) {
      toast.error('Subject is required')
      return
    }

    setIsSaving(true)

    const dirLabel = direction === 'sent' ? 'Sent' : 'Received'
    const metadata: EmailMetadata = { direction, subject, notes }

    const title = `Email ${direction === 'sent' ? 'sent to' : 'received from'} ${contactName}`
    const descParts: string[] = [`Subject: ${subject}`]
    if (notes) descParts.push(notes)
    const description = descParts.join(' — ')

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: direction === 'sent' ? 'email_sent' : 'email_received',
        title,
        description,
        contact_id: contactId,
        entity_type: 'contact',
        entity_id: contactId,
        user_id: userId ?? null,
        metadata: metadata as unknown as Json,
      })

      toast.success(`Email ${dirLabel.toLowerCase()} logged`)
      onOpenChange(false)
    } catch {
      toast.error('Failed to log email')
    } finally {
      setIsSaving(false)
    }
  }, [direction, subject, notes, contactName, tenantId, contactId, userId, createActivity, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-600" />
            Log Email
          </DialogTitle>
          <DialogDescription>
            Log an email interaction with {contactName}.
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
                className={cn('flex-1 gap-1.5', direction === 'sent' && 'bg-purple-600 hover:bg-purple-700')}
                onClick={() => setDirection('sent')}
              >
                <Mail className="h-3.5 w-3.5" />
                Sent
              </Button>
              <Button
                type="button"
                variant={direction === 'received' ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1 gap-1.5', direction === 'received' && 'bg-purple-600 hover:bg-purple-700')}
                onClick={() => setDirection('received')}
              >
                <MailOpen className="h-3.5 w-3.5" />
                Received
              </Button>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Subject *</Label>
            <Input
              placeholder="Email subject line"
              className="h-9 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Notes</Label>
            <Textarea
              placeholder="Key points or follow-up items from the email"
              className="text-sm min-h-[80px] resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            disabled={isSaving || !subject.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Log Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
