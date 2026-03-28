'use client'

/**
 * UnmatchedEmailTriage  -  Triage panel for emails that could not be
 * auto-associated to a matter. Shows pending queue entries, fetches
 * AI-ranked association suggestions, and lets the user resolve or dismiss.
 */

import { useState, useCallback } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useUnmatchedEmails,
  useAssociationSuggestions,
  useResolveUnmatchedEmail,
  useAssociateThread,
  type UnmatchedEmailEntry,
  type AssociationSuggestion,
} from '@/lib/queries/email'
import { useMatters } from '@/lib/queries/matters'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Mail,
  AlertTriangle,
  Check,
  ChevronsUpDown,
  X,
  Loader2,
  Link2,
  Trash2,
  Users,
  Search,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────

interface TriageDetailProps {
  entry: UnmatchedEmailEntry
  onClose: () => void
}

// ── Main Triage Panel ────────────────────────────────────────────────────────

export function UnmatchedEmailTriage() {
  const { data: entries, isLoading } = useUnmatchedEmails()
  const [selectedEntry, setSelectedEntry] = useState<UnmatchedEmailEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const pendingEntries = (entries ?? []).filter((e) => e.status === 'pending')

  const handleSelect = useCallback((entry: UnmatchedEmailEntry) => {
    setSelectedEntry(entry)
    setDetailOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setDetailOpen(false)
    setSelectedEntry(null)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (pendingEntries.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-slate-900">
          No unmatched emails
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          All incoming emails have been associated to matters automatically.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium text-slate-900">
              Unmatched Emails
            </h3>
            <Badge variant="secondary" className="text-xs">
              {pendingEntries.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            These emails could not be auto-associated to a matter
          </p>
        </div>

        {/* Queue List */}
        <ScrollArea className="max-h-[480px]">
          <div className="divide-y">
            {pendingEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleSelect(entry)}
                className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {entry.thread?.subject ?? 'No subject'}
                      </p>
                    </div>

                    {entry.thread?.participant_emails && entry.thread.participant_emails.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.thread.participant_emails.slice(0, 3).join(', ')}
                          {entry.thread.participant_emails.length > 3 && (
                            <span> +{entry.thread.participant_emails.length - 3} more</span>
                          )}
                        </p>
                      </div>
                    )}

                    {entry.reason && (
                      <p className="mt-1 text-xs text-amber-600">
                        {entry.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                    {entry.thread?.message_count && entry.thread.message_count > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        {entry.thread.message_count} msgs
                      </Badge>
                    )}
                    {entry.suggested_matter_ids.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.suggested_matter_ids.length} suggestion{entry.suggested_matter_ids.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Dialog */}
      {selectedEntry && (
        <Dialog open={detailOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent className="max-w-lg flex flex-col max-h-[90vh] p-0 gap-0">
            <TriageDetail entry={selectedEntry} onClose={handleClose} />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ── Triage Detail Dialog ─────────────────────────────────────────────────────

function TriageDetail({ entry, onClose }: TriageDetailProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: suggestions, isLoading: suggestionsLoading } =
    useAssociationSuggestions(entry.thread_id)

  const resolveUnmatched = useResolveUnmatchedEmail()
  const associateThread = useAssociateThread()

  const [manualSearchOpen, setManualSearchOpen] = useState(false)
  const [matterSearch, setMatterSearch] = useState('')

  const { data: matterResults } = useMatters({
    tenantId,
    search: matterSearch,
    pageSize: 10,
    status: 'active',
  })

  const isProcessing = resolveUnmatched.isPending || associateThread.isPending

  const handleAssociate = useCallback(
    async (matterId: string) => {
      // Associate via the unmatched queue (which calls manualAssociate internally)
      resolveUnmatched.mutate(
        { id: entry.id, action: 'resolve', matter_id: matterId },
        { onSuccess: () => onClose() }
      )
    },
    [entry.id, resolveUnmatched, onClose]
  )

  const handleDismiss = useCallback(() => {
    resolveUnmatched.mutate(
      { id: entry.id, action: 'dismiss' },
      { onSuccess: () => onClose() }
    )
  }, [entry.id, resolveUnmatched, onClose])

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Triage Email
        </DialogTitle>
        <DialogDescription>
          Associate this email to a matter or dismiss it.
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
        {/* Thread Info */}
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Subject
            </p>
            <p className="text-sm font-medium text-slate-900">
              {entry.thread?.subject ?? 'No subject'}
            </p>
          </div>

          {entry.thread?.participant_emails && entry.thread.participant_emails.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Participants
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.thread.participant_emails.map((email) => (
                  <Badge key={email} variant="outline" className="text-xs font-normal">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {entry.reason && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reason Unmatched
              </p>
              <p className="text-sm text-amber-600">{entry.reason}</p>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {entry.thread?.message_count ?? 0} message{(entry.thread?.message_count ?? 0) !== 1 ? 's' : ''}
            </span>
            <span>
              Received {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        <Separator />

        {/* Suggestions */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Suggested Matters
          </p>

          {suggestionsLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading suggestions...</span>
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.matterId}
                  suggestion={suggestion}
                  onSelect={handleAssociate}
                  disabled={isProcessing}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No automatic suggestions available. Use the search below to find a matter.
            </p>
          )}
        </div>

        <Separator />

        {/* Manual Search */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Search for a Matter
          </p>

          <Popover open={manualSearchOpen} onOpenChange={setManualSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={manualSearchOpen}
                className="w-full justify-between"
                disabled={isProcessing}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Search className="h-3.5 w-3.5" />
                  Search by title or matter number...
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search matters..."
                  value={matterSearch}
                  onValueChange={setMatterSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {matterSearch.length < 2
                      ? 'Type at least 2 characters...'
                      : 'No matters found.'}
                  </CommandEmpty>
                  {matterResults?.matters && matterResults.matters.length > 0 && (
                    <CommandGroup heading="Active Matters">
                      {matterResults.matters.map((matter) => (
                        <CommandItem
                          key={matter.id}
                          value={matter.id}
                          onSelect={() => {
                            setManualSearchOpen(false)
                            handleAssociate(matter.id)
                          }}
                        >
                          <Link2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{matter.title}</p>
                            {matter.matter_number && (
                              <p className="text-xs text-muted-foreground">
                                {matter.matter_number}
                              </p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          disabled={isProcessing}
          className="text-muted-foreground hover:text-destructive"
        >
          {resolveUnmatched.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-3.5 w-3.5" />
          )}
          Dismiss
        </Button>

        <Button variant="outline" size="sm" onClick={onClose} disabled={isProcessing}>
          Cancel
        </Button>
      </div>
    </>
  )
}

// ── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onSelect,
  disabled,
}: {
  suggestion: AssociationSuggestion
  onSelect: (matterId: string) => void
  disabled: boolean
}) {
  const confidenceColour =
    suggestion.confidence >= 0.9
      ? 'bg-emerald-950/40 text-emerald-400'
      : suggestion.confidence >= 0.7
        ? 'bg-amber-950/40 text-amber-400'
        : 'bg-slate-100 text-slate-600'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">
            {suggestion.matterTitle}
          </p>
          <Badge className={cn('text-[10px] shrink-0', confidenceColour)}>
            {Math.round(suggestion.confidence * 100)}%
          </Badge>
        </div>
        {suggestion.matterNumber && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {suggestion.matterNumber}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {suggestion.reason}
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => onSelect(suggestion.matterId)}
        disabled={disabled}
        className="shrink-0"
      >
        <Link2 className="mr-1.5 h-3 w-3" />
        Associate
      </Button>
    </div>
  )
}
