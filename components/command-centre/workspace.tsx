'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useCommandCentre } from './command-centre-context'
import { useUpdateLead } from '@/lib/queries/leads'
import { LEAD_TEMPERATURES, CONTACT_SOURCES, PERSON_SCOPES } from '@/lib/utils/constants'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { ScreeningAnswers } from './panels/screening-answers'
import { MeetingNotes } from './panels/meeting-notes'
import { TaskPanel } from './panels/task-panel'
import { DocumentPanelSwitcher } from './panels/document-panel-switcher'
import { AppointmentPanel } from './panels/appointment-panel'
import { RetainerBuilder } from './panels/retainer-builder'
import { CrsCalculatorPanel } from './panels/crs-calculator-panel'
import { CallLogPanel } from './panels/call-log-panel'
import { MatterStatusPanel } from './panels/matter-status-panel'
import { CommunicationsPanel } from './panels/communications-panel'
import { DocumentStatusPanel } from './panels/document-status-panel'
import { RiskPanel } from './panels/risk-panel'
import { IntakeWizardPanel } from './panels/intake-wizard-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle,
  Briefcase,
  Radio,
  Calendar,
  UserCheck,
  Eye,
  FileText,
  Users,
  MapPin,
  ShieldAlert,
  History,
  BadgeInfo,
  Globe,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────

interface CoreDataForm {
  temperature: string
  practice_area_id: string
  matter_type_id: string
  person_scope: string
  source: string
  next_follow_up: string
  assigned_to: string
  reviewer_id: string
  // Immigration intelligence fields (stored in custom_fields)
  client_location: string       // 'inland' | 'outside' | ''
  immigration_status: string    // visitor, student, worker, pr, citizen, refugee, no_status, etc.
  has_refusals: string          // 'yes' | 'no' | ''
  has_criminality: string       // 'yes' | 'no' | ''
  has_misrepresentation: string // 'yes' | 'no' | ''
}

// ─── Debounce hook ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [timeoutRef])

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => callback(...args), delay)
    }) as T,
    [callback, delay, timeoutRef]
  )
}

// ─── Component ──────────────────────────────────────────────────────

// CRS calculator shows when the selected matter type is a point-based program
const CRS_MATTER_TYPE_PATTERNS = /express.?entry|pnp|provincial/i

export function Workspace() {
  const {
    entityType,
    entityId,
    lead,
    tenantId,
    users,
    practiceAreas,
    isConverted,
  } = useCommandCentre()

  // Determine if CRS calculator should show based on matter type name
  const { data: allMatterTypes } = useMatterTypes(tenantId, lead?.practice_area_id || undefined)
  const showCrsCalculator = useMemo(() => {
    if (!lead?.matter_type_id || !allMatterTypes) return false
    const mt = allMatterTypes.find((m) => m.id === lead.matter_type_id)
    return mt ? CRS_MATTER_TYPE_PATTERNS.test(mt.name) : false
  }, [lead?.matter_type_id, allMatterTypes])

  // Matter workspace — enhanced panels for Phase 4
  if (entityType === 'matter') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Matter Status + Risk (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MatterStatusPanel />
          <RiskPanel />
        </div>

        {/* Communications + Documents (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CommunicationsPanel />
          <DocumentStatusPanel />
        </div>

        {/* Notes + Call Log (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MeetingNotes />
          <CallLogPanel />
        </div>

        {/* Tasks + Appointments (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TaskPanel />
          <AppointmentPanel />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Core Data Card */}
      <CoreDataCard
        lead={lead}
        entityId={entityId}
        tenantId={tenantId}
        users={users}
        practiceAreas={practiceAreas}
        isConverted={isConverted}
      />

      {/* Interactive Intake Wizard */}
      <IntakeWizardPanel />

      {/* CRS Calculator — only for point-based programs (Express Entry, PNP) */}
      {showCrsCalculator && <CrsCalculatorPanel />}

      {/* Screening + Documents (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScreeningAnswers />
        <DocumentPanelSwitcher />
      </div>

      {/* Notes + Call Log (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MeetingNotes />
        <CallLogPanel />
      </div>

      {/* Tasks + Appointments (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskPanel />
        <AppointmentPanel />
      </div>

      {/* Retainer Builder — visible once matter type is selected, hidden for closed/declined leads */}
      {lead?.matter_type_id && !['closed_no_response', 'closed_retainer_not_signed', 'closed_client_declined', 'closed_not_a_fit', 'converted'].includes(lead?.current_stage ?? '') && (
        <div id="retainer-builder-section">
          <RetainerBuilder />
        </div>
      )}

      {/* Retainer guidance — shown when no matter type is set yet (new leads) */}
      {!lead?.matter_type_id && !isConverted && !['closed_no_response', 'closed_retainer_not_signed', 'closed_client_declined', 'closed_not_a_fit'].includes(lead?.current_stage ?? '') && (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="py-6 flex flex-col items-center text-center gap-2">
            <FileText className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Retainer Package</p>
            <p className="text-xs text-slate-500 max-w-md">
              To create a retainer, select <strong>Send Retainer</strong> in the consultation outcome panel above. This will set the matter type, assign a lawyer, and prepare the retainer package.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Core Data Card ─────────────────────────────────────────────────

interface CoreDataCardProps {
  lead: ReturnType<typeof useCommandCentre>['lead']
  entityId: string
  tenantId: string
  users: ReturnType<typeof useCommandCentre>['users']
  practiceAreas: ReturnType<typeof useCommandCentre>['practiceAreas']
  isConverted: boolean
}

function CoreDataCard({ lead, entityId, tenantId, users, practiceAreas, isConverted }: CoreDataCardProps) {
  const updateLead = useUpdateLead()

  const customFields = (lead?.custom_fields ?? {}) as Record<string, unknown>

  // Skip-watch ref: prevents watcher from firing for fields being saved atomically
  const skipWatchRef = useMemo(() => ({ current: new Set<string>() }), [])

  const { register, setValue, watch, reset } = useForm<CoreDataForm>({
    defaultValues: {
      temperature: lead?.temperature ?? 'warm',
      practice_area_id: lead?.practice_area_id ?? '',
      matter_type_id: lead?.matter_type_id ?? '',
      person_scope: lead?.person_scope ?? 'single',
      source: lead?.source ?? '',
      next_follow_up: lead?.next_follow_up?.split('T')[0] ?? '',
      assigned_to: lead?.assigned_to ?? '',
      reviewer_id: (customFields.reviewer_id as string) ?? '',
      client_location: (customFields.client_location as string) ?? '',
      immigration_status: (customFields.immigration_status as string) ?? '',
      has_refusals: (customFields.has_refusals as string) ?? '',
      has_criminality: (customFields.has_criminality as string) ?? '',
      has_misrepresentation: (customFields.has_misrepresentation as string) ?? '',
    },
  })

  // Sync form when lead data loads/changes
  useEffect(() => {
    if (lead) {
      const cf = (lead.custom_fields ?? {}) as Record<string, unknown>
      reset({
        temperature: lead.temperature ?? 'warm',
        practice_area_id: lead.practice_area_id ?? '',
        matter_type_id: lead.matter_type_id ?? '',
        person_scope: lead.person_scope ?? 'single',
        source: lead.source ?? '',
        next_follow_up: lead.next_follow_up?.split('T')[0] ?? '',
        assigned_to: lead.assigned_to ?? '',
        reviewer_id: (cf.reviewer_id as string) ?? '',
        client_location: (cf.client_location as string) ?? '',
        immigration_status: (cf.immigration_status as string) ?? '',
        has_refusals: (cf.has_refusals as string) ?? '',
        has_criminality: (cf.has_criminality as string) ?? '',
        has_misrepresentation: (cf.has_misrepresentation as string) ?? '',
      })
    }
  }, [lead, reset])

  // Debounced autosave
  const debouncedSave = useDebouncedCallback(
    useCallback(
      (field: string, value: string) => {
        if (!lead || isConverted) return

        const updates: Record<string, unknown> = {}

        if (['reviewer_id', 'client_location', 'immigration_status', 'has_refusals', 'has_criminality', 'has_misrepresentation'].includes(field)) {
          // Store in custom_fields JSON
          const cf = (lead.custom_fields ?? {}) as Record<string, unknown>
          const cleanValue = value && value !== 'none' ? value : null
          updates.custom_fields = { ...cf, [field]: cleanValue }
        } else if (field === 'matter_type_id') {
          updates[field] = value || null
        } else if (field === 'person_scope') {
          updates[field] = value || 'single'
        } else if (field === 'next_follow_up') {
          updates[field] = value || null
        } else if (field === 'practice_area_id' || field === 'assigned_to') {
          updates[field] = value || null
        } else {
          updates[field] = value || null
        }

        updateLead.mutate({ id: entityId, ...updates })
      },
      [lead, isConverted, entityId, updateLead]
    ),
    800
  )

  // Watch for changes — skip fields in skipWatchRef
  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name && value[name] !== undefined) {
        if (skipWatchRef.current.has(name)) {
          skipWatchRef.current.delete(name)
          return
        }
        debouncedSave(name, value[name] as string)
      }
    })
    return () => subscription.unsubscribe()
  }, [watch, debouncedSave, skipWatchRef])

  const watchedPracticeAreaId = watch('practice_area_id')
  const watchedMatterTypeId = watch('matter_type_id')

  // Matter types — filtered by practice area when selected, all types when not
  const { data: matterTypes } = useMatterTypes(tenantId, watchedPracticeAreaId || undefined)

  // Handle practice area change: clear matter type atomically
  const handlePracticeAreaChange = useCallback(
    (val: string) => {
      skipWatchRef.current.add('practice_area_id')
      skipWatchRef.current.add('matter_type_id')
      setValue('practice_area_id', val)
      setValue('matter_type_id', '')
      if (!isConverted && lead) {
        updateLead.mutate({
          id: entityId,
          practice_area_id: val || null,
          matter_type_id: null,
        })
      }
    },
    [lead, isConverted, entityId, updateLead, setValue, skipWatchRef]
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <Briefcase className="h-4 w-4" />
          Core Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Practice Area — always first */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              Practice Area
            </Label>
            <Select
              value={watch('practice_area_id')}
              onValueChange={handlePracticeAreaChange}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {practiceAreas.map((pa) => (
                  <SelectItem key={pa.id} value={pa.id}>
                    {pa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Matter Type — the key field that drives all automation */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Matter Type
            </Label>
            <Select
              value={watchedMatterTypeId}
              onValueChange={(val) => setValue('matter_type_id', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {(matterTypes ?? []).map((mt) => (
                  <SelectItem key={mt.id} value={mt.id}>
                    {mt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!matterTypes?.length && watchedPracticeAreaId && (
              <p className="text-xs text-slate-400">No matter types for this practice area</p>
            )}
          </div>

          {/* Person Scope */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Person Scope
            </Label>
            <Select
              value={watch('person_scope')}
              onValueChange={(val) => setValue('person_scope', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_SCOPES.map((ps) => (
                  <SelectItem key={ps.value} value={ps.value}>
                    {ps.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Case Priority (formerly Temperature) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Case Priority
            </Label>
            <Select
              value={watch('temperature')}
              onValueChange={(val) => setValue('temperature', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TEMPERATURES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source — read from lead (set at front desk intake); editable if needed */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Radio className="h-3 w-3" />
              Source
            </Label>
            <Select
              value={watch('source')}
              onValueChange={(val) => setValue('source', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {/* Always include the current value even if it came from front desk */}
                {watch('source') && !CONTACT_SOURCES.includes(watch('source') as typeof CONTACT_SOURCES[number]) && (
                  <SelectItem value={watch('source')}>{watch('source')}</SelectItem>
                )}
                {CONTACT_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next Follow-up */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Follow-up
            </Label>
            <Input
              type="date"
              className="h-9 text-sm"
              disabled={isConverted}
              {...register('next_follow_up')}
            />
          </div>

          {/* Assigned To */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <UserCheck className="h-3 w-3" />
              Assigned To
            </Label>
            <Select
              value={watch('assigned_to')}
              onValueChange={(val) => setValue('assigned_to', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reviewer / Checker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Reviewer
            </Label>
            <Select
              value={watch('reviewer_id')}
              onValueChange={(val) => setValue('reviewer_id', val)}
              disabled={isConverted}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Immigration Intelligence ──────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Globe className="h-3 w-3" />
            Immigration Intelligence
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

            {/* Client Location — drives JR deadlines (15d inland / 60d outside) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Client Location
              </Label>
              <Select
                value={watch('client_location')}
                onValueChange={(val) => setValue('client_location', val)}
                disabled={isConverted}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inland">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      Inland — Inside Canada
                    </span>
                  </SelectItem>
                  <SelectItem value="outside">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      Outside Canada
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {watch('client_location') === 'inland' && (
                <p className="text-[10px] text-blue-600 font-medium">JR deadline: 15 days from refusal</p>
              )}
              {watch('client_location') === 'outside' && (
                <p className="text-[10px] text-amber-600 font-medium">JR deadline: 60 days from refusal</p>
              )}
            </div>

            {/* Immigration Status in Canada */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <BadgeInfo className="h-3 w-3" />
                Current Status
              </Label>
              <Select
                value={watch('immigration_status')}
                onValueChange={(val) => setValue('immigration_status', val)}
                disabled={isConverted}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visitor">Visitor / Tourist</SelectItem>
                  <SelectItem value="student">Study Permit Holder</SelectItem>
                  <SelectItem value="worker">Work Permit Holder</SelectItem>
                  <SelectItem value="pgwp">PGWP Holder</SelectItem>
                  <SelectItem value="pr">Permanent Resident</SelectItem>
                  <SelectItem value="citizen">Canadian Citizen</SelectItem>
                  <SelectItem value="refugee_claimant">Refugee Claimant</SelectItem>
                  <SelectItem value="protected_person">Protected Person</SelectItem>
                  <SelectItem value="no_status">No Status / Undocumented</SelectItem>
                  <SelectItem value="implied_status">Implied Status</SelectItem>
                  <SelectItem value="abrod">Abroad — Never Entered</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Previous Refusals */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <History className="h-3 w-3" />
                Previous Refusals?
              </Label>
              <Select
                value={watch('has_refusals')}
                onValueChange={(val) => setValue('has_refusals', val)}
                disabled={isConverted}
              >
                <SelectTrigger className={`h-9 text-sm ${watch('has_refusals') === 'yes' ? 'border-amber-400 bg-amber-50' : ''}`}>
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes — has refusal history</SelectItem>
                  <SelectItem value="unknown">Unknown / Not Asked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Criminality / Inadmissibility */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Criminality / Inadmissibility?
              </Label>
              <Select
                value={watch('has_criminality')}
                onValueChange={(val) => setValue('has_criminality', val)}
                disabled={isConverted}
              >
                <SelectTrigger className={`h-9 text-sm ${watch('has_criminality') === 'yes' ? 'border-red-400 bg-red-50' : ''}`}>
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes — criminal/security record</SelectItem>
                  <SelectItem value="possible">Possible — needs review</SelectItem>
                  <SelectItem value="unknown">Unknown / Not Asked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Misrepresentation */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Misrepresentation Finding?
              </Label>
              <Select
                value={watch('has_misrepresentation')}
                onValueChange={(val) => setValue('has_misrepresentation', val)}
                disabled={isConverted}
              >
                <SelectTrigger className={`h-9 text-sm ${watch('has_misrepresentation') === 'yes' ? 'border-red-400 bg-red-50' : ''}`}>
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes — s.40 finding / ban active</SelectItem>
                  <SelectItem value="possible">Possible — needs review</SelectItem>
                  <SelectItem value="unknown">Unknown / Not Asked</SelectItem>
                </SelectContent>
              </Select>
              {watch('has_misrepresentation') === 'yes' && (
                <p className="text-[10px] text-red-600 font-medium">⚠ 5-year ban applies — verify expiry</p>
              )}
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  )
}
