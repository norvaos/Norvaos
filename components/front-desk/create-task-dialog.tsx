'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Create Task Dialog  -  Front Desk
 *
 * Searchable task title combobox with pre-filled immigration/family law
 * task templates. Supports "Add New" for custom titles.
 */

// ─── Pre-filled Task Templates ────────────────────────────────────────────────

const TASK_TEMPLATES = [
  // Document Collection
  'Prepare document checklist for client',
  'Follow up on missing documents',
  'Request employment verification letter',
  'Collect passport copies (all valid + expired)',
  'Obtain police clearance certificate',
  'Collect passport-style photographs',
  'Request birth certificate (client)',
  'Request marriage certificate',
  'Collect sponsor financial documents',
  'Obtain bank statements (12 months)',
  'Collect tax returns (NOA  -  last 3 years)',
  'Request pay stubs (last 3 months)',
  'Obtain immigration status documents',
  'Collect travel history documentation',
  'Request reference/support letters',
  'Obtain medical examination results',
  'Collect custody/divorce documents',
  'Get notarized copies prepared',
  'Arrange certified translations',
  // Applications & Filings
  'Draft cover letter for application',
  'Prepare application forms',
  'Review application for accuracy',
  'Submit application to IRCC',
  'Submit web form (IRCC)',
  'Book IRCC appointment',
  'Submit biometrics (client)',
  'Prepare GCMS notes request',
  'Submit ATIP/GCMS notes request',
  'Prepare statutory declaration',
  'Prepare affidavit of support',
  'Draft letter of explanation',
  'Respond to procedural fairness letter',
  // Scheduling & Follow-up
  'Schedule client consultation',
  'Send client status update',
  'Book language test (IELTS/CELPIP/TEF)',
  'Follow up on application status',
  'Follow up with IRCC on file',
  'Contact IRCC CPC-Ottawa',
  'Book medical exam (panel physician)',
  'Schedule biometrics appointment',
  // Legal & Compliance
  'Complete client intake form',
  'Verify identity documents at office',
  'Complete conflict-of-interest check',
  'Send retainer agreement to client',
  'Obtain signed retainer agreement',
  'Review IRCC correspondence',
  'Prepare hearing brief',
  'Prepare for RPD/RAD hearing',
  'File court documents',
  'Review decision / PRRA',
  // Billing & Admin
  'Send invoice to client',
  'Follow up on outstanding balance',
  'Prepare file closing summary',
  'Archive completed file',
  // Immigration Specific
  'Check Express Entry CRS score',
  'Submit Express Entry profile',
  'Prepare PR application (CEC/FSW/PNP)',
  'Apply for work permit extension',
  'Apply for study permit extension',
  'Prepare LMIA documentation',
  'Prepare PNP application',
  'Prepare spousal sponsorship application',
  'Prepare parent/grandparent sponsorship',
  'Prepare citizenship application',
  'Prepare TRV (visitor visa) application',
  'Prepare H&C application',
  'Prepare refugee claim',
  'Prepare Pre-Removal Risk Assessment (PRRA)',
  'Prepare judicial review application',
  // Family Law
  'Prepare separation agreement',
  'Draft parenting plan',
  'Prepare financial disclosure',
  'File petition for divorce',
  'Arrange child custody assessment',
  'Prepare property division agreement',
]

interface StaffOption {
  value: string
  label: string
}

interface MatterOption {
  value: string
  label: string
}

interface CreateTaskDialogProps {
  isOpen: boolean
  isSubmitting: boolean
  staffOptions: StaffOption[]
  matterOptions: MatterOption[]
  onClose: () => void
  onSubmit: (data: {
    title: string
    assignToUserId: string
    dueDate: string
    priority: string
    reason: string
    matterId?: string
  }) => void
}

export function CreateTaskDialog({
  isOpen,
  isSubmitting,
  staffOptions,
  matterOptions,
  onClose,
  onSubmit,
}: CreateTaskDialogProps) {
  const [titleSearch, setTitleSearch]     = useState('')
  const [titlePreset, setTitlePreset]     = useState('')
  const [customTitle, setCustomTitle]     = useState('')
  const [assignTo, setAssignTo]           = useState('')
  const [dueDate, setDueDate]             = useState('')
  const [priority, setPriority]           = useState('medium')
  const [matterId, setMatterId]           = useState('')
  const [reason, setReason]               = useState('')
  const [submitted, setSubmitted]         = useState(false)
  const [showAddNew, setShowAddNew]       = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const effectiveTitle = titlePreset === '__custom__' ? customTitle.trim() : titlePreset

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTitleSearch('')
      setTitlePreset('')
      setCustomTitle('')
      setAssignTo(staffOptions[0]?.value ?? '')
      setDueDate('')
      setPriority('medium')
      setMatterId('')
      setReason('')
      setSubmitted(false)
      setShowAddNew(false)
      // Focus search after mount
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [isOpen, staffOptions])

  const filteredTemplates = TASK_TEMPLATES.filter((t) =>
    t.toLowerCase().includes(titleSearch.toLowerCase())
  )

  const titleEmpty    = !effectiveTitle
  const assignEmpty   = !assignTo
  const dueDateEmpty  = !dueDate.trim()
  const reasonEmpty   = reason.trim().length < 10
  // Only show the matter dropdown when the contact has actual linked matters
  // (exclude the '__none' placeholder  -  it counts as zero real matters)
  const activeMatters = matterOptions.filter((m) => m.value !== '__none' && m.value !== '')

  function handleSubmit() {
    setSubmitted(true)
    if (titleEmpty || assignEmpty || dueDateEmpty || reasonEmpty) return

    onSubmit({
      title: effectiveTitle,
      assignToUserId: assignTo,
      dueDate,
      priority,
      reason: reason.trim(),
      matterId: matterId || undefined,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Task Title  -  searchable templates ── */}
          <div className="space-y-1.5">
            <Label>
              Task Title <span className="text-red-500">*</span>
            </Label>

            {/* Show selected title as badge */}
            {titlePreset && !titleSearch && !showAddNew && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-md">
                <span className="text-sm font-medium text-primary flex-1 line-clamp-2">
                  {titlePreset === '__custom__' ? customTitle : titlePreset}
                </span>
                <button
                  type="button"
                  onClick={() => { setTitlePreset(''); setCustomTitle(''); setShowAddNew(false) }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  disabled={isSubmitting}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Search input  -  shown when no preset selected or while searching */}
            {(!titlePreset || titleSearch || showAddNew) && (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchRef}
                    placeholder="Search task templates…"
                    value={titleSearch}
                    onChange={(e) => { setTitleSearch(e.target.value); setShowAddNew(false) }}
                    disabled={isSubmitting}
                    className="pl-8"
                  />
                </div>

                {/* Template list */}
                <div className="border rounded-md max-h-44 overflow-y-auto">
                  {filteredTemplates.length === 0 && !titleSearch && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                  )}
                  {filteredTemplates.map((template) => (
                    <button
                      key={template}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
                        titlePreset === template ? 'bg-primary/10 font-medium text-primary' : ''
                      }`}
                      onClick={() => {
                        setTitlePreset(template)
                        setTitleSearch('')
                        setShowAddNew(false)
                      }}
                      disabled={isSubmitting}
                    >
                      {template}
                    </button>
                  ))}
                  {/* Add New option  -  always at bottom */}
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-primary/5 border-t font-medium transition-colors"
                    onClick={() => {
                      setTitlePreset('__custom__')
                      setTitleSearch('')
                      setShowAddNew(true)
                    }}
                    disabled={isSubmitting}
                  >
                    + Add new task title
                    {titleSearch ? ` "${titleSearch}"` : ''}
                  </button>
                </div>
              </>
            )}

            {/* Custom title input */}
            {(titlePreset === '__custom__' || showAddNew) && (
              <Input
                placeholder="Enter custom task title…"
                value={customTitle || titleSearch}
                onChange={(e) => setCustomTitle(e.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            )}

            {submitted && titleEmpty && (
              <p className="text-xs text-red-600">Task title is required.</p>
            )}
          </div>

          {/* ── Assign To ── */}
          <div className="space-y-1.5">
            <Label>
              Assign To <span className="text-red-500">*</span>
            </Label>
            <Select value={assignTo} onValueChange={setAssignTo} disabled={isSubmitting}>
              <SelectTrigger className={submitted && assignEmpty ? 'border-red-400' : ''}>
                <SelectValue placeholder="Select staff member…" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {submitted && assignEmpty && (
              <p className="text-xs text-red-600">Please assign to a staff member.</p>
            )}
          </div>

          {/* ── Due Date ── */}
          <div className="space-y-1.5">
            <Label>
              Due Date <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSubmitting}
              className={submitted && dueDateEmpty ? 'border-red-400' : ''}
            />
            {submitted && dueDateEmpty && (
              <p className="text-xs text-red-600">Due date is required.</p>
            )}
          </div>

          {/* ── Priority ── */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Related Matter (optional) ── */}
          {activeMatters.length > 0 && (
            <div className="space-y-1.5">
              <Label>Related Matter <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select
                value={matterId || '__none'}
                onValueChange={(v) => setMatterId(v === '__none' ? '' : v)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a matter…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No related matter</SelectItem>
                  {activeMatters.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Reason / Description ── */}
          <div className="space-y-1.5">
            <Label>
              Reason / Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Why is this task needed? (min 10 characters)…"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className={submitted && reasonEmpty ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {submitted && reasonEmpty && (
              <p className="text-xs text-red-600">Reason must be at least 10 characters.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
            ) : (
              'Create Task'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
