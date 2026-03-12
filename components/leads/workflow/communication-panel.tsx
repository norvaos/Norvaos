'use client'

import { useState } from 'react'
import { MessageSquare, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunicationTimeline } from './communication-timeline'
import { CommunicationLogForm, type CommunicationFormData } from './communication-log-form'
import type { LeadCommunicationEventRow, UserRow } from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface CommunicationPanelProps {
  events: LeadCommunicationEventRow[] | undefined
  users: UserRow[] | undefined
  isLoading: boolean
  isReadOnly: boolean
  onLogEvent: (data: CommunicationFormData) => void
  isSubmitting?: boolean
}

export function CommunicationPanel({
  events,
  users,
  isLoading,
  isReadOnly,
  onLogEvent,
  isSubmitting = false,
}: CommunicationPanelProps) {
  const [showForm, setShowForm] = useState(false)

  function handleSubmit(data: CommunicationFormData) {
    onLogEvent(data)
    setShowForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Communication</h3>
          {events && (
            <span className="text-xs text-muted-foreground">({events.length})</span>
          )}
        </div>
        {!isReadOnly && (
          <Button
            variant={showForm ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-7 text-xs"
          >
            {showForm ? (
              <>
                <X className="mr-1 h-3 w-3" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3 w-3" />
                Log
              </>
            )}
          </Button>
        )}
      </div>

      {/* Log form (collapsible) */}
      {showForm && !isReadOnly && (
        <div className="border-b shrink-0">
          <CommunicationLogForm
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Timeline */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <CommunicationSkeleton />
        ) : (
          <CommunicationTimeline events={events ?? []} users={users} />
        )}
      </ScrollArea>
    </div>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function CommunicationSkeleton() {
  return (
    <div className="space-y-3 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
