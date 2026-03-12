'use client'

import { useState, useMemo, useCallback } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  FileText,
  Send,
  Link2,
  Copy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils/formatters'

// ─── Slot status config ─────────────────────────────────────────────

const SLOT_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  empty: { label: 'Missing', color: 'text-red-600', icon: <AlertTriangle className="h-3 w-3" /> },
  pending_review: { label: 'Pending Review', color: 'text-amber-600', icon: <Clock className="h-3 w-3" /> },
  accepted: { label: 'Accepted', color: 'text-green-600', icon: <CheckCircle2 className="h-3 w-3" /> },
  needs_re_upload: { label: 'Re-upload Needed', color: 'text-red-600', icon: <AlertTriangle className="h-3 w-3" /> },
  rejected: { label: 'Rejected', color: 'text-red-600', icon: <AlertTriangle className="h-3 w-3" /> },
}

// ─── Component ──────────────────────────────────────────────────────

export function StatusRequests() {
  const { entityType, entityId, tenantId, lead, contact } = useCommandCentre()

  const matterId = entityType === 'matter' ? entityId : (lead?.converted_matter_id ?? null)

  const [sendingReminder, setSendingReminder] = useState<string | null>(null)

  // Fetch outstanding document slots
  const { data: slots } = useQuery({
    queryKey: ['document-slots-status', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slots')
        .select('id, slot_name, status, is_required, is_active')
        .eq('matter_id', matterId!)
        .eq('is_active', true)
        .order('slot_name')
      if (error) throw error
      return data
    },
    enabled: !!matterId,
  })

  // Fetch portal link
  const { data: portalLink } = useQuery({
    queryKey: ['portal-link', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('portal_links')
        .select('id, token, is_active, expires_at, created_at')
        .eq('matter_id', matterId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!matterId,
  })

  // Outstanding required slots (not accepted)
  const outstandingSlots = useMemo(() => {
    if (!slots) return []
    return slots.filter((s) => s.is_required && s.status !== 'accepted')
  }, [slots])

  const acceptedCount = useMemo(() => {
    if (!slots) return 0
    return slots.filter((s) => s.is_required && s.status === 'accepted').length
  }, [slots])

  const totalRequired = useMemo(() => {
    if (!slots) return 0
    return slots.filter((s) => s.is_required).length
  }, [slots])

  // Portal link URL
  const portalUrl = portalLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${portalLink.token}`
    : null

  const isPortalExpired = portalLink
    ? new Date(portalLink.expires_at) < new Date()
    : false

  // Send reminder for a slot
  const handleSendReminder = useCallback(
    async (slotId: string) => {
      if (!matterId) return
      setSendingReminder(slotId)
      try {
        const res = await fetch(`/api/matters/${matterId}/document-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotIds: [slotId],
            message: 'Reminder: Please upload the outstanding document.',
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to send reminder')
        }

        toast.success('Reminder sent')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to send reminder')
      } finally {
        setSendingReminder(null)
      }
    },
    [matterId]
  )

  // Copy portal link
  const handleCopyLink = useCallback(() => {
    if (portalUrl) {
      navigator.clipboard.writeText(portalUrl)
      toast.success('Portal link copied')
    }
  }, [portalUrl])

  // Don't show for leads without a converted matter
  if (!matterId) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4" />
            Document Status
            {totalRequired > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {acceptedCount}/{totalRequired}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Portal link */}
        {portalLink && (
          <div className="flex items-center justify-between p-2 rounded-md border bg-slate-50/50">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700">Client Portal</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {isPortalExpired ? 'Expired' : `Expires ${formatDate(portalLink.expires_at)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                variant="secondary"
                className={`text-[10px] ${isPortalExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
              >
                {isPortalExpired ? 'Expired' : 'Active'}
              </Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleCopyLink}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy portal link</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {portalUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        asChild
                      >
                        <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open portal</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}

        {/* Outstanding slots */}
        {outstandingSlots.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-600">Outstanding Documents</p>
            {outstandingSlots.map((slot) => {
              const statusConfig = SLOT_STATUS[slot.status] ?? SLOT_STATUS.empty
              return (
                <div
                  key={slot.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={statusConfig.color}>{statusConfig.icon}</span>
                    <span className="text-xs text-slate-700 truncate">{slot.slot_name}</span>
                    <Badge variant="secondary" className={`text-[10px] ${statusConfig.color}`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => handleSendReminder(slot.id)}
                    disabled={sendingReminder === slot.id}
                  >
                    {sendingReminder === slot.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Remind
                  </Button>
                </div>
              )
            })}
          </div>
        ) : totalRequired > 0 ? (
          <div className="text-center py-3">
            <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-xs text-slate-500">All documents received</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-3">
            No document slots configured
          </p>
        )}
      </CardContent>
    </Card>
  )
}
