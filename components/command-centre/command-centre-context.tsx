'use client'

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { useLead } from '@/lib/queries/leads'
import { useMatter } from '@/lib/queries/matters'
import { useCreateNote } from '@/lib/queries/notes'
import { useEnabledPracticeAreas, type EnabledPracticeArea } from '@/lib/queries/practice-areas'
import { frontDeskKeys } from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatElapsed, formatTimeHM, formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']
type Matter = Database['public']['Tables']['matters']['Row']
type Contact = Database['public']['Tables']['contacts']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

// ─── Context Value ─────────────────────────────────────────────────

export interface CommandCentreContextValue {
  entityType: 'lead' | 'matter'
  entityId: string
  lead: Lead | null
  matter: Matter | null
  contact: Contact | null
  tenantId: string
  userId: string
  stages: PipelineStage[]
  currentStage: PipelineStage | null
  users: UserRow[]
  practiceAreas: EnabledPracticeArea[]
  isConverted: boolean
  convertedMatterId: string | null
  isLoading: boolean
  // Meeting timer
  timerRunning: boolean
  timerElapsed: number
  startMeetingTimer: () => void
  stopMeetingTimer: () => Promise<void>
}

const CommandCentreContext = createContext<CommandCentreContextValue | null>(null)

// ─── Hook ──────────────────────────────────────────────────────────

export function useCommandCentre() {
  const ctx = useContext(CommandCentreContext)
  if (!ctx) throw new Error('useCommandCentre must be used within CommandCentreProvider')
  return ctx
}

// ─── Provider ──────────────────────────────────────────────────────

interface ProviderProps {
  entityType: 'lead' | 'matter'
  entityId: string
  children: ReactNode
}

export function CommandCentreProvider({ entityType, entityId, children }: ProviderProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''
  const queryClient = useQueryClient()

  // ── Lead data ─────────────────────────────────────────────────
  const { data: lead, isLoading: leadLoading } = useLead(entityType === 'lead' ? entityId : '')

  // ── Matter data ───────────────────────────────────────────────
  const matterId = entityType === 'matter' ? entityId : (lead?.converted_matter_id ?? '')
  const { data: matter, isLoading: matterLoading } = useMatter(matterId)

  // ── Contact ───────────────────────────────────────────────────
  // For leads: use lead.contact_id directly
  // For matters: look up the primary client via matter_contacts
  const leadContactId = entityType === 'lead' ? lead?.contact_id : null

  const { data: matterClientContactId } = useQuery({
    queryKey: ['matter-client-contact', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('role', 'client')
        .limit(1)
        .maybeSingle()
      return data?.contact_id ?? null
    },
    enabled: entityType === 'matter' && !!matterId,
  })

  const contactId = leadContactId ?? matterClientContactId ?? null
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contacts', 'detail', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId!)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!contactId,
  })

  // ── Pipeline stages (for leads) ──────────────────────────────
  const pipelineId = lead?.pipeline_id ?? ''
  const { data: stagesData } = useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('sort_order')
      if (error) throw error
      return data as PipelineStage[]
    },
    enabled: !!pipelineId,
  })
  const stages = stagesData ?? []
  const currentStage = stages.find((s) => s.id === lead?.stage_id) ?? null

  // ── Users ─────────────────────────────────────────────────────
  const { data: usersData } = useQuery({
    queryKey: ['users', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
      if (error) throw error
      return data as UserRow[]
    },
    enabled: !!tenantId,
  })

  // ── Practice areas (shared hook  -  cached 5min, eliminates duplicate query) ──
  const { data: practiceAreasData } = useEnabledPracticeAreas(tenantId || undefined)

  // ── Computed values ───────────────────────────────────────────
  const isConverted = entityType === 'lead' && lead?.status === 'converted'
  const convertedMatterId = lead?.converted_matter_id ?? null
  const isLoading = entityType === 'lead' ? leadLoading || contactLoading : matterLoading || contactLoading

  // ── Meeting Timer ───────────────────────────────────────────
  const createNote = useCreateNote()
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastInteractionRef = useRef<number>(Date.now())
  const hourNotificationShownRef = useRef(false)

  const contactName = contact
    ? contact.contact_type === 'organization'
      ? contact.organization_name ?? 'Client'
      : `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Client'
    : 'Client'

  // Track user interaction for inactivity check
  useEffect(() => {
    if (!timerRunning) return

    const updateInteraction = () => {
      lastInteractionRef.current = Date.now()
    }

    window.addEventListener('mousemove', updateInteraction, { passive: true })
    window.addEventListener('mousedown', updateInteraction)
    window.addEventListener('keydown', updateInteraction)
    window.addEventListener('scroll', updateInteraction, true)

    return () => {
      window.removeEventListener('mousemove', updateInteraction)
      window.removeEventListener('mousedown', updateInteraction)
      window.removeEventListener('keydown', updateInteraction)
      window.removeEventListener('scroll', updateInteraction, true)
    }
  }, [timerRunning])

  // Timer tick interval + 1-hour inactivity check
  useEffect(() => {
    if (timerRunning && timerStartTime) {
      timerIntervalRef.current = setInterval(() => {
        const now = Date.now()
        setTimerElapsed(now - timerStartTime.getTime())

        // Check 1-hour inactivity
        const inactiveMs = now - lastInteractionRef.current
        if (inactiveMs >= 3600000 && !hourNotificationShownRef.current) {
          hourNotificationShownRef.current = true
          toast('Meeting running for over 1 hour', {
            description: 'Is the meeting still going?',
            duration: Infinity,
            action: {
              label: 'Still going',
              onClick: () => {
                lastInteractionRef.current = Date.now()
                hourNotificationShownRef.current = false
              },
            },
          })
        }
      }, 1000)
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [timerRunning, timerStartTime])

  const startMeetingTimer = useCallback(() => {
    const now = new Date()
    setTimerStartTime(now)
    setTimerElapsed(0)
    setTimerRunning(true)
    lastInteractionRef.current = Date.now()
    hourNotificationShownRef.current = false
    toast.success(`Meeting timer started at ${formatTimeHM(now)}`)

    // Acknowledge the check-in for this contact so it leaves the front desk queue
    if (contactId) {
      const supabase = createClient()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      supabase
        .from('check_in_sessions')
        .update({ status: 'acknowledged' })
        .eq('contact_id', contactId)
        .not('status', 'in', '("acknowledged","completed","abandoned")')
        .gte('created_at', todayStart.toISOString())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: frontDeskKeys.checkIns(tenantId) })
          queryClient.invalidateQueries({ queryKey: frontDeskKeys.stats(tenantId) })
        })
    }
  }, [contactId, tenantId, queryClient])

  const stopMeetingTimer = useCallback(async () => {
    if (!timerStartTime) return
    const endTime = new Date()
    const duration = endTime.getTime() - timerStartTime.getTime()

    // Stop the timer
    setTimerRunning(false)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

    // Create a note with the meeting duration
    const dateStr = formatDate(timerStartTime)
    const startStr = formatTimeHM(timerStartTime)
    const endStr = formatTimeHM(endTime)
    const durationStr = formatElapsed(duration)

    const noteContent = `## Meeting Log  -  ${dateStr}\n\n**Client:** ${contactName}\n**Date:** ${dateStr}\n**Start:** ${startStr}\n**End:** ${endStr}\n**Duration:** ${durationStr}\n\n### Discussion Summary\n- \n\n### Key Decisions\n- \n\n### Action Items\n- [ ] \n`

    try {
      await createNote.mutateAsync({
        tenant_id: tenantId,
        lead_id: entityId,
        content: noteContent,
        is_pinned: false,
      })
      toast.success(`Meeting ended (${durationStr}). Note created.`)
    } catch {
      toast.error('Failed to create meeting note')
    }

    // Reset
    setTimerStartTime(null)
    setTimerElapsed(0)
    hourNotificationShownRef.current = false
  }, [timerStartTime, contactName, tenantId, entityId, createNote])

  const value: CommandCentreContextValue = {
    entityType,
    entityId,
    lead: lead ?? null,
    matter: matter ?? null,
    contact: contact ?? null,
    tenantId,
    userId,
    stages,
    currentStage,
    users: usersData ?? [],
    practiceAreas: practiceAreasData ?? [],
    isConverted,
    convertedMatterId,
    isLoading,
    timerRunning,
    timerElapsed,
    startMeetingTimer,
    stopMeetingTimer,
  }

  return (
    <CommandCentreContext.Provider value={value}>
      {children}
    </CommandCentreContext.Provider>
  )
}
