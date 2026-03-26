'use client'

/**
 * EmailCompose  -  Compose/reply email form.
 *
 * Features sender selection, To/CC/BCC fields, subject (pre-filled for replies),
 * rich text body, and send button.
 */

import { useState, useCallback } from 'react'
import { Send, X, ChevronDown, Paperclip, Loader2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useEmailAccounts, useSendEmail, type EmailThread } from '@/lib/queries/email'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmailComposeProps {
  matterId: string
  matterNumber?: string | null
  /** Pre-fill subject and reply metadata */
  replyToThread?: EmailThread | null
  replyToMessageId?: string | null
  onSent?: () => void
  onCancel?: () => void
  compact?: boolean
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EmailCompose({
  matterId,
  matterNumber,
  replyToThread,
  replyToMessageId,
  onSent,
  onCancel,
  compact = false,
}: EmailComposeProps) {
  const { data: accounts } = useEmailAccounts()
  const sendEmail = useSendEmail()

  const defaultSubject = replyToThread
    ? `Re: ${replyToThread.subject ?? ''}`
    : matterNumber
      ? `[${matterNumber}] `
      : ''

  const defaultTo = replyToThread?.participant_emails?.slice(0, 1) ?? []

  const [accountId, setAccountId] = useState('')
  const [to, setTo] = useState(defaultTo.join(', '))
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [showCc, setShowCc] = useState(false)

  // Auto-select first account
  if (!accountId && accounts && accounts.length > 0) {
    setAccountId(accounts[0].id)
  }

  const parseAddresses = useCallback((raw: string): string[] => {
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }, [])

  const handleSend = useCallback(() => {
    const toAddresses = parseAddresses(to)
    if (toAddresses.length === 0) {
      toast.error('Please enter at least one recipient.')
      return
    }
    if (!accountId) {
      toast.error('Please select a sender account.')
      return
    }

    sendEmail.mutate(
      {
        accountId,
        to: toAddresses,
        subject,
        body,
        cc: parseAddresses(cc),
        bcc: parseAddresses(bcc),
        replyToMessageId: replyToMessageId ?? undefined,
        matterId,
      },
      {
        onSuccess: () => {
          setTo('')
          setCc('')
          setBcc('')
          setSubject(matterNumber ? `[${matterNumber}] ` : '')
          setBody('')
          onSent?.()
        },
      }
    )
  }, [accountId, to, subject, body, cc, bcc, replyToMessageId, matterId, matterNumber, sendEmail, parseAddresses, onSent])

  return (
    <div className="space-y-3">
      {/* Sender selection */}
      {accounts && accounts.length > 1 && (
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select sender..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acct) => (
                <SelectItem key={acct.id} value={acct.id}>
                  {acct.display_name ?? acct.email_address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* To field */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">To</Label>
          {!showCc && (
            <button
              className="text-[10px] text-primary hover:underline"
              onClick={() => setShowCc(true)}
            >
              CC/BCC
            </button>
          )}
        </div>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="h-8 text-sm"
        />
      </div>

      {/* CC/BCC fields */}
      {showCc && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">CC</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">BCC</Label>
            <Input
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="bcc@example.com"
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      {/* Subject */}
      <div>
        <Label className="text-xs text-muted-foreground">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="h-8 text-sm"
        />
      </div>

      {/* Body */}
      <div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          rows={compact ? 4 : 6}
          className="text-sm resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled
            title="Attach file (coming soon)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-xs">
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sendEmail.isPending || !to.trim()}
            className="h-8 text-xs"
          >
            {sendEmail.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
