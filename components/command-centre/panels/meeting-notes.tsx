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
    id: 'immigration_intake',
    label: 'Immigration Intake Assessment',
    icon: '🛂',
    generate: (name, date) =>
      `## Immigration Intake Assessment  -  ${date}\n\n**Client:** ${name}\n**Attending Lawyer:** \n**Duration:** \n\n---\n\n### 1. Personal Identity\n- **Full Legal Name:** \n- **Date of Birth:** \n- **Country of Birth:** \n- **Citizenship(s):** \n- **Passport Country / Expiry:** \n- **Languages Spoken:** \n\n---\n\n### 2. Current Location & Status\n- **Currently in Canada?** ☐ Yes (Inland) ☐ No (Outside Canada)\n- **Current Status in Canada:** ☐ Visitor ☐ Student ☐ Worker ☐ PGWP ☐ PR ☐ No Status ☐ Refugee Claimant ☐ Other: \n- **Date of Last Entry to Canada:** \n- **Authorized Stay Expiry (if applicable):** \n- **Port of Entry (last entry):** \n\n---\n\n### 3. Immigration History\n- **Previous Applications to Canada?** ☐ Yes ☐ No\n  - If yes, list: (type / year / result)\n  1. \n  2. \n  3. \n- **Previous Refusals?** ☐ Yes ☐ No\n  - If yes  -  application type, date refused, stated reason:\n  1. \n  2. \n- **Has client ever been removed / deported?** ☐ Yes ☐ No\n- **Has client ever left Canada under a removal order?** ☐ Yes ☐ No\n- **Any outstanding removal orders?** ☐ Yes ☐ No\n\n---\n\n### 4. Admissibility Review (IRPA s.34–42)\n- **Criminal Record (Canada or abroad)?** ☐ Yes ☐ No ☐ Unknown\n  - Offence(s), country, date, sentence:\n- **Section 8 / Misrepresentation finding (IRPA s.40)?** ☐ Yes ☐ No\n  - If yes  -  date of finding, expiry of 5-year ban: \n- **Health Inadmissibility concern?** ☐ Yes ☐ No\n- **Financial Inadmissibility concern?** ☐ Yes ☐ No\n- **Security / Organized Crime concern?** ☐ Yes ☐ No\n- **⚠ Notes on admissibility:** \n\n---\n\n### 5. Family Situation\n- **Marital Status:** ☐ Single ☐ Married ☐ Common-Law ☐ Separated ☐ Divorced ☐ Widowed\n  - If married/CL  -  how long together: ; how long cohabiting: \n- **Spouse / Partner citizenship & immigration status:** \n- **Dependent children (names, DOB, citizenship):**\n  1. \n  2. \n  3. \n- **Other dependants abroad?** \n- **Family members already in Canada?** \n\n---\n\n### 6. Education & Credentials\n- **Highest level of education:** \n- **Field of study:** \n- **Institution name & country:** \n- **Canadian ECA completed?** ☐ Yes ☐ No ☐ In Progress  -  Body: \n- **Language tests (IELTS / CELPIP / TEF)?** ☐ Yes ☐ No\n  - CLB / NCLC scores: R: ; W: ; L: ; S: ; Date: \n\n---\n\n### 7. Employment & Work History\n- **Current occupation / NOC code:** \n- **Employer in Canada (if any):** \n- **Job offer?** ☐ Yes ☐ No  -  LMIA? ☐ Yes ☐ No ☐ Exempt\n- **Canadian work experience (months):** \n- **Foreign work experience (years, NOC):** \n- **Provincial nomination?** ☐ Yes ☐ No  -  Province: \n\n---\n\n### 8. Financial Position\n- **Sufficient settlement funds?** ☐ Yes ☐ No ☐ Unknown\n- **Approximate liquid funds (CAD):** \n- **Property / significant ties in home country?** ☐ Yes ☐ No\n\n---\n\n### 9. Client Goals & Urgency\n- **What does the client want to achieve?**\n  - ☐ Maintain current status ☐ Restore status ☐ Get work permit ☐ Get study permit\n  - ☐ PR (Express Entry / PNP) ☐ Spousal/family sponsorship ☐ Appeal refusal\n  - ☐ Judicial Review ☐ Refugee protection ☐ Citizenship ☐ Other: \n- **Timeline / urgency:** \n- **Any upcoming deadlines?** \n\n---\n\n### 10. Lawyer's Assessment\n- **Recommended application / strategy:** \n- **Available streams / programs:** \n- **Estimated CRS score (if Express Entry):** \n- **Red flags / risk factors:** \n- **Opinion on success probability:** ☐ Strong ☐ Reasonable ☐ Borderline ☐ Not advisable\n- **Advice given:** \n\n---\n\n### 11. Next Steps\n- [ ] Confirm identity documents (passport, existing permits)\n- [ ] Request supporting documents: \n- [ ] Follow-up date: \n- [ ] Retainer / scope of work agreed? ☐ Yes ☐ Pending\n`,
  },
  {
    id: 'refusal_appeal',
    label: 'Refusal & Appeal Assessment',
    icon: '⚖️',
    generate: (name, date) =>
      `## Refusal & Appeal Assessment  -  ${date}\n\n**Client:** ${name}\n**Attending Lawyer:** \n\n---\n\n### 1. Refusal Details\n- **Application Type Refused:** \n- **Date of Refusal Letter:** \n- **IRCC / CBSA / IRB File No.:** \n- **Decision Maker (office / visa post):** \n- **Reason(s) Stated in Refusal Letter:**\n  1. \n  2. \n  3. \n\n---\n\n### 2. Deadline Calculation (CRITICAL)\n- **Client currently:** ☐ Inland (Inside Canada)  -  15-day JR deadline ☐ Outside Canada  -  60-day JR deadline\n- **Refusal date:** \n- **JR filing deadline (Federal Court):** \n- **IAD / RAD appeal deadline (if applicable):** \n- **⚠ Days remaining as of today:** \n\n---\n\n### 3. Procedural History\n- **Previous appeals / JR applications?** ☐ Yes ☐ No\n  - Outcomes: \n- **Was an H&C submitted?** ☐ Yes ☐ No ☐ N/A\n- **PRRA triggered?** ☐ Yes ☐ No ☐ N/A\n- **Stage reached:** ☐ IRCC ☐ IAD ☐ RAD ☐ Federal Court ☐ SCC ☐ PRRA ☐ H&C\n\n---\n\n### 4. Grounds for Challenge\n- **Breach of procedural fairness?** ☐ Yes ☐ No  -  Details: \n- **Reviewable error of law?** ☐ Yes ☐ No  -  Details: \n- **Unreasonable factual findings?** ☐ Yes ☐ No  -  Details: \n- **New evidence / changed circumstances?** ☐ Yes ☐ No\n  - If yes: \n- **Humanitarian & Compassionate grounds?** ☐ Yes ☐ No\n  - Establishment: ; Best interests of child: ; Other H&C: \n\n---\n\n### 5. Legal Options Available\n- [ ] Judicial Review  -  Federal Court (certiorari / mandamus)\n- [ ] IAD Appeal (if PR / family sponsorship / removal order)\n- [ ] RAD Appeal (if refugee claim)\n- [ ] Re-application with stronger package\n- [ ] H&C application (IRPA s.25)\n- [ ] PRRA (if removal imminent)\n- [ ] Ministerial Relief (s.34–35 inadmissibility)\n- [ ] Other: \n\n---\n\n### 6. Lawyer's Recommendation\n- **Recommended course of action:** \n- **Success probability:** ☐ Strong ☐ Reasonable ☐ Borderline ☐ Not advisable\n- **Reasons:** \n- **Estimated legal fees:** \n- **Client instructed:** ☐ Proceed with JR ☐ Proceed with Appeal ☐ Re-apply ☐ No action ☐ Reviewing\n\n---\n\n### 7. Urgent Action Items\n- [ ] File Notice of Application (JR) by: \n- [ ] Obtain certified tribunal record\n- [ ] Obtain refusal letter certified copy\n- [ ] Brief client on risks / options\n- [ ] Retainer signed for appeal / JR work\n`,
  },
  {
    id: 'consultation',
    label: 'General Consultation Notes',
    icon: '📋',
    generate: (name, date) =>
      `## Consultation  -  ${date}\n\n**Client:** ${name}\n**Attendees:** \n**Duration:** \n\n### Key Facts\n- \n\n### Client Goals\n- \n\n### Recommended Path\n- \n\n### Red Flags / Concerns\n- \n\n### Next Steps\n- [ ] \n`,
  },
  {
    id: 'follow_up',
    label: 'Follow-up Notes',
    icon: '📞',
    generate: (name, date) =>
      `## Follow-up  -  ${date}\n\n**Client:** ${name}\n**Method:** ☐ Phone ☐ Email ☐ In-person ☐ Video\n\n### Discussion\n- \n\n### Updates / Changes Since Last Contact\n- \n\n### Client's Outstanding Questions\n- \n\n### Action Items\n- [ ] \n`,
  },
  {
    id: 'retainer_discussion',
    label: 'Retainer Discussion',
    icon: '📝',
    generate: (name, date) =>
      `## Retainer Discussion  -  ${date}\n\n**Client:** ${name}\n\n### Scope of Work\n- **Application type(s):** \n- **Inclusions:** \n- **Exclusions / Out-of-scope:** \n\n### Fee Structure\n- **Type:** ☐ Flat Fee ☐ Hourly ☐ Retainer ☐ Hybrid\n- **Amount:** $\n- **Payment schedule:** \n- **Disbursements / Government fees:** $\n\n### Client Questions\n- \n\n### Agreed Terms\n- \n\n### Next Steps\n- [ ] Send retainer agreement\n- [ ] Collect retainer payment\n- [ ] Open matter file\n`,
  },
  {
    id: 'red_flags',
    label: 'Red Flags / Risk Note',
    icon: '🚩',
    generate: (name, date) =>
      `## Risk / Red Flag Note  -  ${date}\n\n**Client:** ${name}\n**Recorded by:** \n\n### Nature of Concern\n- ☐ Misrepresentation risk ☐ Criminality ☐ Fraud indicators ☐ Conflict of interest\n- ☐ Unreliable instructions ☐ Document authenticity ☐ Other: \n\n### Evidence / Context\n- \n\n### Risk Level\n- ☐ Low ☐ Moderate ☐ High ☐ Critical  -  Do not proceed\n\n### Recommended Action\n- \n\n### Discussed With (supervising lawyer / partner)\n- \n\n### Resolution / Status\n- \n`,
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
            {/* Meeting Timer  -  Start button (stop is in the sticky bar) */}
            {!timerRunning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-emerald-950/30"
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
