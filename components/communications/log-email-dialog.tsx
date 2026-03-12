'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useCreateEmailLog } from '@/lib/queries/email-logs'
import { ContactSearch } from '@/components/shared/contact-search'
import { cn } from '@/lib/utils'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Mail,
  Send,
  Inbox,
  Calendar as CalendarIcon,
  Plus,
  X,
  User,
  Briefcase,
  ChevronsUpDown,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ── Props ───────────────────────────────────────────────────────────────────

interface LogEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  userId: string
  defaultContactId?: string
  defaultMatterId?: string
}

// ── Matter Selector (inline) ────────────────────────────────────────────────

function MatterSelector({
  value,
  onChange,
  tenantId,
}: {
  value: string | null
  onChange: (id: string | null) => void
  tenantId: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: mattersData } = useQuery({
    queryKey: ['matters', 'select', tenantId, search],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (search) {
        q = q.or(`title.ilike.%${search}%,matter_number.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as { id: string; title: string; matter_number: string | null }[]
    },
    enabled: !!tenantId,
  })

  const matters = mattersData ?? []
  const selectedMatter = matters.find((m) => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {selectedMatter?.title ?? (value ? 'Loading...' : 'Select matter...')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search matters..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matters found.</CommandEmpty>
            {value && (
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <X className="mr-2 h-4 w-4 text-muted-foreground" />
                Clear selection
              </CommandItem>
            )}
            {matters.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === m.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{m.title}</p>
                  {m.matter_number && (
                    <p className="text-xs text-muted-foreground">{m.matter_number}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Main Dialog ─────────────────────────────────────────────────────────────

export function LogEmailDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  defaultContactId,
  defaultMatterId,
}: LogEmailDialogProps) {
  const createEmailLog = useCreateEmailLog()

  // Form state
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [toInput, setToInput] = useState('')
  const [toAddresses, setToAddresses] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const [ccAddresses, setCcAddresses] = useState<string[]>([])
  const [bccInput, setBccInput] = useState('')
  const [bccAddresses, setBccAddresses] = useState<string[]>([])
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [contactId, setContactId] = useState<string | null>(defaultContactId ?? null)
  const [matterId, setMatterId] = useState<string | null>(defaultMatterId ?? null)
  const [sentDate, setSentDate] = useState<Date>(new Date())
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Reset form when dialog opens
  const prevOpen = useRef(open)
  if (open && !prevOpen.current) {
    setDirection('outbound')
    setSubject('')
    setBody('')
    setFromAddress('')
    setToInput('')
    setToAddresses([])
    setCcInput('')
    setCcAddresses([])
    setBccInput('')
    setBccAddresses([])
    setShowCcBcc(false)
    setContactId(defaultContactId ?? null)
    setMatterId(defaultMatterId ?? null)
    setSentDate(new Date())
  }
  prevOpen.current = open

  // Email address helpers
  const addEmail = useCallback(
    (
      input: string,
      setInput: (v: string) => void,
      addresses: string[],
      setAddresses: (v: string[]) => void
    ) => {
      const trimmed = input.trim()
      if (!trimmed) return
      // Support comma-separated entry
      const emails = trimmed
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      if (emails.length > 0) {
        setAddresses([...addresses, ...emails.filter((e) => !addresses.includes(e))])
        setInput('')
      }
    },
    []
  )

  const removeEmail = useCallback(
    (email: string, addresses: string[], setAddresses: (v: string[]) => void) => {
      setAddresses(addresses.filter((e) => e !== email))
    },
    []
  )

  const isSubmitting = createEmailLog.isPending
  const canSubmit =
    subject.trim() &&
    fromAddress.trim() &&
    toAddresses.length > 0 &&
    !isSubmitting

  async function handleSubmit() {
    if (!canSubmit) return

    await createEmailLog.mutateAsync({
      tenant_id: tenantId,
      logged_by: userId,
      direction,
      subject: subject.trim(),
      body: body.trim() || null,
      from_address: fromAddress.trim(),
      to_addresses: toAddresses,
      cc_addresses: ccAddresses.length > 0 ? ccAddresses : null,
      bcc_addresses: bccAddresses.length > 0 ? bccAddresses : null,
      contact_id: contactId,
      matter_id: matterId,
      sent_at: sentDate.toISOString(),
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Log Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Direction toggle */}
          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                direction === 'outbound'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setDirection('outbound')}
            >
              <Send className="mr-1.5 inline-block h-4 w-4" />
              Sent
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                direction === 'inbound'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setDirection('inbound')}
            >
              <Inbox className="mr-1.5 inline-block h-4 w-4" />
              Received
            </button>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject *</Label>
            <Input
              id="email-subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* From */}
          <div className="space-y-1.5">
            <Label htmlFor="email-from">From *</Label>
            <Input
              id="email-from"
              type="email"
              placeholder="sender@example.com"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
            />
          </div>

          {/* To */}
          <div className="space-y-1.5">
            <Label>To *</Label>
            {toAddresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {toAddresses.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email, toAddresses, setToAddresses)}
                      className="rounded-full p-0.5 hover:bg-slate-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="recipient@example.com"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addEmail(toInput, setToInput, toAddresses, setToAddresses)
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addEmail(toInput, setToInput, toAddresses, setToAddresses)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Press Enter or comma to add</p>
          </div>

          {/* CC / BCC toggle */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowCcBcc(!showCcBcc)}
          >
            {showCcBcc ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {showCcBcc ? 'Hide' : 'Show'} CC / BCC
          </button>

          {showCcBcc && (
            <>
              {/* CC */}
              <div className="space-y-1.5">
                <Label>CC</Label>
                {ccAddresses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {ccAddresses.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email, ccAddresses, setCcAddresses)}
                          className="rounded-full p-0.5 hover:bg-slate-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="cc@example.com"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addEmail(ccInput, setCcInput, ccAddresses, setCcAddresses)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => addEmail(ccInput, setCcInput, ccAddresses, setCcAddresses)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* BCC */}
              <div className="space-y-1.5">
                <Label>BCC</Label>
                {bccAddresses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {bccAddresses.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email, bccAddresses, setBccAddresses)}
                          className="rounded-full p-0.5 hover:bg-slate-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="bcc@example.com"
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addEmail(bccInput, setBccInput, bccAddresses, setBccAddresses)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => addEmail(bccInput, setBccInput, bccAddresses, setBccAddresses)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Body</Label>
            <Textarea
              id="email-body"
              placeholder="Email body or summary..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(sentDate, 'dd-MMM-yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={sentDate}
                  onSelect={(date) => {
                    if (date) setSentDate(date)
                    setDatePickerOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Link to Contact */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Link to Contact
            </Label>
            <ContactSearch
              value={contactId ?? undefined}
              onChange={(id) => setContactId(id || null)}
              tenantId={tenantId}
              placeholder="Search contacts..."
            />
          </div>

          {/* Link to Matter */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Link to Matter
            </Label>
            <MatterSelector
              value={matterId}
              onChange={(id) => setMatterId(id)}
              tenantId={tenantId}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? 'Saving...' : 'Log Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
