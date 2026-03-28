'use client'

import { useState, useEffect } from 'react'
import {
  FileText, Clock, AlertCircle, CheckCircle2, ArrowLeft,
  Calendar, Zap, Upload, ChevronRight, Loader2,
  ClipboardList, FolderOpen,
} from 'lucide-react'
import { getKioskTranslations, interpolate } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'
import type {
  ReturningClientData,
  ReturningClientMatter,
  ReturningClientBookingPage,
} from './kiosk-returning-client-search'

// ── Types ──────────────────────────────────────────────────────────────────

interface KioskTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string | null
  due_date: string | null
  category: string | null
}

interface KioskDocumentSlot {
  id: string
  slot_name: string
  description: string | null
  category: string
  person_role: string | null
  is_required: boolean
  status: string
  accepted_file_types: string[]
  max_file_size_bytes: number
  current_version: number
  latest_review_reason: string | null
}

interface MatterDetail {
  tasks: KioskTask[]
  documentSlots: KioskDocumentSlot[]
}

type ActiveTab = 'summary' | 'tasks' | 'documents'

interface KioskClientPortalViewProps {
  token: string
  data: ReturningClientData
  locale: PortalLocale
  primaryColor: string
  onQuickCheckIn: (contactId: string, matterId: string, lawyerId: string | null) => void
  onBookAppointment: (slug: string) => void
  onBack: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active:      { label: 'Active',      cls: 'bg-emerald-950/40 text-emerald-400' },
    open:        { label: 'Open',        cls: 'bg-emerald-950/40 text-emerald-400' },
    in_progress: { label: 'In Progress', cls: 'bg-blue-950/40 text-blue-400' },
    pending:     { label: 'Pending',     cls: 'bg-amber-950/40 text-amber-400' },
    closed_won:  { label: 'Closed',      cls: 'bg-slate-100 text-slate-600' },
    closed:      { label: 'Closed',      cls: 'bg-slate-100 text-slate-600' },
  }
  const v = map[status]
  return v ?? { label: status.replace(/_/g, ' '), cls: 'bg-slate-100 text-slate-600' }
}

function docStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    empty:          { label: 'Not uploaded',       cls: 'bg-amber-950/30 text-amber-400 border-amber-500/20' },
    pending_review: { label: 'Under review',       cls: 'bg-blue-950/30 text-blue-400 border-blue-500/20' },
    accepted:       { label: 'Accepted',           cls: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' },
    needs_re_upload:{ label: 'Re-upload needed',   cls: 'bg-orange-950/30 text-orange-400 border-orange-500/20' },
    rejected:       { label: 'Re-upload needed',   cls: 'bg-red-950/30 text-red-400 border-red-500/20' },
  }
  return map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
}

function taskStatusDot(status: string) {
  if (status === 'completed' || status === 'done') return 'bg-green-500'
  if (status === 'in_progress' || status === 'active') return 'bg-blue-500'
  return 'bg-amber-400'
}

function taskStatusLabel(status: string) {
  if (status === 'completed' || status === 'done') return 'Done'
  if (status === 'in_progress' || status === 'active') return 'In Progress'
  return 'To Do'
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

function isOverdue(due: string | null) {
  return !!due && new Date(due) < new Date()
}

// ── Sub-components ──────────────────────────────────────────────────────────

function LawyerAvatar({ name, avatarUrl, primaryColor, size = 'md' }: {
  name: string; avatarUrl: string | null; primaryColor: string; size?: 'sm' | 'md'
}) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const cls = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-11 h-11 text-base'
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center overflow-hidden border-2 flex-shrink-0`}
      style={{ borderColor: primaryColor }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        : <span className="font-semibold" style={{ color: primaryColor }}>{initials}</span>}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, taskCount, docCount, primaryColor }: {
  active: ActiveTab
  onChange: (t: ActiveTab) => void
  taskCount: number
  docCount: number
  primaryColor: string
}) {
  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'summary',   label: 'Summary',   icon: <FileText className="w-4 h-4" /> },
    { key: 'tasks',     label: 'Tasks',     icon: <ClipboardList className="w-4 h-4" />, count: taskCount },
    { key: 'documents', label: 'Documents', icon: <FolderOpen className="w-4 h-4" />, count: docCount },
  ]
  return (
    <div className="flex w-full rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-1 gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-sm font-medium transition-all ${
            active === tab.key
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
          style={active === tab.key ? { borderBottom: `2px solid ${primaryColor}` } : {}}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              active === tab.key ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500'
            }`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Summary tab ──────────────────────────────────────────────────────────────

function SummaryTab({ matter, primaryColor, locale }: {
  matter: ReturningClientMatter; primaryColor: string; locale: PortalLocale
}) {
  const t = getKioskTranslations(locale)
  const badge = statusBadge(matter.status)
  const hasPending = matter.pendingDocuments > 0 || matter.pendingTasks > 0

  return (
    <div className="space-y-4">
      {/* Matter identity */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">{matter.title || matter.matterNumber}</p>
            {matter.title && matter.matterNumber && (
              <p className="text-sm text-slate-500">{matter.matterNumber}</p>
            )}
            {matter.matterTypeName && (
              <p className="text-sm text-slate-500">{matter.matterTypeName}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {/* Lawyer */}
        {matter.lawyerName && (
          <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
            <LawyerAvatar name={matter.lawyerName} avatarUrl={matter.lawyerAvatarUrl} primaryColor={primaryColor} size="sm" />
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Your Lawyer</p>
              <p className="text-sm font-semibold text-slate-800">{matter.lawyerName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Action items summary */}
      {hasPending && (
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-400">Action Items</p>
          {matter.pendingDocuments > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{interpolate(getKioskTranslations(locale).returning_client_pending_docs, { count: String(matter.pendingDocuments) })}</span>
            </div>
          )}
          {matter.pendingTasks > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <ClipboardList className="w-4 h-4 flex-shrink-0" />
              <span>{interpolate(getKioskTranslations(locale).returning_client_pending_tasks, { count: String(matter.pendingTasks) })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tasks tab ──────────────────────────────────────────────────────────────

function TasksTab({ tasks }: { tasks: KioskTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto" />
        <p className="text-slate-500">No tasks assigned right now.</p>
      </div>
    )
  }

  const pending = tasks.filter((t) => t.status !== 'completed' && t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'done')

  const renderTask = (task: KioskTask) => {
    const overdue = isOverdue(task.due_date) && task.status !== 'completed' && task.status !== 'done'
    const isDone = task.status === 'completed' || task.status === 'done'
    return (
      <div
        key={task.id}
        className={`bg-white rounded-xl border p-4 ${overdue ? 'border-red-500/20' : 'border-slate-200'}`}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${taskStatusDot(task.status)}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-slate-400">{taskStatusLabel(task.status)}</span>
              {task.due_date && (
                <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                  <Clock className="w-3 h-3" />
                  {overdue ? 'Overdue · ' : 'Due '}{formatDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
          {isDone && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            Pending ({pending.length})
          </p>
          {pending.map(renderTask)}
        </div>
      )}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            Completed ({done.length})
          </p>
          {done.map(renderTask)}
        </div>
      )}
    </div>
  )
}

// ── Documents tab ──────────────────────────────────────────────────────────

function DocumentsTab({ slots }: { slots: KioskDocumentSlot[] }) {
  if (slots.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <FolderOpen className="w-10 h-10 text-slate-200 mx-auto" />
        <p className="text-slate-500">No documents requested yet.</p>
      </div>
    )
  }

  const needsAction = slots.filter((s) => s.status === 'empty' || s.status === 'needs_re_upload' || s.status === 'rejected')
  const inReview = slots.filter((s) => s.status === 'pending_review')
  const accepted = slots.filter((s) => s.status === 'accepted')

  const renderSlot = (slot: KioskDocumentSlot) => {
    const badge = docStatusBadge(slot.status)
    const needsUpload = slot.status === 'empty' || slot.status === 'needs_re_upload' || slot.status === 'rejected'
    const isAccepted = slot.status === 'accepted'

    return (
      <div key={slot.id} className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-slate-900">{slot.slot_name}</p>
              {slot.is_required && (
                <span className="text-[10px] font-semibold text-red-500 uppercase">Required</span>
              )}
            </div>
            {slot.description && (
              <p className="text-xs text-slate-500 mt-0.5">{slot.description}</p>
            )}
            {slot.latest_review_reason && (needsUpload) && (
              <p className="text-xs text-orange-400 bg-orange-950/30 border border-orange-500/20 rounded-md px-2 py-1 mt-2">
                Reason: {slot.latest_review_reason}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.label}
            </span>
            {isAccepted
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : needsUpload
                ? <Upload className="w-4 h-4 text-amber-500" />
                : null
            }
          </div>
        </div>
        {needsUpload && (
          <p className="text-[11px] text-slate-400 mt-2">
            Please upload this document via the client portal or bring it to your appointment.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {needsAction.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 px-1">
            Action Needed ({needsAction.length})
          </p>
          {needsAction.map(renderSlot)}
        </div>
      )}
      {inReview.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 px-1">
            Under Review ({inReview.length})
          </p>
          {inReview.map(renderSlot)}
        </div>
      )}
      {accepted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-600 px-1">
            Accepted ({accepted.length})
          </p>
          {accepted.map(renderSlot)}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * Kiosk client portal view  -  shown after a returning client is found.
 *
 * Displays their active matter(s) and presents:
 *   - Full matter summary (status, lawyer, action items)
 *   - Client-facing tasks list
 *   - Document slots list (read-only; prompts to upload via portal or bring to appt)
 *   - Book Appointment / Quick Check-In actions
 *
 * Multiple matters: client selects the relevant one first, then sees full detail.
 */
export function KioskClientPortalView({
  token,
  data,
  locale,
  primaryColor,
  onQuickCheckIn,
  onBookAppointment,
  onBack,
}: KioskClientPortalViewProps) {
  const t = getKioskTranslations(locale)

  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(
    data.matters.length === 1 ? data.matters[0].id : null,
  )
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary')
  const [detail, setDetail] = useState<MatterDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showBookingOptions, setShowBookingOptions] = useState(false)

  const selectedMatter = data.matters.find((m) => m.id === selectedMatterId) ?? null

  // Lazy-load detail when a matter is selected
  useEffect(() => {
    if (!selectedMatterId) return
    setDetail(null)
    setLoadingDetail(true)
    setActiveTab('summary')
    setShowBookingOptions(false)

    fetch(`/api/kiosk/${token}/matter/${selectedMatterId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => setDetail({ tasks: [], documentSlots: [] }))
      .finally(() => setLoadingDetail(false))
  }, [selectedMatterId, token])

  const relevantBookingPages: ReturningClientBookingPage[] = selectedMatter?.lawyerId
    ? data.bookingPages.filter((bp) => bp.lawyerId === selectedMatter.lawyerId)
    : data.bookingPages

  function handleQuickCheckIn() {
    if (!selectedMatter) return
    onQuickCheckIn(data.contact.id, selectedMatter.id, selectedMatter.lawyerId)
  }

  // ── Multi-matter picker ───────────────────────────────────────────────────
  if (!selectedMatterId && data.matters.length > 1) {
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto px-4">
        <div className="w-full">
          <button type="button" onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors py-2">
            <ArrowLeft className="w-4 h-4" />
            {t.questions_back}
          </button>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">
            Welcome back, {data.contact.name.split(' ')[0]}
          </h2>
          <p className="text-slate-500 text-sm">Select the file you want to view</p>
        </div>
        <div className="w-full space-y-3">
          {data.matters.map((m) => {
            const badge = statusBadge(m.status)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMatterId(m.id)}
                className="w-full flex items-center gap-4 p-5 bg-white border-2 border-slate-200 rounded-2xl hover:border-slate-400 transition-colors text-left"
              >
                <FileText className="w-6 h-6 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{m.title || m.matterNumber}</p>
                  {m.matterTypeName && <p className="text-sm text-slate-500">{m.matterTypeName}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Single matter / matter selected view ────────────────────────────────
  const pendingTaskCount = detail?.tasks.filter((t) => t.status !== 'completed' && t.status !== 'done').length ?? 0
  const pendingDocCount = detail?.documentSlots.filter((s) => s.status === 'empty' || s.status === 'needs_re_upload' || s.status === 'rejected').length ?? 0

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg mx-auto px-4">
      {/* Back button */}
      <div className="w-full">
        <button type="button"
          onClick={data.matters.length > 1 ? () => setSelectedMatterId(null) : onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.questions_back}
        </button>
      </div>

      {/* Greeting */}
      <div className="text-center space-y-0.5">
        <h2 className="text-2xl font-semibold text-slate-900">
          Welcome back, {data.contact.name.split(' ')[0]}
        </h2>
        <p className="text-slate-500 text-sm">Here&apos;s your file overview</p>
      </div>

      {/* Tab bar */}
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        taskCount={pendingTaskCount}
        docCount={pendingDocCount}
        primaryColor={primaryColor}
      />

      {/* Tab content */}
      <div className="w-full min-h-[200px]">
        {loadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {activeTab === 'summary' && selectedMatter && (
              <SummaryTab matter={selectedMatter} primaryColor={primaryColor} locale={locale} />
            )}
            {activeTab === 'tasks' && (
              <TasksTab tasks={detail?.tasks ?? []} />
            )}
            {activeTab === 'documents' && (
              <DocumentsTab slots={detail?.documentSlots ?? []} />
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {!showBookingOptions && (
        <div className="w-full space-y-3 pt-2 border-t border-slate-100">
          {relevantBookingPages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (relevantBookingPages.length === 1) {
                  onBookAppointment(relevantBookingPages[0].slug)
                } else {
                  setShowBookingOptions(true)
                }
              }}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-colors text-left"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${primaryColor}15` }}>
                <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{t.returning_client_book_apt}</p>
                <p className="text-sm text-slate-500">
                  {relevantBookingPages.length === 1
                    ? `${relevantBookingPages[0].durationMinutes} min · ${relevantBookingPages[0].lawyerName}`
                    : `${relevantBookingPages.length} options available`}
                </p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={handleQuickCheckIn}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-colors"
            style={{ borderColor: primaryColor, backgroundColor: `${primaryColor}08` }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: primaryColor }}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">{t.returning_client_quick_checkin}</p>
              <p className="text-sm text-slate-500">{t.returning_client_quick_checkin_desc}</p>
            </div>
          </button>
        </div>
      )}

      {/* Booking page picker (when multiple) */}
      {showBookingOptions && (
        <div className="w-full space-y-3 pt-2 border-t border-slate-100">
          <p className="text-sm text-slate-500 font-medium">{t.returning_client_book_apt}</p>
          {relevantBookingPages.map((bp) => (
            <button
              key={bp.id}
              type="button"
              onClick={() => onBookAppointment(bp.slug)}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-400 transition-colors"
            >
              <div>
                <p className="text-base font-medium text-slate-900">{bp.title}</p>
                <p className="text-sm text-slate-500">{bp.durationMinutes} min · {bp.lawyerName}</p>
              </div>
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </button>
          ))}
          <button type="button" onClick={() => setShowBookingOptions(false)}
            className="w-full py-3 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            {t.questions_back}
          </button>
        </div>
      )}
    </div>
  )
}
