'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileText,
  Upload,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UploadSheet } from './upload-sheet'

// ── Types ────────────────────────────────────────────────────────────────────

interface StageData {
  name: string
  color: string
  isCurrent: boolean
  isCompleted: boolean
}

interface MissingDoc {
  id: string
  name: string
  category: string
  isRequired: boolean
  needsReUpload: boolean
  description: string | null
}

interface ProgressData {
  matterTitle: string
  matterNumber: string | null
  matterStatus: string
  stages: {
    currentStageName: string | null
    timeInStage: string
    pipelineProgress: number
    stages: StageData[]
  } | null
  documents: {
    totalSlots: number
    accepted: number
    pendingReview: number
    needsReUpload: number
    empty: number
    completionPct: number
    missingDocs: MissingDoc[]
  }
}

interface ClientProgressTrackerProps {
  token: string
  /** Primary colour from tenant branding */
  accentColor?: string
}

// ── Mobile Stage Stepper ─────────────────────────────────────────────────────

function StageStepper({
  stages,
  currentStageName,
  pipelineProgress,
  timeInStage,
  accentColor,
}: {
  stages: StageData[]
  currentStageName: string | null
  pipelineProgress: number
  timeInStage: string
  accentColor: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          {currentStageName ?? 'Not started'}
        </span>
        <span className="text-xs font-semibold tabular-nums text-slate-500">
          {pipelineProgress}% complete
        </span>
      </div>

      <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(pipelineProgress, 100)}%`,
            backgroundColor: pcentColor(pipelineProgress, accentColor),
          }}
        />
      </div>

      <div className="space-y-0" role="list" aria-label="Case stages">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1
          return (
            <div key={idx} className="flex items-start gap-3" role="listitem">
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                    stage.isCompleted && 'text-white',
                    stage.isCurrent && 'text-white ring-2 ring-offset-2',
                    !stage.isCompleted && !stage.isCurrent && 'bg-slate-100 text-slate-400',
                  )}
                  style={{
                    backgroundColor: stage.isCompleted || stage.isCurrent ? stage.color : undefined,
                    '--tw-ring-color': stage.isCurrent ? stage.color : undefined,
                  } as React.CSSProperties}
                >
                  {stage.isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : stage.isCurrent ? (
                    <div className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                    </div>
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'w-0.5 h-6 shrink-0',
                      stage.isCompleted ? 'bg-slate-300' : 'bg-slate-100',
                    )}
                  />
                )}
              </div>

              <div className="pt-1 min-w-0">
                <p
                  className={cn(
                    'text-sm leading-tight',
                    stage.isCurrent && 'font-semibold text-slate-900',
                    stage.isCompleted && 'font-medium text-slate-600',
                    !stage.isCurrent && !stage.isCompleted && 'text-slate-400',
                  )}
                >
                  {stage.name}
                </p>
                {stage.isCurrent && timeInStage && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    In this stage: {timeInStage}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Missing Documents List (with Upload Bridge) ─────────────────────────────

function MissingDocsList({
  docs,
  onUploadClick,
}: {
  docs: MissingDoc[]
  onUploadClick: (doc: MissingDoc) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const showAll = docs.length <= 4 || expanded
  const visible = showAll ? docs : docs.slice(0, 3)

  if (docs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 rounded-xl bg-green-50 border border-green-200">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <p className="text-sm font-medium text-green-700">
          All documents received  -  nothing to upload.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {visible.map((doc) => (
        <div
          key={doc.id}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 transition-all',
            doc.needsReUpload
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200 bg-white',
          )}
        >
          <div className="shrink-0 mt-0.5">
            {doc.needsReUpload ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <Upload className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 leading-snug">
              {doc.name}
              {doc.isRequired && (
                <span className="text-red-500 ml-1" aria-label="required">*</span>
              )}
            </p>
            {doc.needsReUpload && (
              <p className="text-xs text-amber-700 mt-0.5">
                Please re-upload  -  the previous version needs correction.
              </p>
            )}
            {doc.description && !doc.needsReUpload && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {doc.description}
              </p>
            )}
            {doc.category && (
              <span className="inline-block mt-1 text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                {doc.category}
              </span>
            )}
          </div>

          {/* ── Upload Button (Secure Upload Bridge) ──────────────────── */}
          <button
            onClick={() => onUploadClick(doc)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              'active:scale-95 touch-manipulation',
              doc.needsReUpload
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
            aria-label={`Upload ${doc.name}`}
          >
            <Upload className="h-3 w-3" />
            Upload
          </button>
        </div>
      ))}

      {docs.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors mx-auto py-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>{docs.length - 3} more documents <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  )
}

// ── Document Completion Ring ─────────────────────────────────────────────────

function CompletionRing({ pct, accentColor }: { pct: number; accentColor: string }) {
  const r = 36
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={r}
          fill="none"
          stroke={pcentColor(pct, accentColor)}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
          className="transition-all duration-700 ease-out"
        />
        <text
          x="44" y="44"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-800 text-lg font-bold"
          style={{ fontSize: 18 }}
        >
          {pct}%
        </text>
      </svg>
      <span className="text-xs font-medium text-slate-500">Documents Complete</span>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pcentColor(pct: number, accent: string): string {
  if (pct >= 80) return '#22c55e'
  if (pct >= 50) return '#f59e0b'
  if (pct >= 20) return accent
  return '#ef4444'
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ClientProgressTracker({
  token,
  accentColor = '#2563eb',
}: ClientProgressTrackerProps) {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Upload sheet state
  const [uploadSlot, setUploadSlot] = useState<MissingDoc | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/progress/${encodeURIComponent(token)}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Unable to load progress')
        return
      }
      setData(json.data)
    } catch {
      setError('Unable to connect  -  please try again later.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  // Handle successful upload  -  refetch data to update stats
  const handleUploadComplete = useCallback((result: { versionNumber: number }) => {
    const slotName = uploadSlot?.name ?? 'Document'
    setUploadSlot(null)
    setUploadSuccess(`${slotName} uploaded successfully (v${result.versionNumber}). Status: Pending Review.`)
    // Refetch to update completion ring + missing docs list
    fetchProgress()
    // Auto-dismiss success after 5s
    setTimeout(() => setUploadSuccess(null), 5000)
  }, [uploadSlot, fetchProgress])

  const handleUploadError = useCallback((errorMsg: string) => {
    setUploadSlot(null)
    setError(errorMsg)
    setTimeout(() => setError(null), 5000)
  }, [])

  // ── Loading State ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your case progress...
        </div>
        <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
        <div className="h-2.5 w-full bg-slate-100 rounded-full animate-pulse" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error State ──────────────────────────────────────────────────────────
  if (!data && error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Access Denied</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { stages, documents } = data
  const missingCount = documents.missingDocs.length
  const requiredMissing = documents.missingDocs.filter(d => d.isRequired).length

  return (
    <div className="space-y-6">
      {/* ── Upload Success Toast ────────────────────────────────────────── */}
      {uploadSuccess && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 animate-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700 flex-1">{uploadSuccess}</p>
          <button
            onClick={() => setUploadSuccess(null)}
            className="text-green-500 hover:text-green-700 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Inline error toast ──────────────────────────────────────────── */}
      {error && data && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {/* ── Stage Progress Section ──────────────────────────────────────── */}
      {stages && stages.stages.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            Case Progress
          </h3>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <StageStepper
              stages={stages.stages}
              currentStageName={stages.currentStageName}
              pipelineProgress={stages.pipelineProgress}
              timeInStage={stages.timeInStage}
              accentColor={accentColor}
            />
          </div>
        </section>
      )}

      {/* ── Documents Section ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          Documents
          {missingCount > 0 && (
            <span className="ml-auto text-xs font-medium text-slate-500">
              {missingCount} needed
              {requiredMissing > 0 && (
                <span className="text-red-500 ml-1">({requiredMissing} required)</span>
              )}
            </span>
          )}
        </h3>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <CompletionRing pct={documents.completionPct} accentColor={accentColor} />
            <div className="grid grid-cols-2 gap-3 flex-1 w-full">
              <StatPill label="Accepted" value={documents.accepted} colour="text-green-600" bg="bg-green-50" />
              <StatPill label="Pending Review" value={documents.pendingReview} colour="text-amber-600" bg="bg-amber-50" />
              <StatPill label="Re-upload" value={documents.needsReUpload} colour="text-red-600" bg="bg-red-50" />
              <StatPill label="Not Uploaded" value={documents.empty} colour="text-slate-500" bg="bg-slate-50" />
            </div>
          </div>

          {missingCount > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Action Required
              </p>
              <MissingDocsList
                docs={documents.missingDocs}
                onUploadClick={(doc) => setUploadSlot(doc)}
              />
            </div>
          )}

          {missingCount === 0 && (
            <MissingDocsList docs={[]} onUploadClick={() => {}} />
          )}
        </div>
      </section>

      {/* ── Secure Upload Bridge (UploadSheet) ──────────────────────────── */}
      {uploadSlot && (
        <UploadSheet
          open={!!uploadSlot}
          onOpenChange={(open) => { if (!open) setUploadSlot(null) }}
          slotId={uploadSlot.id}
          slotName={uploadSlot.name}
          description={uploadSlot.description}
          isRequired={uploadSlot.isRequired}
          acceptedFileTypes={[]}
          maxFileSizeBytes={10 * 1024 * 1024}
          token={token}
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
        />
      )}
    </div>
  )
}

// ── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  colour,
  bg,
}: {
  label: string
  value: number
  colour: string
  bg: string
}) {
  return (
    <div className={cn('rounded-xl px-3 py-2 text-center', bg)}>
      <p className={cn('text-lg font-bold tabular-nums', colour)}>{value}</p>
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
    </div>
  )
}
