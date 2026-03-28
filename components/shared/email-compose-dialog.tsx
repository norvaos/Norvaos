'use client'

import { useState, useEffect } from 'react'
import { useSendEmail, type GraphEmail } from '@/lib/queries/email-stream'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Send, Loader2 } from 'lucide-react'

// ─── Props ───────────────────────────────────────────────────────────────────

interface EmailComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  replyTo?: GraphEmail
  contactEmail?: string
  contactName?: string
  matterId?: string
  contactId?: string
  leadId?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmailComposeDialog({
  open,
  onOpenChange,
  replyTo,
  contactEmail,
  contactName,
  matterId,
  contactId,
  leadId,
}: EmailComposeDialogProps) {
  const sendEmail = useSendEmail()

  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // Reset / pre-fill fields when dialog opens or replyTo changes
  useEffect(() => {
    if (!open) return

    if (replyTo) {
      // Reply mode: address goes to the original sender
      setTo(replyTo.from.emailAddress.address)
      setCc('')
      setSubject(
        replyTo.subject.startsWith('Re:')
          ? replyTo.subject
          : `Re: ${replyTo.subject}`
      )
      setBody('')
    } else {
      // Compose mode
      setTo(contactEmail ?? '')
      setCc('')
      setSubject('')
      setBody('')
    }
  }, [open, replyTo, contactEmail])

  const handleSend = () => {
    if (!to.trim() || !subject.trim()) return

    sendEmail.mutate(
      {
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        matterId,
        contactId,
        leadId,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  const isReply = !!replyTo
  const dialogTitle = isReply
    ? `Reply to: ${replyTo.subject || '(No subject)'}`
    : 'New Email'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* To field */}
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {/* CC field */}
          <div className="space-y-1.5">
            <Label htmlFor="email-cc">Cc (optional)</Label>
            <Input
              id="email-cc"
              type="email"
              placeholder="cc@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>

          {/* Subject field */}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body field */}
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              placeholder="Write your message here..."
              className="min-h-[200px] resize-y"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Quoted original email for replies */}
          {isReply && replyTo.bodyPreview && (
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Original message from{' '}
                {replyTo.from.emailAddress.name ||
                  replyTo.from.emailAddress.address}
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {replyTo.bodyPreview}
              </p>
            </div>
          )}

          {/* Send button */}
          <div className="flex justify-end pt-2">
            <Button
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSend}
              disabled={
                sendEmail.isPending || !to.trim() || !subject.trim()
              }
            >
              {sendEmail.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sendEmail.isPending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
