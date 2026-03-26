'use client'

/**
 * NudgeTemplateModal  -  template-picker dialog for the PortalStatusCard "Nudge" action.
 *
 * Flow:
 *  1. Lists active communication_templates (category = 'immigration') for the tenant.
 *  2. On selection, resolves {{variables}} via parseTemplate and shows a live preview.
 *  3. On confirm, sends the resolved email via /api/matters/[id]/send-client-email
 *     and logs the send to communication_logs.
 */

import { useState, useMemo, useCallback } from 'react'
import { Send, Loader2, FileText, Eye, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useCommunicationTemplates, useLogCommunication } from '@/lib/queries/communication-templates'
import { parseTemplate, type TemplateContext } from '@/lib/utils/template-engine'
import type { Database } from '@/lib/types/database'

type TemplateRow = Database['public']['Tables']['communication_templates']['Row']

// ── Hook: primary client contact for the matter ─────────────────────────────

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
      return {
        id: data.id as string,
        name: [data.first_name, data.last_name].filter(Boolean).join(' '),
        email: data.email_primary as string | null,
      }
    },
    enabled: !!matterId,
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

interface NudgeTemplateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId: string
  tenantId: string
  portalUrl: string | null
  matterTitle?: string
  matterNumber?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function NudgeTemplateModal({
  open,
  onOpenChange,
  matterId,
  tenantId,
  portalUrl,
  matterTitle,
  matterNumber,
}: NudgeTemplateModalProps) {
  const { tenant } = useTenant()
  const { fullName: lawyerName, appUser } = useUser()
  const { data: contact } = usePrimaryMatterContact(matterId)
  const { data: templates, isLoading: templatesLoading } =
    useCommunicationTemplates(tenantId, 'immigration')
  const logComm = useLogCommunication()

  const [selected, setSelected] = useState<TemplateRow | null>(null)
  const [sending, setSending] = useState(false)

  // Build template context from live data
  const templateCtx = useMemo<TemplateContext>(
    () => ({
      client_name: contact?.name || 'Client',
      portal_link: portalUrl || '',
      lawyer_name: lawyerName || '',
      firm_name: tenant?.name || '',
      matter_number: matterNumber || '',
    }),
    [contact?.name, portalUrl, lawyerName, tenant?.name, matterNumber],
  )

  // Resolved preview
  const resolvedSubject = selected ? parseTemplate(selected.subject, templateCtx) : ''
  const resolvedBody = selected ? parseTemplate(selected.body, templateCtx) : ''

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) setSelected(null)
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  // Send the resolved email
  const handleSend = useCallback(async () => {
    if (!selected || !contact?.id || !contact.email) return
    setSending(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/send-client-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: resolvedSubject,
          message: resolvedBody,
          contactId: contact.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send email')
      }

      // Log the communication
      logComm.mutate({
        tenant_id: tenantId,
        matter_id: matterId,
        sender_id: appUser?.id ?? undefined,
        recipient_email: contact.email,
        template_slug: selected.slug,
        channel: 'email',
        rendered_subject: resolvedSubject,
        rendered_body: resolvedBody,
      })

      toast.success('Nudge sent to client')
      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send nudge')
    } finally {
      setSending(false)
    }
  }, [
    selected,
    contact,
    matterId,
    tenantId,
    appUser?.id,
    resolvedSubject,
    resolvedBody,
    logComm,
    handleOpenChange,
  ])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selected ? 'Preview & Send' : 'Choose a Template'}
          </DialogTitle>
        </DialogHeader>

        {/* No client email warning */}
        {!contact?.email && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No email address on file for the primary contact. Add one before
            sending.
          </div>
        )}

        {/* Template list */}
        {!selected ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !templates?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No templates available</p>
                <p className="text-xs text-muted-foreground">
                  Immigration templates will appear here once configured.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelected(tpl)}
                    className="w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="text-sm font-medium">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {tpl.subject}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          /* Preview */
          <div className="flex-1 space-y-3 overflow-y-auto">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 -ml-2 text-xs"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Templates
            </Button>

            {/* Recipient */}
            <div className="rounded-md border bg-slate-50 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                To
              </span>
              <p className="text-sm font-medium mt-0.5">
                {contact?.name || 'Client'}{' '}
                {contact?.email && (
                  <span className="text-muted-foreground font-normal text-xs">
                    &lt;{contact.email}&gt;
                  </span>
                )}
              </p>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Subject
              </span>
              <p className="text-sm font-medium">{resolvedSubject}</p>
            </div>

            {/* Body */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Body
              </span>
              <div
                className="prose prose-sm max-w-none rounded-md border bg-white p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: resolvedBody }}
              />
            </div>
          </div>
        )}

        {/* Footer: Send button (only on preview) */}
        {selected && (
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(null)}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || !contact?.email}
              className="gap-1.5"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send Nudge
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
