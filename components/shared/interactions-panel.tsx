'use client'

import { useState, useCallback } from 'react'
import { INTERACTION_QUICK_ACTIONS } from './interactions/interaction-constants'
import type { DialogType } from './interactions/interaction-constants'
import { InteractionTimeline } from './interactions/interaction-timeline'
import { LogCallDialog } from './interactions/log-call-dialog'
import { LogEmailDialog } from './interactions/log-email-dialog'
import { LogMeetingDialog } from './interactions/log-meeting-dialog'
import { LogSmsDialog } from './interactions/log-sms-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'

// ─── Props ──────────────────────────────────────────────────────────

interface InteractionsPanelProps {
  contactId?: string
  matterId?: string
  contactName?: string
  tenantId: string
  userId?: string
}

// ─── Component ──────────────────────────────────────────────────────

export function InteractionsPanel({
  contactId,
  matterId,
  contactName = 'Client',
  tenantId,
  userId,
}: InteractionsPanelProps) {
  const [activeDialog, setActiveDialog] = useState<DialogType | null>(null)
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound')

  const openDialog = useCallback((dialog: DialogType, defaultDir?: string) => {
    if (dialog === 'call' && (defaultDir === 'inbound' || defaultDir === 'outbound')) {
      setCallDirection(defaultDir)
    }
    setActiveDialog(dialog)
  }, [])

  const closeDialog = useCallback(() => {
    setActiveDialog(null)
  }, [])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
              <MessageSquare className="h-4 w-4" />
              Interactions
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-1.5">
            {INTERACTION_QUICK_ACTIONS.map((action) => {
              const ActionIcon = action.icon
              return (
                <Button
                  key={action.key}
                  variant="outline"
                  size="sm"
                  className={`h-8 text-xs gap-1.5 ${action.color}`}
                  onClick={() => openDialog(action.dialog, action.defaultDirection)}
                >
                  <ActionIcon className="h-3.5 w-3.5" />
                  {action.label}
                </Button>
              )
            })}
          </div>

          {/* Grouped timeline */}
          <InteractionTimeline
            contactId={contactId}
            matterId={matterId}
            tenantId={tenantId}
          />
        </CardContent>
      </Card>

      {/* Dialogs  -  only render the active one */}
      {contactId && (
        <>
          <LogCallDialog
            open={activeDialog === 'call'}
            onOpenChange={(open) => !open && closeDialog()}
            contactId={contactId}
            contactName={contactName}
            tenantId={tenantId}
            userId={userId}
            defaultDirection={callDirection}
          />
          <LogEmailDialog
            open={activeDialog === 'email'}
            onOpenChange={(open) => !open && closeDialog()}
            contactId={contactId}
            contactName={contactName}
            tenantId={tenantId}
            userId={userId}
          />
          <LogMeetingDialog
            open={activeDialog === 'meeting'}
            onOpenChange={(open) => !open && closeDialog()}
            contactId={contactId}
            contactName={contactName}
            tenantId={tenantId}
            userId={userId}
          />
          <LogSmsDialog
            open={activeDialog === 'sms'}
            onOpenChange={(open) => !open && closeDialog()}
            contactId={contactId}
            contactName={contactName}
            tenantId={tenantId}
            userId={userId}
          />
        </>
      )}
    </>
  )
}
