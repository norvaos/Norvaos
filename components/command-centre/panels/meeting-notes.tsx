'use client'

import { useCallback } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useCreateNote } from '@/lib/queries/notes'
import { NotesEditor } from '@/components/shared/notes-editor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  StickyNote,
  FileText,
  ChevronDown,
  Sparkles,
  Timer,
  Play,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'

// ─── Meeting note templates ─────────────────────────────────────────

interface NoteTemplate {
  id: string
  label: string
  icon: string
  generate: (contactName: string, date: string) => string
}

const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'consultation',
    label: 'Consultation Notes',
    icon: '\u{1F4CB}',
    generate: (name, date) =>
      `## Consultation — ${date}\n\n**Client:** ${name}\n**Attendees:** \n**Duration:** \n\n### Key Facts\n- \n\n### Client Goals\n- \n\n### Recommended Path\n- \n\n### Red Flags / Concerns\n- \n\n### Next Steps\n- [ ] \n`,
  },
  {
    id: 'follow_up',
    label: 'Follow-up Notes',
    icon: '\u{1F4DE}',
    generate: (name, date) =>
      `## Follow-up — ${date}\n\n**Client:** ${name}\n**Method:** Phone / Email / In-person\n\n### Discussion\n- \n\n### Updates / Changes\n- \n\n### Action Items\n- [ ] \n`,
  },
  {
    id: 'retainer_discussion',
    label: 'Retainer Discussion',
    icon: '\u{1F4DD}',
    generate: (name, date) =>
      `## Retainer Discussion — ${date}\n\n**Client:** ${name}\n\n### Scope of Work\n- \n\n### Fee Structure\n- **Type:** Flat Fee / Hourly / Retainer\n- **Amount:** $\n- **Payment Terms:** \n\n### Client Questions\n- \n\n### Agreed Terms\n- \n\n### Next Steps\n- [ ] Send retainer agreement\n- [ ] \n`,
  },
  {
    id: 'red_flags',
    label: 'Red Flags',
    icon: '\u{1F6A9}',
    generate: (name, date) =>
      `## Red Flags — ${date}\n\n**Client:** ${name}\n\n### Concern\n- \n\n### Evidence / Context\n- \n\n### Risk Level\n- \u2610 Low \u2610 Medium \u2610 High \u2610 Critical\n\n### Recommended Action\n- \n\n### Discussed With\n- \n`,
  },
]

// ─── Component ──────────────────────────────────────────────────────

export function MeetingNotes() {
  const { tenantId, entityId, contact, timerRunning, startMeetingTimer } = useCommandCentre()
  const createNote = useCreateNote()

  const contactName = contact
    ? contact.contact_type === 'organization'
      ? contact.organization_name ?? 'Client'
      : `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Client'
    : 'Client'

  const handleTemplateSelect = useCallback(
    async (template: NoteTemplate) => {
      const date = formatDate(new Date())

      try {
        await createNote.mutateAsync({
          tenant_id: tenantId,
          lead_id: entityId,
          content: template.generate(contactName, date),
          is_pinned: false,
        })
        toast.success(`${template.label} template created`)
      } catch {
        toast.error('Failed to create note')
      }
    },
    [tenantId, entityId, contactName, createNote]
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <StickyNote className="h-4 w-4" />
            Notes
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* Meeting Timer — Start button (stop is in the sticky bar) */}
            {!timerRunning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={startMeetingTimer}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <Timer className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Start meeting timer</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Template dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  Template
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {NOTE_TEMPLATES.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => handleTemplateSelect(t)}
                    className="gap-2"
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Summary stub */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-slate-400"
                    disabled
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Summary</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI summary coming soon</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <NotesEditor
          tenantId={tenantId}
          leadId={entityId}
        />
      </CardContent>
    </Card>
  )
}
