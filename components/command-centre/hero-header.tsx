'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandCentre } from './command-centre-context'
import { ConsultationOutcomePanel } from './consultation-outcome-panel'
import { MatterOutcomes } from './matter-outcomes'
import { StageHistory } from './panels/stage-history'
import { StageAutomationHint } from './automation-preview'
import { useUpdateLeadStage } from '@/lib/queries/leads'
import { LEAD_TEMPERATURES } from '@/lib/utils/constants'
import { useMatterTypes } from '@/lib/queries/matter-types'
import {
  formatFullName,
  formatInitials,
  formatPhoneNumber,
  formatDate,
  isOverdue,
  daysInStage,
} from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ArrowLeft,
  Phone,
  Mail,
  User,
  Calendar,
  Clock,
  Activity,
  AlertTriangle,
  Eye,
  Play,
  Timer,
  ClipboardList,
} from 'lucide-react'

// ─── Component ─────────────────────────────────────────────────────

interface HeroHeaderProps {
  onToggleActivity: () => void
  activityOpen: boolean
  onToggleScreening?: () => void
  screeningOpen?: boolean
}

export function HeroHeader({ onToggleActivity, activityOpen, onToggleScreening, screeningOpen }: HeroHeaderProps) {
  const router = useRouter()
  const {
    entityType,
    lead,
    contact,
    tenantId,
    stages,
    currentStage,
    users,
    isConverted,
    timerRunning,
    startMeetingTimer,
  } = useCommandCentre()

  const updateLeadStage = useUpdateLeadStage()

  // ── Derived values ────────────────────────────────────────────
  const displayName = useMemo(() => {
    if (!contact) return 'Loading...'
    if (contact.contact_type === 'organization') {
      return contact.organization_name || 'Unknown Organization'
    }
    return formatFullName(contact.first_name, contact.last_name) || contact.email_primary || 'Unknown'
  }, [contact])

  const initials = useMemo(() => {
    if (!contact) return '?'
    if (contact.contact_type === 'organization') {
      return contact.organization_name?.charAt(0)?.toUpperCase() || 'O'
    }
    return formatInitials(contact.first_name, contact.last_name)
  }, [contact])

  const temperatureInfo = useMemo(() => {
    const temp = lead?.temperature ?? 'warm'
    return LEAD_TEMPERATURES.find((t) => t.value === temp) ?? LEAD_TEMPERATURES[1]
  }, [lead?.temperature])

  const assignedUser = useMemo(() => {
    if (!lead?.assigned_to || !users.length) return null
    const u = users.find((u) => u.id === lead.assigned_to)
    return u ? formatFullName(u.first_name, u.last_name) || u.email : null
  }, [lead?.assigned_to, users])

  const reviewerUser = useMemo(() => {
    const cf = (lead?.custom_fields ?? {}) as Record<string, unknown>
    const reviewerId = cf.reviewer_id as string | undefined
    if (!reviewerId || !users.length) return null
    const u = users.find((u) => u.id === reviewerId)
    return u ? formatFullName(u.first_name, u.last_name) || u.email : null
  }, [lead?.custom_fields, users])

  // Show matter type name as badge when one is selected
  const { data: matterTypes } = useMatterTypes(tenantId, lead?.practice_area_id || undefined)
  const matterTypeLabel = useMemo(() => {
    if (!lead?.matter_type_id || !matterTypes) return null
    const mt = matterTypes.find((m) => m.id === lead.matter_type_id)
    return mt?.name ?? null
  }, [lead?.matter_type_id, matterTypes])

  const daysInCurrentStage = lead?.stage_entered_at ? daysInStage(lead.stage_entered_at) : 0
  const followUpOverdue = lead?.next_follow_up ? isOverdue(lead.next_follow_up) : false
  const isRotting = currentStage?.rotting_days ? daysInCurrentStage > currentStage.rotting_days : false

  // ── Stage click handler ───────────────────────────────────────
  const handleStageClick = (stageId: string) => {
    if (!lead || isConverted) return
    if (stageId === lead.stage_id) return
    updateLeadStage.mutate({ id: lead.id, stageId })
  }

  // ── Current stage index for stepper ───────────────────────────
  const currentStageIndex = stages.findIndex((s) => s.id === lead?.stage_id)

  return (
    <div className="shrink-0 border-b bg-white">
      {/* Top row: back button + activity toggle */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-500 -ml-2 h-8"
          onClick={() => router.push(entityType === 'matter' ? '/matters' : '/leads')}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          {entityType === 'matter' ? 'Matters' : 'Leads'}
        </Button>
        <div className="flex items-center gap-2">
          {!timerRunning && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
              onClick={startMeetingTimer}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <Timer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Start Meeting</span>
            </Button>
          )}
          {entityType === 'lead' && onToggleScreening && (
            <Button
              variant={screeningOpen ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={onToggleScreening}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Screening</span>
            </Button>
          )}
          <Button
            variant={activityOpen ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={onToggleActivity}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activity</span>
          </Button>
        </div>
      </div>

      {/* Identity row */}
      <div className="px-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-semibold shrink-0"
            style={{ backgroundColor: temperatureInfo.color }}
          >
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 truncate">{displayName}</h1>
              <Badge
                variant="secondary"
                className="text-xs gap-1"
                style={{
                  backgroundColor: `${temperatureInfo.color}15`,
                  color: temperatureInfo.color,
                  borderColor: `${temperatureInfo.color}40`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full inline-block"
                  style={{ backgroundColor: temperatureInfo.color }}
                />
                {temperatureInfo.label}
              </Badge>
              {currentStage && (
                <Badge
                  variant="secondary"
                  className="text-xs"
                  style={{
                    backgroundColor: `${currentStage.color ?? '#6b7280'}15`,
                    color: currentStage.color ?? '#6b7280',
                    borderColor: `${currentStage.color ?? '#6b7280'}40`,
                  }}
                >
                  {currentStage.name}
                </Badge>
              )}
              {matterTypeLabel && (
                <Badge
                  variant="outline"
                  className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200"
                >
                  {matterTypeLabel}
                </Badge>
              )}
              {isConverted && (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  Converted
                </Badge>
              )}
              {/* Compliance flags */}
              {followUpOverdue && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </Badge>
              )}
              {isRotting && !followUpOverdue && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  {daysInCurrentStage}d in stage
                </Badge>
              )}
            </div>

            {/* Contact details row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-slate-500">
              {contact?.phone_primary && (
                <a href={`tel:${contact.phone_primary}`} className="flex items-center gap-1 hover:text-slate-700">
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhoneNumber(contact.phone_primary)}
                </a>
              )}
              {contact?.email_primary && (
                <a href={`mailto:${contact.email_primary}`} className="flex items-center gap-1 hover:text-slate-700">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email_primary}
                </a>
              )}
              {assignedUser && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {assignedUser}
                </span>
              )}
              {reviewerUser && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Eye className="h-3.5 w-3.5" />
                  {reviewerUser}
                </span>
              )}
              {lead?.source && (
                <span className="text-slate-400">
                  {lead.source}
                </span>
              )}
              {lead?.next_follow_up && (
                <span className={cn('flex items-center gap-1', followUpOverdue && 'text-red-600 font-medium')}>
                  <Calendar className="h-3.5 w-3.5" />
                  Follow-up: {formatDate(lead.next_follow_up)}
                  {followUpOverdue && ' (overdue)'}
                </span>
              )}
              {daysInCurrentStage > 0 && (
                <span className="text-slate-400">
                  {daysInCurrentStage}d in stage
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline stage stepper */}
      {entityType === 'lead' && stages.length > 0 && (
        <div className="px-4 pb-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              {stages.map((stage, idx) => {
                const isCurrent = stage.id === lead?.stage_id
                const isPast = idx < currentStageIndex
                const isWin = stage.is_win_stage
                const isLost = stage.is_lost_stage

                return (
                  <Tooltip key={stage.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleStageClick(stage.id)}
                        disabled={isConverted || updateLeadStage.isPending}
                        className={cn(
                          'flex-1 h-2 rounded-full transition-all duration-200 cursor-pointer hover:opacity-80',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          isCurrent && 'h-3 ring-2 ring-offset-1',
                          isLost && 'opacity-40'
                        )}
                        style={{
                          backgroundColor: isPast || isCurrent
                            ? (stage.color ?? '#6b7280')
                            : '#e2e8f0',
                          ...(isCurrent ? { ringColor: stage.color ?? '#6b7280' } : {}),
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-xs">
                      <p className="font-medium">{stage.name}</p>
                      {isWin && <p className="text-green-600">Win stage</p>}
                      {isLost && <p className="text-red-600">Lost stage</p>}
                      {stage.win_probability != null && (
                        <p className="text-slate-500">{stage.win_probability}% probability</p>
                      )}
                      <StageAutomationHint stageId={stage.id} stageName={stage.name} />
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Stage history metrics */}
      {entityType === 'lead' && <StageHistory />}

      <Separator />

      {/* Consultation outcome panel — lead mode */}
      {entityType === 'lead' && !isConverted && <ConsultationOutcomePanel />}

      {/* Meeting outcome buttons — matter mode */}
      {entityType === 'matter' && <MatterOutcomes />}
    </div>
  )
}
