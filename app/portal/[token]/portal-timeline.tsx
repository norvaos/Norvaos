'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import {
  getTranslations,
  type PortalLocale,
} from '@/lib/utils/portal-translations'

interface TimelineEntry {
  stage_id: string
  stage_name: string
  entered_at: string
  exited_at?: string
}

interface PortalTimelineProps {
  token: string
  primaryColor: string
  language?: PortalLocale
}

export function PortalTimeline({ token, primaryColor, language = 'en' }: PortalTimelineProps) {
  const tr = getTranslations(language)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [currentStageId, setCurrentStageId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/portal/${token}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        setTimeline(data.timeline ?? [])
        setCurrentStageId(data.currentStageId ?? null)
      })
      .catch(() => {
        // Silently fail — timeline is optional
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">{tr.timeline_loading}</span>
        </div>
      </div>
    )
  }

  if (timeline.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">{tr.timeline_title}</h3>

      <div className="relative">
        {/* Vertical connecting line */}
        <div
          className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200"
          aria-hidden="true"
        />

        <div className="space-y-4">
          {timeline.map((entry, i) => {
            const isCurrent = entry.stage_id === currentStageId
            const isCompleted = !!entry.exited_at
            const isLast = i === timeline.length - 1

            const enteredDate = formatDate(entry.entered_at)

            return (
              <div key={`${entry.stage_id}-${i}`} className="relative flex items-start gap-3">
                {/* Icon */}
                <div className="relative z-10 flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-[22px] w-[22px] text-green-500" />
                  ) : isCurrent ? (
                    <div
                      className="h-[22px] w-[22px] rounded-full border-[3px] flex items-center justify-center"
                      style={{ borderColor: primaryColor }}
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: primaryColor }}
                      />
                    </div>
                  ) : (
                    <Circle className="h-[22px] w-[22px] text-slate-300" />
                  )}
                </div>

                {/* Content */}
                <div className={isLast ? '' : 'pb-1'}>
                  <p
                    className="text-sm font-medium"
                    style={{ color: isCurrent ? primaryColor : '#1e293b' }}
                  >
                    {entry.stage_name}
                    {isCurrent && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {tr.timeline_current}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{enteredDate}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
