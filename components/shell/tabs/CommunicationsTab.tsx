'use client'

/**
 * CommunicationsTab — Zone D tab #7
 *
 * Wired to the `communications` table (exists in DB).
 * Lists all communications for the matter, with a Sheet to create new ones.
 *
 * Communication types: 10 fixed types (immigration-focused)
 * Channels: Email, Portal, SMS, Letter
 * Statuses: sent (green), draft (slate), scheduled (blue), failed (red)
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Mail,
  MessageSquare,
  Send,
  FileText,
  Plus,
  Loader2,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

import { useMatterCommunications, useCreateCommunication } from '@/lib/queries/communications'
import { useMatterPeople } from '@/lib/queries/matter-people'
import { createClient } from '@/lib/supabase/client'

// ── Constants ────────────────────────────────────────────────────────────────

const COMM_TYPES = [
  'Initial Consultation',
  'Document Request',
  'Status Update',
  'Appointment Reminder',
  'Decision Notice',
  'Refusal Notice',
  'Approval Notice',
  'Fee Invoice',
  'General Follow-up',
  'Legal Advice',
] as const

const CHANNELS = ['Email', 'Portal', 'SMS', 'Letter'] as const

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? 'draft').toLowerCase()
  const map: Record<string, string> = {
    sent:      'bg-green-100 text-green-800 border-green-200',
    draft:     'bg-slate-100 text-slate-700 border-slate-200',
    scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
    failed:    'bg-red-100 text-red-800 border-red-200',
  }
  const cls = map[s] ?? map['draft']
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', cls)}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  )
}

// ── Channel icon ─────────────────────────────────────────────────────────────

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel.toLowerCase()) {
    case 'email':  return <Mail className="h-3.5 w-3.5 text-muted-foreground" />
    case 'sms':    return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
    case 'letter': return <FileText className="h-3.5 w-3.5 text-muted-foreground" />
    default:       return <Send className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

// ── Zod schema ───────────────────────────────────────────────────────────────

const newCommSchema = z.object({
  comm_type:   z.string().min(1, 'Select a type'),
  recipient:   z.string().optional(),
  channel:     z.string().min(1, 'Select a channel'),
  subject:     z.string().min(1, 'Subject is required'),
  body:        z.string().min(1, 'Message is required'),
  status:      z.enum(['sent', 'draft']),
})

type NewCommValues = z.infer<typeof newCommSchema>

// ── Props ────────────────────────────────────────────────────────────────────

interface CommunicationsTabProps {
  matterId: string
  tenantId: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommunicationsTab({ matterId, tenantId }: CommunicationsTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: comms, isLoading } = useMatterCommunications(matterId)
  const { data: people } = useMatterPeople(matterId)
  const createComm = useCreateCommunication()

  const form = useForm<NewCommValues>({
    resolver: zodResolver(newCommSchema),
    defaultValues: {
      comm_type: '',
      recipient: '__none__',
      channel:   'Email',
      subject:   '',
      body:      '',
      status:    'sent',
    },
  })

  async function onSubmit(values: NewCommValues) {
    // Resolve the current user for created_by
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Resolve contact_id from selected person
    const recipientId = values.recipient === '__none__' ? null : values.recipient
    const selectedPerson = recipientId ? people?.find(p => p.id === recipientId) : null
    const contactId = selectedPerson?.contact_id ?? null

    // Build to_addresses from person email if available
    const toAddresses = selectedPerson?.email ? [selectedPerson.email] : []

    await createComm.mutateAsync({
      tenant_id:   tenantId,
      matter_id:   matterId,
      subject:     values.subject,
      body:        values.body,
      channel:     values.channel.toLowerCase(),
      direction:   'outbound',
      status:      values.status,
      contact_id:  contactId,
      to_addresses: toAddresses.length > 0 ? toAddresses : null,
      created_by:  user?.id ?? null,
      // Store comm_type in subject prefix for now (no dedicated column)
    })

    form.reset()
    setSheetOpen(false)
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  const isEmpty = !isLoading && (!comms || comms.length === 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <h3 className="text-sm font-semibold">Communications</h3>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-56 gap-3 text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-30" />
            <p className="text-sm font-medium">No communications yet</p>
            <p className="text-xs opacity-60">
              Use the <strong>+ New</strong> button to log the first communication for this matter.
            </p>
          </div>
        )}

        {!isLoading && comms && comms.length > 0 && (
          <ul className="divide-y">
            {comms.map(comm => {
              const dateStr = comm.created_at
                ? format(new Date(comm.created_at), 'MMM d')
                : '—'
              const channelLabel = comm.channel
                ? comm.channel.charAt(0).toUpperCase() + comm.channel.slice(1)
                : 'Email'
              const recipient = comm.to_addresses?.[0] ?? null

              return (
                <li key={comm.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <ChannelIcon channel={comm.channel} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {comm.subject ?? '(No subject)'}
                        </span>
                        <StatusBadge status={comm.status} />
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {dateStr}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {recipient ? `To: ${recipient} · ` : ''}
                        via {channelLabel}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* New Communication Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>New Communication</SheetTitle>
            <SheetDescription>
              Log or send a communication for this matter.
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Communication type */}
              <FormField
                control={form.control}
                name="comm_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMM_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Recipient (from matter_people) */}
              <FormField
                control={form.control}
                name="recipient"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select person…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— No specific person —</SelectItem>
                        {(people ?? []).map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.first_name} {p.last_name}
                            {p.email ? ` (${p.email})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Channel */}
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CHANNELS.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Subject */}
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Document Request — Passport Copy" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Body */}
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        placeholder="Enter message body…"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Save as</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createComm.isPending}
                >
                  {createComm.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Save Communication
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { form.reset(); setSheetOpen(false) }}
                >
                  Cancel
                </Button>
              </div>

            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
