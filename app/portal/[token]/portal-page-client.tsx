'use client'

/**
 * PortalPageClient  -  Client dashboard workspace.
 *
 * Layout (top to bottom):
 *   Header (logo + language)
 *   MatterSummary (concrete counts primary, progress bar secondary)
 *   Timeline (vertical stage progression  -  if data exists)
 *   LegalTeam (lawyer + support staff with role guidance)
 *   Instructions (two-level: matter-type defaults / per-link overrides)
 *   NextAction (8-level priority waterfall)
 *   DashboardCards (summary card grid  -  7 cards)
 *   ─── Collapsible sections ───
 *   Documents (expanded by default)
 *   SharedDocuments (firm-to-client shared docs with view tracking)
 *   Questions (expanded if IRCC, hidden otherwise)
 *   Payment (auto-expand if overdue  -  always visible)
 *   Tasks (collapsed by default  -  always visible)
 *   Messages (collapsed by default)
 *   Calendar (collapsed by default  -  always visible)
 *   ─── Footer ───
 *   Support contact + Powered by NorvaOS
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { initPortalAnalytics, destroyPortalAnalytics, track } from '@/lib/utils/portal-analytics'

// Guided workspace components
import { PortalMatterSummary } from './portal-matter-summary'
import { PortalLegalTeam } from './portal-legal-team'
import { PortalInstructions } from './portal-instructions'
import { PortalNextActionPanel } from './portal-next-action'
import { PortalPaymentSection } from './portal-payment-section'
import { PortalCollapsibleSection, type SectionMetric } from './portal-collapsible-section'
import { PortalDashboardCards } from './portal-dashboard-cards'
import { PortalTimeline } from './portal-timeline'
import { PortalSharedDocuments } from './portal-shared-documents'
import { ClientProgressTracker } from './client-progress-tracker'
import { PortalReadinessRing } from './portal-readiness-ring'
import { PortalSovereignChat } from './portal-sovereign-chat'
import { PortalTeamMicroCards } from './portal-team-micro-cards'
import { PortalMessageTeam } from './portal-message-team'

// Content components
import { PortalDocuments, type PortalSlot } from './portal-documents'
import { PortalChecklist } from './portal-checklist'
import { PortalIRCCForms } from './portal-ircc-forms'
import { PortalMessages } from './portal-messages'
import { PortalTasks } from './portal-tasks'
import { PortalCalendar } from './portal-calendar'
import { PortalBooking } from './portal-booking'
import { PortalClientUpload } from './portal-client-upload'

import {
  getTranslations,
  isRtl,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { UniversalGlobeSelector } from '@/components/i18n/UniversalGlobeSelector'
import type { PortalSummaryResponse, PortalSectionCounts } from '@/lib/types/portal'

// ── Types ────────────────────────────────────────────────────────────────────

interface PortalInfo {
  welcomeMessage: string
  instructions: string
  lawyerName: string
  lawyerEmail: string
  lawyerPhone: string
  lawyerRoleDescription: string
  supportStaffName: string
  supportStaffEmail: string
  supportStaffPhone: string
  supportStaffRoleDescription: string
}

interface TenantBranding {
  name: string
  logoUrl: string | null
  primaryColor: string
}

interface PortalPageClientProps {
  token: string
  tenant: TenantBranding
  matterRef: string
  matterTitle: string
  matterTypeName: string
  matterStatus: string
  language: PortalLocale
  portalInfo: PortalInfo
  // Document data (one of these will be provided)
  enforcementEnabled: boolean
  slots?: PortalSlot[]
  checklistItems?: Array<{
    id: string
    document_name: string
    description: string | null
    category: string
    is_required: boolean
    status: string
    document_id: string | null
    sort_order: number
  }>
  // Feature flags
  hasIRCC: boolean
  hasClientTasks: boolean
  hasUpcomingEvents: boolean
  hasBillingData: boolean
  hasSharedDocuments: boolean
  hasTimeline: boolean
  taskCount: number
  eventCount: number
  sharedDocumentCount: number
  lastUpdated: string
}

// ── Section Icons (inline SVGs  -  no external dependencies) ───────────────────

function DocIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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

// ── Polling interval ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000

// ── Component ────────────────────────────────────────────────────────────────

export function PortalPageClient({
  token,
  tenant,
  matterRef,
  matterTitle,
  matterTypeName,
  matterStatus,
  language: initialLanguage,
  portalInfo,
  enforcementEnabled,
  slots,
  checklistItems,
  hasIRCC,
  hasSharedDocuments,
  hasTimeline,
  lastUpdated: initialLastUpdated,
}: PortalPageClientProps) {
  const [currentLang, setCurrentLang] = useState<PortalLocale>(initialLanguage)
  const tr = getTranslations(currentLang)
  const rtl = isRtl(currentLang)

  // Initialize analytics on mount
  const analyticsInitRef = useRef(false)
  useEffect(() => {
    if (!analyticsInitRef.current) {
      analyticsInitRef.current = true
      initPortalAnalytics(token)
    }
    return () => {
      destroyPortalAnalytics()
    }
  }, [token])

  // Summary data from the NextAction panel's API call + polling
  const [sectionCounts, setSectionCounts] = useState<PortalSectionCounts | null>(null)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)

  // Collapsible section state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    initial.add('section-documents')
    if (hasIRCC) initial.add('section-questions')
    return initial
  })

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        track('section_collapsed', { section_id: id })
      } else {
        next.add(id)
        track('section_expanded', { section_id: id })
      }
      return next
    })
  }, [])

  // Navigate to section: expand + scroll
  const navigateToSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.add(sectionId)
      return next
    })
    // Brief delay to allow expansion render before scroll
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2')
        }, 2000)
      }
    })
  }, [])

  // When summary data arrives, auto-expand payment if overdue
  const handleSummaryLoaded = useCallback((data: PortalSummaryResponse) => {
    setSectionCounts(data.sections)
    setLastUpdated(data.lastUpdated)
    if (data.sections.payment.overdueCount > 0) {
      setExpandedSections((prev) => {
        const next = new Set(prev)
        next.add('section-payment')
        return next
      })
    }
  }, [])

  // ── Live Refresh  -  60s polling ──────────────────────────────────────────

  const tokenRef = useRef(token)
  tokenRef.current = token
  const handleSummaryLoadedRef = useRef(handleSummaryLoaded)
  handleSummaryLoadedRef.current = handleSummaryLoaded

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (intervalId) return
      intervalId = setInterval(async () => {
        if (document.hidden) return
        try {
          const res = await fetch(`/api/portal/${tokenRef.current}/summary`)
          if (!res.ok) return
          const data: PortalSummaryResponse = await res.json()
          handleSummaryLoadedRef.current(data)
        } catch {
          // Fail silently
        }
      }, POLL_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && !intervalId) {
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Mark messages as read when the section is opened
  const handleMessagesExpand = useCallback(() => {
    toggleSection('section-messages')
    if (!expandedSections.has('section-messages')) {
      fetch(`/api/portal/${token}/messages`, { method: 'PATCH' }).catch(() => {})
    }
  }, [expandedSections, token, toggleSection])

  // ── Compute section metrics from summary data ──────────────────────────

  const documentMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const d = sectionCounts.documents
    if (d.total > 0) {
      documentMetrics.push({
        label: tr.section_documents_uploaded ?? 'uploaded',
        value: `${d.uploaded}/${d.total}`,
      })
      if (d.accepted > 0) {
        documentMetrics.push({
          label: tr.section_documents_accepted ?? 'accepted',
          value: d.accepted,
          color: 'green',
        })
      }
      if (d.needed > 0) {
        documentMetrics.push({
          label: tr.section_documents_needed ?? 'needed',
          value: d.needed,
          color: 'amber',
        })
      }
      if (d.reuploadNeeded > 0) {
        documentMetrics.push({
          label: tr.section_documents_reupload ?? 'need re-upload',
          value: d.reuploadNeeded,
          color: 'red',
        })
      }
    }
  }

  const sharedDocMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const sd = sectionCounts.sharedDocuments
    if (sd.total > 0) {
      sharedDocMetrics.push({
        label: tr.shared_docs_viewed ?? 'viewed',
        value: `${sd.viewed}/${sd.total}`,
        color: sd.unviewed > 0 ? 'blue' : 'green',
      })
      if (sd.unviewed > 0) {
        sharedDocMetrics.push({
          label: tr.shared_docs_unviewed ?? 'unviewed',
          value: sd.unviewed,
          color: 'amber',
        })
      }
    }
  }

  const questionMetrics: SectionMetric[] = []
  if (sectionCounts?.questions.exists) {
    if (sectionCounts.questions.completed) {
      questionMetrics.push({
        label: tr.section_questions_completed ?? 'Completed',
        value: '\u2713',
        color: 'green',
      })
    } else if (sectionCounts.questions.totalForms && sectionCounts.questions.totalForms > 0) {
      // Per-form progress: "1 of 3 forms"
      questionMetrics.push({
        label: 'forms done',
        value: `${sectionCounts.questions.completedForms ?? 0}/${sectionCounts.questions.totalForms}`,
        color: (sectionCounts.questions.completedForms ?? 0) > 0 ? 'blue' : 'amber',
      })
      questionMetrics.push({
        label: tr.section_questions_progress ?? 'complete',
        value: `${sectionCounts.questions.progress}%`,
        color: 'amber',
      })
    } else {
      questionMetrics.push({
        label: tr.section_questions_progress ?? 'complete',
        value: `${sectionCounts.questions.progress}%`,
        color: 'amber',
      })
      if (sectionCounts.questions.incompleteSections > 0) {
        questionMetrics.push({
          label: tr.section_questions_incomplete ?? 'incomplete',
          value: sectionCounts.questions.incompleteSections,
          color: 'amber',
        })
      }
    }
  }

  const paymentMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const p = sectionCounts.payment
    const outstanding = p.totalDue - p.totalPaid
    if (outstanding > 0) {
      paymentMetrics.push({
        label: tr.section_payment_due ?? 'due',
        value: `$${(outstanding / 100).toLocaleString()}`,
        color: p.overdueCount > 0 ? 'red' : 'amber',
      })
    } else if (p.invoiceCount > 0) {
      paymentMetrics.push({
        label: tr.section_payment_paid ?? 'Paid in full',
        value: '\u2713',
        color: 'green',
      })
    }
    if (p.overdueCount > 0) {
      paymentMetrics.push({
        label: tr.payment_overdue_badge ?? 'overdue',
        value: p.overdueCount,
        color: 'red',
      })
    }
  }

  const taskMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const tk = sectionCounts.tasks
    if (tk.todo > 0) {
      taskMetrics.push({
        label: tr.section_tasks_todo ?? 'to do',
        value: tk.todo,
        color: tk.overdue > 0 ? 'amber' : 'default',
      })
    }
    if (tk.overdue > 0) {
      taskMetrics.push({
        label: tr.section_tasks_overdue ?? 'overdue',
        value: tk.overdue,
        color: 'red',
      })
    }
    if (tk.completed > 0) {
      taskMetrics.push({
        label: tr.section_tasks_completed ?? 'completed',
        value: tk.completed,
        color: 'green',
      })
    }
  }

  const messageMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const m = sectionCounts.messages
    if (m.unread > 0) {
      messageMetrics.push({
        label: tr.messages_unread_count ?? 'unread',
        value: m.unread,
        color: 'blue',
      })
    }
    if (m.total > 0) {
      messageMetrics.push({
        label: tr.section_messages_total ?? 'messages',
        value: m.total,
      })
    }
    if (m.latestDate) {
      messageMetrics.push({
        label: tr.section_messages_latest ?? 'latest',
        value: new Date(m.latestDate).toLocaleDateString(currentLang, {
          month: 'short',
          day: 'numeric',
        }),
      })
    }
  }

  const calendarMetrics: SectionMetric[] = []
  if (sectionCounts) {
    const c = sectionCounts.calendar
    if (c.upcomingCount > 0) {
      calendarMetrics.push({
        label: tr.section_calendar_upcoming ?? 'upcoming',
        value: c.upcomingCount,
      })
    }
    if (c.nextEvent) {
      calendarMetrics.push({
        label: tr.section_calendar_next ?? 'next',
        value: `${new Date(c.nextEvent.date).toLocaleDateString(currentLang, {
          month: 'short',
          day: 'numeric',
        })}`,
      })
    }
  }

  // ── Derive support contact for footer ─────────────────────────────────

  const supportContact = portalInfo.supportStaffName
    ? { name: portalInfo.supportStaffName, email: portalInfo.supportStaffEmail }
    : portalInfo.lawyerName
      ? { name: portalInfo.lawyerName, email: portalInfo.lawyerEmail }
      : { name: tenant.name, email: null as string | null }

  // ── Render ─────────────────────────────────────────────────────────────

  const accent = tenant.primaryColor || '#10b981'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50" dir={rtl ? 'rtl' : 'ltr'}>
      {/* ── Sovereign Header ──────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden border-b border-slate-200/60"
        style={{
          background: `linear-gradient(135deg, ${accent}08 0%, white 50%, ${accent}04 100%)`,
        }}
      >
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 backdrop-blur-xl bg-white/70" />
        <div className="relative mx-auto max-w-3xl px-4 py-5">
          <div className="flex items-center gap-4">
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto drop-shadow-sm" />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold text-sm shadow-lg"
                style={{ backgroundColor: accent, boxShadow: `0 4px 14px ${accent}30` }}
              >
                {tenant.name.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                {tenant.name}
              </h1>
              <p className="text-xs font-medium" style={{ color: accent }}>
                {tr.portal_title}
              </p>
            </div>
            {/* Universal Globe Language Selector (Directive 16.2) */}
            <UniversalGlobeSelector
              value={currentLang}
              onChange={(code) => setCurrentLang(code as PortalLocale)}
              audience="client"
            />
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {/* 0. Readiness Ring  -  "The Mirror" (Directive 046) */}
        {sectionCounts && (
          <section
            className="rounded-2xl border border-slate-200/60 p-6 shadow-lg flex flex-col items-center relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, white 0%, ${accent}04 50%, white 100%)`,
              boxShadow: `0 4px 24px ${accent}10, 0 1px 4px rgba(0,0,0,0.04)`,
            }}
          >
            <PortalReadinessRing
              score={
                sectionCounts.documents.total > 0
                  ? Math.round((sectionCounts.documents.uploaded / sectionCounts.documents.total) * 100)
                  : 0
              }
              accentColor={tenant.primaryColor}
              size={180}
              breakdown={[
                {
                  label: tr.tab_documents ?? 'Documents',
                  value: sectionCounts.documents.uploaded,
                  max: sectionCounts.documents.total,
                },
                ...(sectionCounts.questions.exists
                  ? [{
                      label: tr.tab_questions ?? 'Questionnaire',
                      value: sectionCounts.questions.progress,
                      max: 100,
                    }]
                  : []),
                ...(sectionCounts.payment.invoiceCount > 0
                  ? [{
                      label: tr.section_payment ?? 'Payment',
                      value: sectionCounts.payment.totalPaid,
                      max: sectionCounts.payment.totalDue || 1,
                      colour: sectionCounts.payment.overdueCount > 0 ? '#ef4444' : undefined,
                    }]
                  : []),
                ...(sectionCounts.tasks.total > 0
                  ? [{
                      label: tr.tab_tasks ?? 'Tasks',
                      value: sectionCounts.tasks.completed,
                      max: sectionCounts.tasks.total,
                    }]
                  : []),
              ]}
            />
          </section>
        )}

        {/* 1. Matter Summary  -  always visible */}
        <PortalMatterSummary
          matterTitle={matterTitle}
          matterNumber={matterRef}
          matterTypeName={matterTypeName}
          matterStatus={matterStatus}
          sections={sectionCounts}
          lastUpdated={lastUpdated}
          primaryColor={tenant.primaryColor}
          language={currentLang}
        />

        {/* 2. Case Timeline  -  visible if timeline data exists */}
        {hasTimeline && (
          <PortalTimeline
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        )}

        {/* 2b. Client Progress Tracker  -  stage pipeline + missing docs */}
        <ClientProgressTracker
          token={token}
          accentColor={tenant.primaryColor}
        />

        {/* 2c. Team Micro-Cards  -  high-density mobile-first lawyer + assistant */}
        {(portalInfo.lawyerName || portalInfo.supportStaffName) && (
          <PortalTeamMicroCards
            lawyer={
              portalInfo.lawyerName
                ? {
                    name: portalInfo.lawyerName,
                    role: 'Responsible Lawyer',
                    email: portalInfo.lawyerEmail || undefined,
                    phone: portalInfo.lawyerPhone || undefined,
                    roleDescription: portalInfo.lawyerRoleDescription || undefined,
                  }
                : undefined
            }
            assistant={
              portalInfo.supportStaffName
                ? {
                    name: portalInfo.supportStaffName,
                    role: 'Case Assistant',
                    email: portalInfo.supportStaffEmail || undefined,
                    phone: portalInfo.supportStaffPhone || undefined,
                    roleDescription: portalInfo.supportStaffRoleDescription || undefined,
                  }
                : undefined
            }
            accentColor={tenant.primaryColor}
          />
        )}

        {/* 2d. Message My Team  -  secure mailto with matter reference */}
        {portalInfo.lawyerEmail && (
          <PortalMessageTeam
            lawyerEmail={portalInfo.lawyerEmail}
            matterRef={matterRef}
            matterTitle={matterTitle}
            accentColor={tenant.primaryColor}
          />
        )}

        {/* 3. Legal Team  -  visible if lawyer OR support staff exists */}
        {(portalInfo.lawyerName || portalInfo.supportStaffName) && (
          <PortalLegalTeam
            lawyer={
              portalInfo.lawyerName
                ? {
                    name: portalInfo.lawyerName,
                    email: portalInfo.lawyerEmail,
                    phone: portalInfo.lawyerPhone,
                    role_description: portalInfo.lawyerRoleDescription || undefined,
                  }
                : undefined
            }
            supportStaff={
              portalInfo.supportStaffName
                ? {
                    name: portalInfo.supportStaffName,
                    email: portalInfo.supportStaffEmail || undefined,
                    phone: portalInfo.supportStaffPhone || undefined,
                    role_description: portalInfo.supportStaffRoleDescription || undefined,
                  }
                : undefined
            }
            language={currentLang}
          />
        )}

        {/* 4. Client Instructions  -  visible if instructions exist */}
        <PortalInstructions
          instructions={portalInfo.instructions}
          language={currentLang}
        />

        {/* 5. Next Action Panel  -  always visible, fetches summary data */}
        <PortalNextActionPanel
          token={token}
          primaryColor={tenant.primaryColor}
          language={currentLang}
          lawyerName={portalInfo.lawyerName || undefined}
          onSummaryLoaded={handleSummaryLoaded}
        />

        {/* 5b. Book a Consultation  -  prominent standalone section */}
        <section
          className="rounded-2xl border border-blue-200/60 p-5 shadow-lg backdrop-blur-sm relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, #eff6ff 0%, white 50%, ${accent}04 100%)`,
            boxShadow: '0 4px 20px rgba(59,130,246,0.08), 0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shrink-0 shadow-lg"
              style={{ backgroundColor: accent, boxShadow: `0 4px 12px ${accent}30` }}
            >
              <CalendarIcon />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {tr.booking_title ?? 'Book a Consultation'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {(tr as any).booking_subtitle ?? 'Schedule a meeting with your legal team in 2 clicks'}
              </p>
            </div>
          </div>
          <PortalBooking
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </section>

        {/* 6. Dashboard Summary Cards  -  clickable grid */}
        <PortalDashboardCards
          sections={sectionCounts}
          hasIRCC={hasIRCC}
          language={currentLang}
          onCardClick={navigateToSection}
        />

        {/* ── Collapsible Sections ─────────────────────────────────────── */}

        {/* 7. Documents Required  -  expanded by default */}
        <PortalCollapsibleSection
          sectionId="section-documents"
          title={tr.tab_documents ?? 'Documents'}
          icon={<DocIcon />}
          metrics={documentMetrics}
          isExpanded={expandedSections.has('section-documents')}
          onToggle={() => toggleSection('section-documents')}
          primaryColor={tenant.primaryColor}
          variant={
            sectionCounts
              ? sectionCounts.documents.reuploadNeeded > 0
                ? 'warning'
                : sectionCounts.documents.needed > 0
                  ? 'action'
                  : sectionCounts.documents.total > 0 && sectionCounts.documents.uploaded >= sectionCounts.documents.total
                    ? 'success'
                    : 'default'
              : 'default'
          }
        >
          {enforcementEnabled ? (
            <PortalDocuments
              token={token}
              tenant={tenant}
              matterRef={matterRef}
              slots={slots ?? []}
              portalInfo={portalInfo}
              language={currentLang}
              embedded
            />
          ) : (
            <PortalChecklist
              token={token}
              tenant={tenant}
              matterRef={matterRef}
              checklistItems={checklistItems ?? []}
              portalInfo={portalInfo}
              language={currentLang}
              embedded
            />
          )}
        </PortalCollapsibleSection>

        {/* 8. Client Upload  -  always visible */}
        <PortalCollapsibleSection
          sectionId="section-client-upload"
          title={tr.client_upload_title ?? 'Submit a Document'}
          icon={<UploadIcon />}
          metrics={[]}
          isExpanded={expandedSections.has('section-client-upload')}
          onToggle={() => toggleSection('section-client-upload')}
          primaryColor={tenant.primaryColor}
          variant="info"
        >
          <PortalClientUpload
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </PortalCollapsibleSection>

        {/* 9. Shared Documents  -  visible if firm has shared docs */}
        {hasSharedDocuments && (
          <PortalCollapsibleSection
            sectionId="section-shared-documents"
            title={tr.section_shared_documents ?? 'Shared Documents'}
            icon={<SharedDocIcon />}
            metrics={sharedDocMetrics}
            isExpanded={expandedSections.has('section-shared-documents')}
            onToggle={() => toggleSection('section-shared-documents')}
            badge={
              sectionCounts && sectionCounts.sharedDocuments.unviewed > 0
                ? { text: `${sectionCounts.sharedDocuments.unviewed} ${tr.shared_docs_unviewed ?? 'unviewed'}`, color: 'amber' as const }
                : undefined
            }
            primaryColor={tenant.primaryColor}
            variant="info"
          >
            <PortalSharedDocuments
              token={token}
              primaryColor={tenant.primaryColor}
              language={currentLang}
            />
          </PortalCollapsibleSection>
        )}

        {/* 9. IRCC Forms  -  visible only if IRCC forms are configured */}
        {hasIRCC && (
          <PortalCollapsibleSection
            sectionId="section-questions"
            title={tr.tab_questions ?? 'IRCC Forms'}
            icon={<QuestionIcon />}
            metrics={questionMetrics}
            isExpanded={expandedSections.has('section-questions')}
            onToggle={() => toggleSection('section-questions')}
            primaryColor={tenant.primaryColor}
            variant={
              sectionCounts
                ? sectionCounts.questions.completed
                  ? 'success'
                  : sectionCounts.questions.exists
                    ? 'action'
                    : 'default'
                : 'default'
            }
          >
            <PortalIRCCForms
              token={token}
              primaryColor={tenant.primaryColor}
              language={currentLang}
            />
          </PortalCollapsibleSection>
        )}

        {/* 10. Payment & Retainer  -  ALWAYS visible */}
        <PortalCollapsibleSection
          sectionId="section-payment"
          title={tr.section_payment ?? 'Payment & Retainer'}
          icon={<PaymentIcon />}
          metrics={paymentMetrics}
          isExpanded={expandedSections.has('section-payment')}
          onToggle={() => toggleSection('section-payment')}
          badge={
            sectionCounts && sectionCounts.payment.overdueCount > 0
              ? { text: tr.payment_overdue_badge ?? 'Overdue', color: 'red' as const }
              : undefined
          }
          primaryColor={tenant.primaryColor}
          variant={
            sectionCounts
              ? sectionCounts.payment.overdueCount > 0
                ? 'warning'
                : sectionCounts.payment.totalDue > sectionCounts.payment.totalPaid
                  ? 'action'
                  : sectionCounts.payment.invoiceCount > 0
                    ? 'success'
                    : 'default'
              : 'default'
          }
        >
          <PortalPaymentSection
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </PortalCollapsibleSection>

        {/* 11. Tasks  -  ALWAYS visible */}
        <PortalCollapsibleSection
          sectionId="section-tasks"
          title={tr.tab_tasks ?? 'Action Items'}
          icon={<TaskIcon />}
          metrics={taskMetrics}
          isExpanded={expandedSections.has('section-tasks')}
          onToggle={() => toggleSection('section-tasks')}
          badge={
            sectionCounts && sectionCounts.tasks.overdue > 0
              ? { text: tr.section_tasks_overdue ?? 'Overdue', color: 'red' as const }
              : undefined
          }
          primaryColor={tenant.primaryColor}
          variant={
            sectionCounts
              ? sectionCounts.tasks.overdue > 0
                ? 'warning'
                : sectionCounts.tasks.todo > 0
                  ? 'action'
                  : sectionCounts.tasks.total > 0 && sectionCounts.tasks.completed >= sectionCounts.tasks.total
                    ? 'success'
                    : 'default'
              : 'default'
          }
        >
          <PortalTasks
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </PortalCollapsibleSection>

        {/* 12. Messages  -  always visible */}
        <PortalCollapsibleSection
          sectionId="section-messages"
          title={tr.tab_messages ?? 'Messages'}
          icon={<MessageIcon />}
          metrics={messageMetrics}
          isExpanded={expandedSections.has('section-messages')}
          onToggle={handleMessagesExpand}
          badge={
            sectionCounts && sectionCounts.messages.unread > 0
              ? { text: `${sectionCounts.messages.unread} ${tr.messages_unread_count ?? 'unread'}`, color: 'blue' as const }
              : undefined
          }
          primaryColor={tenant.primaryColor}
          variant={sectionCounts && sectionCounts.messages.unread > 0 ? 'info' : 'default'}
        >
          <PortalMessages
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </PortalCollapsibleSection>

        {/* 13. Calendar / Upcoming Dates  -  ALWAYS visible */}
        <PortalCollapsibleSection
          sectionId="section-calendar"
          title={tr.tab_calendar ?? 'Upcoming Dates'}
          icon={<CalendarIcon />}
          metrics={calendarMetrics}
          isExpanded={expandedSections.has('section-calendar')}
          onToggle={() => toggleSection('section-calendar')}
          primaryColor={tenant.primaryColor}
          variant={sectionCounts && sectionCounts.calendar.upcomingCount > 0 ? 'info' : 'default'}
        >
          <PortalBooking
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
          <PortalCalendar
            token={token}
            primaryColor={tenant.primaryColor}
            language={currentLang}
          />
        </PortalCollapsibleSection>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-6">
        <div className="mb-4 border-t border-slate-200/60" />
        <p className="text-center text-xs text-slate-500 mb-3">
          {supportContact.email ? (
            <>
              {tr.portal_support_contact ?? 'Contact'}{' '}
              <span className="font-medium">{supportContact.name}</span>
              {' '}
              {tr.portal_support_at ?? 'at'}{' '}
              <a
                href={`mailto:${supportContact.email}`}
                onClick={() => track('portal_help_contact_clicked', { contact_type: 'email', target: supportContact.email! })}
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                {supportContact.email}
              </a>
            </>
          ) : (
            tr.portal_fallback_contact
              ? tr.portal_fallback_contact.replace('{name}', supportContact.name)
              : `For questions about your file, contact ${supportContact.name}.`
          )}
        </p>
        <p className="text-center text-xs text-slate-400">
          {tr.powered_by}
        </p>
      </footer>

      {/* Sovereign Chat  -  Sentinel Lite (Directive 046) */}
      <PortalSovereignChat
        token={token}
        primaryColor={tenant.primaryColor}
        firmName={tenant.name}
      />
    </div>
  )
}
