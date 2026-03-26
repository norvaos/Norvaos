'use client'

/**
 * SendToClientDialog  -  unified 2-tab dialog for client communication.
 *
 * Tabs:
 *  1. Custom Email  -  compose and send a one-off email to the client
 *  2. Portal Link  -  manage / create / share the portal link
 *
 * Note: Document requests are handled by SendDocumentRequestDialog separately
 * (called directly from the CommandToolbar to avoid nested dialogs).
 */

import { useState, useCallback, useRef } from 'react'
import { Mail, Link2, Loader2, Copy, ExternalLink, RotateCcw, Plus } from 'lucide-react'

/** Fallback clipboard copy for HTTP contexts where navigator.clipboard is unavailable */
function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { usePortalLinks, useCreatePortalLink, useRevokePortalLink } from '@/lib/queries/portal-links'

// ── Hook: primary client contact for the matter ───────────────────────────────

function usePrimaryMatterContact(matterId: string) {
  return useQuery({
    queryKey: ['matter-primary-contact-full', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data: mcData } = await supabase
        .from('matter_contacts')
        .select('contact_id, is_primary')
        .eq('matter_id', matterId)
        .eq('is_primary', true)
        .maybeSingle()
      if (!mcData) return null
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('id', mcData.contact_id)
        .maybeSingle()
      if (!data) return null
      const c = data as { id: string; first_name: string | null; last_name: string | null; email_primary: string | null } | null
      if (!c) return null
      return {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' '),
        email: c.email_primary,
      }
    },
    enabled: !!matterId,
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SendToClientTab = 'email' | 'portal'

interface SendToClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId: string
  tenantId: string
  userId: string
  /** Controls which tab is shown initially */
  defaultTab?: SendToClientTab
}

// ── Custom Email Tab ──────────────────────────────────────────────────────────

function CustomEmailTab({
  matterId,
  contact,
  onSent,
}: {
  matterId: string
  contact: { id: string; name: string; email: string | null } | null | undefined
  onSent?: () => void
}) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = useCallback(async () => {
    if (!subject.trim() || !message.trim() || !contact?.id) return
    setSending(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/send-client-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          contactId: contact.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send email')
      }
      toast.success('Email sent to client')
      setSubject('')
      setMessage('')
      onSent?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }, [matterId, subject, message, contact?.id, onSent])

  if (!contact?.email) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <Mail className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">No client email on file</p>
        <p className="text-xs text-muted-foreground">
          Add an email address to the primary contact to send emails.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Recipient */}
      <div className="rounded-md border bg-slate-50 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">To</span>
        <p className="text-sm font-medium mt-0.5">
          {contact.name || contact.email}{' '}
          <span className="text-muted-foreground font-normal text-xs">&lt;{contact.email}&gt;</span>
        </p>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label className="text-xs">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Update on your file"
          className="text-sm"
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <Label className="text-xs">Message</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your message here…"
          className="text-sm min-h-[140px] resize-none"
        />
      </div>

      <Button
        className="w-full"
        onClick={handleSend}
        disabled={!subject.trim() || !message.trim() || sending}
      >
        {sending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Send Email
          </>
        )}
      </Button>
    </div>
  )
}

// ── Portal Link Tab ───────────────────────────────────────────────────────────

function PortalLinkTab({
  matterId,
  tenantId,
  userId,
}: {
  matterId: string
  tenantId: string
  userId: string
}) {
  const { data: portalLinks } = usePortalLinks(matterId)
  const createPortalLink = useCreatePortalLink()
  const revokePortalLink = useRevokePortalLink()
  const [expiryDays, setExpiryDays] = useState('30')

  const activePortalLink = portalLinks?.[0]
  const portalUrl = activePortalLink
    ? (typeof window !== 'undefined'
        ? `${window.location.origin}/portal/${activePortalLink.token}`
        : `/portal/${activePortalLink.token}`)
    : null

  const handleCreate = useCallback(() => {
    createPortalLink.mutate({
      tenantId,
      matterId,
      createdBy: userId,
      expiryDays: parseInt(expiryDays) || 30,
    })
  }, [tenantId, matterId, userId, expiryDays, createPortalLink])

  const handleCopy = useCallback(() => {
    if (!portalUrl) return
    // Try modern clipboard API first, fall back to legacy execCommand
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(portalUrl).then(
        () => toast.success('Portal link copied'),
        () => {
          // Fallback for HTTP or permission denied
          fallbackCopy(portalUrl)
          toast.success('Portal link copied')
        },
      )
    } else {
      fallbackCopy(portalUrl)
      toast.success('Portal link copied')
    }
  }, [portalUrl])

  return (
    <div className="space-y-4">
      {activePortalLink ? (
        <>
          <div className="rounded-lg border bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300">
                Active Portal Link
              </Badge>
              {activePortalLink.expires_at ? (
                <Badge
                  variant="outline"
                  className={
                    new Date(activePortalLink.expires_at) < new Date(Date.now() + 7 * 86400000)
                      ? 'text-amber-700 border-amber-300 bg-amber-50 text-xs'
                      : 'text-slate-600 border-slate-300 text-xs'
                  }
                >
                  {new Date(activePortalLink.expires_at) < new Date()
                    ? `Expired ${new Date(activePortalLink.expires_at).toLocaleDateString('en-CA')}`
                    : `Expires ${new Date(activePortalLink.expires_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-slate-500 border-slate-300">
                  No Expiry (Persistent)
                </Badge>
              )}
            </div>
            <code className="block text-xs text-slate-600 truncate bg-white rounded border px-2 py-1.5">
              {portalUrl}
            </code>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={handleCopy}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => window.open(portalUrl ?? '', '_blank')}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Preview Portal
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
            onClick={() => revokePortalLink.mutate({ id: activePortalLink.id, matterId })}
            disabled={revokePortalLink.isPending}
          >
            {revokePortalLink.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Revoke This Link
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
            <Link2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No active portal link</p>
            <p className="text-xs text-muted-foreground">
              Create a secure link to give your client access to upload documents, fill forms, and track their progress.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Link expires after</Label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={createPortalLink.isPending}
          >
            {createPortalLink.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Portal Link
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function SendToClientDialog({
  open,
  onOpenChange,
  matterId,
  tenantId,
  userId,
  defaultTab = 'email',
}: SendToClientDialogProps) {
  const [activeTab, setActiveTab] = useState<SendToClientTab>(defaultTab)
  const { data: contact } = usePrimaryMatterContact(matterId)

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) setActiveTab(defaultTab)
    onOpenChange(isOpen)
  }, [defaultTab, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send to Client</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SendToClientTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="email" className="flex-1 text-xs gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Custom Email
            </TabsTrigger>
            <TabsTrigger value="portal" className="flex-1 text-xs gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Portal Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-4">
            <CustomEmailTab
              matterId={matterId}
              contact={contact}
              onSent={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="portal" className="mt-4">
            <PortalLinkTab
              matterId={matterId}
              tenantId={tenantId}
              userId={userId}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
