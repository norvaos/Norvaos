'use client'

import { useState } from 'react'
import { Copy, Check, Send, Circle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useIntakePresence } from '@/lib/hooks/use-intake-presence'
import { usePortalLinks } from '@/lib/queries/portal-links'
import { useDocumentSlots } from '@/lib/queries/document-slots'
import { useMatterChecklistItems } from '@/lib/queries/immigration'
import { NudgeTemplateModal } from './NudgeTemplateModal'
import { toast } from 'sonner'
import { copyToClipboard } from '@/lib/utils/copy-to-clipboard'

interface PortalStatusCardProps {
  matterId: string
  tenantId: string
  matterTitle?: string
  matterNumber?: string
}

export function PortalStatusCard({ matterId, tenantId, matterTitle, matterNumber }: PortalStatusCardProps) {
  const [copied, setCopied] = useState(false)
  const [nudgeOpen, setNudgeOpen] = useState(false)

  // Real-time presence
  const { clientOnline, clientTyping, lastFieldEdited } = useIntakePresence(matterId)

  // Portal link
  const { data: portalLinks } = usePortalLinks(matterId)
  const activeLink = portalLinks?.[0] ?? null
  const portalUrl = activeLink
    ? (typeof window !== 'undefined'
        ? `${window.location.origin}/portal/${activeLink.token}`
        : `/portal/${activeLink.token}`)
    : null

  // Progress: document slots
  const { data: slots } = useDocumentSlots(matterId)
  const totalSlots = slots?.length ?? 0
  const acceptedSlots = slots?.filter((s) => s.status === 'accepted').length ?? 0

  // Progress: checklist items
  const { data: checklistItems } = useMatterChecklistItems(matterId)
  const activeItems = checklistItems?.filter((i) => i.status !== 'removed') ?? []
  const receivedItems = activeItems.filter(
    (i) => i.status === 'received' || i.status === 'accepted' || i.status === 'approved',
  )

  // Combined progress
  const totalRequirements = totalSlots + activeItems.length
  const completedRequirements = acceptedSlots + receivedItems.length
  const progressPct =
    totalRequirements > 0
      ? Math.round((completedRequirements / totalRequirements) * 100)
      : 0

  // Copy portal link — uses dedicated utility (no clipboard API)
  const handleCopyLink = () => {
    if (!activeLink || !portalUrl) {
      toast.error('No active portal link found')
      return
    }
    const ok = copyToClipboard(portalUrl)
    if (ok) {
      setCopied(true)
      toast.success('Portal link copied')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* Presence indicator */}
      <div className="flex items-center gap-1.5">
        <Circle
          className={`h-2.5 w-2.5 fill-current ${
            clientOnline
              ? 'text-emerald-500 animate-pulse'
              : 'text-muted-foreground/40'
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {clientOnline
            ? clientTyping
              ? 'Typing…'
              : 'Online'
            : 'Offline'}
        </span>
        {clientOnline && lastFieldEdited && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {lastFieldEdited}
          </Badge>
        )}
      </div>

      {/* Progress bar */}
      {totalRequirements > 0 && (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={progressPct} className="h-1.5 w-16" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {progressPct}%
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={handleCopyLink}
          disabled={!activeLink}
          title="Copy portal link"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          Copy Link
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => portalUrl && window.open(portalUrl, '_blank')}
          disabled={!activeLink}
          title="Preview portal as client"
        >
          <ExternalLink className="h-3 w-3" />
          Preview
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setNudgeOpen(true)}
          disabled={!activeLink}
          title="Send nudge email to client"
        >
          <Send className="h-3 w-3" />
          Nudge
        </Button>
      </div>

      {/* Nudge Template Modal */}
      <NudgeTemplateModal
        open={nudgeOpen}
        onOpenChange={setNudgeOpen}
        matterId={matterId}
        tenantId={tenantId}
        portalUrl={portalUrl}
        matterTitle={matterTitle}
        matterNumber={matterNumber}
      />
    </div>
  )
}
