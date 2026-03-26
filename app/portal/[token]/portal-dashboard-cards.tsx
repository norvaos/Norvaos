'use client'

/**
 * PortalDashboardCards  -  Responsive summary card grid.
 * Mounted between NextAction and collapsible sections.
 * Each card shows a key metric and is clickable to navigate to its section.
 */

import { getTranslations, t, type PortalLocale } from '@/lib/utils/portal-translations'
import type { PortalSectionCounts } from '@/lib/types/portal'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardCard {
  id: string
  sectionId: string
  label: string
  value: string
  sublabel?: string
  color: 'default' | 'green' | 'amber' | 'red' | 'blue'
  icon: React.ReactNode
  hidden?: boolean
}

interface PortalDashboardCardsProps {
  sections: PortalSectionCounts | null
  hasIRCC: boolean
  language: PortalLocale
  onCardClick: (sectionId: string) => void
}

// ── Color map ────────────────────────────────────────────────────────────────

const CARD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
}

// ── Icons ────────────────────────────────────────────────────────────────────

function DocIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function SharedDocIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  )
}

function PaymentIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalDashboardCards({
  sections,
  hasIRCC,
  language,
  onCardClick,
}: PortalDashboardCardsProps) {
  const tr = getTranslations(language)

  if (!sections) {
    // Skeleton state
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
        ))}
      </div>
    )
  }

  const cards = buildCards(sections, hasIRCC, tr, language)

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.filter((c) => !c.hidden).map((card) => {
        const colors = CARD_COLORS[card.color]
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardClick(card.sectionId)}
            className={cn(
              'rounded-xl border p-3 text-left transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
              colors.bg,
              colors.border,
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn('shrink-0', colors.text)}>{card.icon}</span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                {card.label}
              </span>
            </div>
            <p className={cn('text-lg font-bold leading-tight', colors.text)}>
              {card.value}
            </p>
            {card.sublabel && (
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{card.sublabel}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Card builder ─────────────────────────────────────────────────────────────

function buildCards(
  s: PortalSectionCounts,
  hasIRCC: boolean,
  tr: ReturnType<typeof getTranslations>,
  language: PortalLocale,
): DashboardCard[] {
  const d = s.documents
  const p = s.payment
  const tk = s.tasks
  const m = s.messages
  const c = s.calendar
  const sd = s.sharedDocuments

  // Documents
  const docColor: DashboardCard['color'] =
    d.reuploadNeeded > 0 ? 'red' : d.needed > 0 ? 'amber' : d.total > 0 && d.needed === 0 ? 'green' : 'default'
  const docValue = d.total > 0 ? `${d.uploaded}/${d.total}` : '0'

  // Shared Documents
  const sdColor: DashboardCard['color'] =
    sd.total === 0 ? 'default' : sd.unviewed > 0 ? 'blue' : 'green'
  const sdValue = sd.total > 0
    ? `${sd.viewed}/${sd.total}`
    : '0'

  // Questions
  const qColor: DashboardCard['color'] =
    s.questions.completed ? 'green' : s.questions.exists ? 'amber' : 'default'
  const qValue = s.questions.completed
    ? (tr.section_questions_completed ?? 'Done')
    : s.questions.exists
      ? `${s.questions.progress}%`
      : ' - '

  // Payment
  const outstanding = p.totalDue - p.totalPaid
  const pColor: DashboardCard['color'] =
    p.overdueCount > 0 ? 'red' : outstanding > 0 ? 'amber' : p.invoiceCount > 0 ? 'green' : 'default'
  const pValue = outstanding > 0
    ? `$${(outstanding / 100).toLocaleString()}`
    : p.invoiceCount > 0
      ? (tr.section_payment_paid ?? 'Paid')
      : ' - '

  // Tasks
  const tColor: DashboardCard['color'] =
    tk.overdue > 0 ? 'red' : tk.todo > 0 ? 'amber' : tk.completed > 0 ? 'green' : 'default'
  const tValue = tk.todo > 0
    ? String(tk.todo)
    : tk.total > 0
      ? (tr.section_tasks_completed ?? 'Done')
      : '0'

  // Messages
  const mColor: DashboardCard['color'] = m.unread > 0 ? 'blue' : 'default'
  const mValue = m.unread > 0 ? String(m.unread) : String(m.total)

  // Calendar
  const cColor: DashboardCard['color'] = c.upcomingCount > 0 ? 'blue' : 'default'
  const cValue = c.upcomingCount > 0 ? String(c.upcomingCount) : '0'
  const cSublabel = c.nextEvent
    ? `${tr.section_calendar_next ?? 'Next'}: ${new Date(c.nextEvent.date).toLocaleDateString(language, { month: 'short', day: 'numeric' })}`
    : undefined

  return [
    {
      id: 'card-documents',
      sectionId: 'section-documents',
      label: tr.tab_documents ?? 'Documents',
      value: docValue,
      sublabel: d.reuploadNeeded > 0
        ? t(tr.section_documents_reupload ?? '{count} need re-upload', { count: d.reuploadNeeded })
        : d.needed > 0
          ? t(tr.section_documents_needed ?? '{count} needed', { count: d.needed })
          : d.total > 0 && d.needed === 0
            ? (tr.section_documents_accepted ?? 'All uploaded')
            : undefined,
      color: docColor,
      icon: <DocIcon />,
    },
    {
      id: 'card-shared-documents',
      sectionId: 'section-shared-documents',
      label: tr.section_shared_documents ?? 'Shared Documents',
      value: sdValue,
      sublabel: sd.unviewed > 0
        ? `${sd.unviewed} ${tr.shared_docs_unviewed ?? 'unviewed'}`
        : sd.total > 0
          ? (tr.shared_docs_all_viewed ?? 'All viewed')
          : undefined,
      color: sdColor,
      icon: <SharedDocIcon />,
    },
    {
      id: 'card-questions',
      sectionId: 'section-questions',
      label: tr.tab_questions ?? 'Questions',
      value: qValue,
      color: qColor,
      icon: <QuestionIcon />,
      hidden: !hasIRCC,
    },
    {
      id: 'card-payment',
      sectionId: 'section-payment',
      label: tr.section_payment ?? 'Payment',
      value: pValue,
      sublabel: p.overdueCount > 0
        ? `${p.overdueCount} ${tr.payment_overdue_badge ?? 'overdue'}`
        : undefined,
      color: pColor,
      icon: <PaymentIcon />,
    },
    {
      id: 'card-tasks',
      sectionId: 'section-tasks',
      label: tr.tab_tasks ?? 'Tasks',
      value: tValue,
      sublabel: tk.overdue > 0
        ? `${tk.overdue} ${tr.section_tasks_overdue ?? 'overdue'}`
        : tk.todo > 0
          ? (tr.section_tasks_todo ?? 'to do')
          : undefined,
      color: tColor,
      icon: <TaskIcon />,
    },
    {
      id: 'card-messages',
      sectionId: 'section-messages',
      label: tr.tab_messages ?? 'Messages',
      value: mValue,
      sublabel: m.unread > 0
        ? `${m.unread} ${tr.messages_unread_count ?? 'unread'}`
        : m.latestDate
          ? `${tr.section_messages_latest ?? 'Latest'}: ${new Date(m.latestDate).toLocaleDateString(language, { month: 'short', day: 'numeric' })}`
          : undefined,
      color: mColor,
      icon: <MessageIcon />,
    },
    {
      id: 'card-calendar',
      sectionId: 'section-calendar',
      label: tr.tab_calendar ?? 'Calendar',
      value: cValue,
      sublabel: cSublabel,
      color: cColor,
      icon: <CalendarIcon />,
    },
  ]
}
