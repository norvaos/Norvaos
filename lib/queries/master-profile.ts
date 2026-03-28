/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  THE GOLDEN THREAD — Master Engagement Profile
 *  Protocol: ZIA-GOLDEN-001
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Fuses the Contact (The Person) and Lead (The Engagement) into a single
 *  reactive query object for the Command Centre. Zero breaking changes to
 *  underlying tables — this is a UI-layer virtual merge.
 *
 *  Gate evaluation is computed from live data, not stored state.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useLead, leadKeys } from '@/lib/queries/leads'
import { useLatestConflictScan, type LatestScanData } from '@/lib/queries/conflicts'
import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']
type Contact = Database['public']['Tables']['contacts']['Row']

// ─── Gate Status Types ───────────────────────────────────────────────────────

export type GateStatus = 'locked' | 'active' | 'passed' | 'blocked' | 'overridden'

export interface GateState {
  key: 'conflict_check' | 'strategy_meeting' | 'id_capture' | 'retainer'
  label: string
  status: GateStatus
  requiredStatuses: string[]
  currentValue: string | null
  passedAt: string | null
  overrideId: string | null
}

export interface GoldenThreadState {
  gates: [GateState, GateState, GateState, GateState]
  activeGateIndex: number
  isComplete: boolean
  overrideCount: number
}

// ─── Master Profile Interface ────────────────────────────────────────────────

export interface MasterProfile {
  /** The Person — from contacts table */
  person: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    dob: string | null
    nationality: string | null
    immigrationStatus: string | null
    address: string | null
    conflictStatus: string | null
    identityVerified: boolean
  }
  /** The Engagement — from leads table */
  engagement: {
    id: string
    stage: string | null
    currentStage: string | null
    pipelineId: string | null
    source: string | null
    temperature: string | null
    assignedTo: string | null
    practiceAreaId: string | null
    matterTypeId: string | null
    estimatedValue: number | null
    retainerStatus: string | null
    paymentStatus: string | null
    status: string | null
    createdAt: string | null
  }
  /** The Golden Thread — sequential gate state machine */
  goldenThread: GoldenThreadState
  /** Raw data for downstream consumers (preserves full row access) */
  _raw: {
    lead: Lead
    contact: Contact | null
    conflictScan: LatestScanData
    completedMeetingCount: number
    identityVerified: boolean
    activeOverrides: Array<{ id: string; blocked_node: string; created_at: string }>
  }
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const masterProfileKeys = {
  all: ['master-profile'] as const,
  detail: (leadId: string) => [...masterProfileKeys.all, leadId] as const,
  meetings: (contactId: string) => [...masterProfileKeys.all, 'meetings', contactId] as const,
  identity: (contactId: string) => [...masterProfileKeys.all, 'identity', contactId] as const,
  overrides: (leadId: string) => [...masterProfileKeys.all, 'overrides', leadId] as const,
}

// ─── Sub-Queries ─────────────────────────────────────────────────────────────

/**
 * Fetches completed meeting count for a contact.
 * Gate B requires at least one completed appointment with a logged outcome.
 */
function useCompletedMeetings(contactId: string) {
  return useQuery({
    queryKey: masterProfileKeys.meetings(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .eq('status', 'completed')

      if (error) throw error
      return count ?? 0
    },
    enabled: !!contactId,
    staleTime: 1000 * 30, // 30s — meetings don't change often mid-session
  })
}

/**
 * Checks if the contact has a verified identity.
 * Gate C requires either:
 *   - A check_in_sessions row with status 'identity_verified'
 *   - Or a verified identity_verifications record
 */
function useIdentityVerification(contactId: string) {
  return useQuery({
    queryKey: masterProfileKeys.identity(contactId),
    queryFn: async () => {
      const supabase = createClient()

      // Check check_in_sessions for identity_verified status
      const { data: sessions, error: sessErr } = await supabase
        .from('check_in_sessions')
        .select('id')
        .eq('contact_id', contactId)
        .eq('status', 'identity_verified')
        .limit(1)

      if (sessErr) throw sessErr
      if (sessions && sessions.length > 0) return true

      // Fallback: check field_verifications for a verified identity document
      const { data: verifications, error: verErr } = await supabase
        .from('field_verifications')
        .select('id')
        .eq('contact_id', contactId)
        .eq('verification_status', 'verified')
        .limit(1)

      if (verErr) {
        // Table may not exist yet — graceful fallback
        console.warn('[MasterProfile] field_verifications query failed (non-fatal):', verErr.message)
        return false
      }
      return (verifications?.length ?? 0) > 0
    },
    enabled: !!contactId,
    staleTime: 1000 * 30,
  })
}

/**
 * Fetches active Golden Thread overrides for a lead.
 * These are compliance_overrides where blocked_node starts with 'golden_thread.'
 */
function useGoldenThreadOverrides(leadId: string) {
  return useQuery({
    queryKey: masterProfileKeys.overrides(leadId),
    queryFn: async () => {
      const supabase = createClient()

      // Query compliance_overrides for golden_thread gate bypasses
      const { data, error } = await supabase
        .from('compliance_overrides')
        .select('id, blocked_node, created_at')
        .eq('override_type', 'golden_thread_gate_bypass')
        .eq('is_active', true)
        .like('blocked_node', 'golden_thread.%')

      if (error) {
        // Table may not have this override_type yet — graceful fallback
        console.warn('[MasterProfile] Override query failed (non-fatal):', error.message)
        return []
      }

      return (data ?? []) as Array<{ id: string; blocked_node: string; created_at: string }>
    },
    enabled: !!leadId,
    staleTime: 1000 * 15,
  })
}

// ─── Gate Evaluation Engine ──────────────────────────────────────────────────

/**
 * Pure function — evaluates the 4 Golden Thread gates from raw data.
 * No side effects. No network calls. Deterministic.
 */
function evaluateGoldenThread(
  conflictScan: LatestScanData | undefined,
  contactConflictStatus: string | null,
  completedMeetingCount: number,
  identityVerified: boolean,
  retainerStatus: string | null,
  paymentStatus: string | null,
  overrides: Array<{ id: string; blocked_node: string; created_at: string }>,
): GoldenThreadState {

  // Helper: check if a gate has an active override
  const getOverride = (gateKey: string) =>
    overrides.find((o) => o.blocked_node === `golden_thread.${gateKey}`) ?? null

  // ── Gate A: Conflict Check ──────────────────────────────────────────────
  const conflictOverride = getOverride('conflict_check')
  const conflictPassedStatuses = ['cleared', 'auto_scan_complete', 'cleared_by_lawyer', 'waiver_obtained']
  const conflictBlockedStatuses = ['review_required', 'blocked']

  let conflictCurrentValue = contactConflictStatus ?? 'not_run'
  // Also check scan data if contact status is stale
  if (conflictScan?.scan?.status === 'completed' && conflictScan.matches.length === 0) {
    conflictCurrentValue = 'cleared'
  }

  let gateAStatus: GateStatus = 'active' // Gate A is always accessible
  if (conflictOverride) {
    gateAStatus = 'overridden'
  } else if (conflictPassedStatuses.includes(conflictCurrentValue)) {
    gateAStatus = 'passed'
  } else if (conflictBlockedStatuses.includes(conflictCurrentValue)) {
    gateAStatus = 'blocked'
  }

  const gateA: GateState = {
    key: 'conflict_check',
    label: 'Conflict Check',
    status: gateAStatus,
    requiredStatuses: ['cleared', 'waiver_obtained'],
    currentValue: conflictCurrentValue,
    passedAt: gateAStatus === 'passed' && conflictScan?.scan?.created_at
      ? conflictScan.scan.created_at
      : null,
    overrideId: conflictOverride?.id ?? null,
  }

  // ── Gate B: Strategy Meeting ────────────────────────────────────────────
  const meetingOverride = getOverride('strategy_meeting')
  const gateAUnlocked = gateAStatus === 'passed' || gateAStatus === 'overridden'

  let gateBStatus: GateStatus = 'locked'
  if (!gateAUnlocked) {
    gateBStatus = 'locked'
  } else if (meetingOverride) {
    gateBStatus = 'overridden'
  } else if (completedMeetingCount > 0) {
    gateBStatus = 'passed'
  } else {
    gateBStatus = 'active'
  }

  const gateB: GateState = {
    key: 'strategy_meeting',
    label: 'Strategy Meeting',
    status: gateBStatus,
    requiredStatuses: ['completed'],
    currentValue: completedMeetingCount > 0 ? 'completed' : (gateAUnlocked ? 'not_scheduled' : null),
    passedAt: null, // Appointment timestamps not fetched here for efficiency
    overrideId: meetingOverride?.id ?? null,
  }

  // ── Gate C: ID Capture ──────────────────────────────────────────────────
  const idOverride = getOverride('id_capture')
  const gateBUnlocked = gateBStatus === 'passed' || gateBStatus === 'overridden'

  let gateCStatus: GateStatus = 'locked'
  if (!gateBUnlocked) {
    gateCStatus = 'locked'
  } else if (idOverride) {
    gateCStatus = 'overridden'
  } else if (identityVerified) {
    gateCStatus = 'passed'
  } else {
    gateCStatus = 'active'
  }

  const gateC: GateState = {
    key: 'id_capture',
    label: 'NorvaOS Capture',
    status: gateCStatus,
    requiredStatuses: ['verified'],
    currentValue: identityVerified ? 'verified' : (gateBUnlocked ? 'not_started' : null),
    passedAt: null,
    overrideId: idOverride?.id ?? null,
  }

  // ── Gate D: Retainer ────────────────────────────────────────────────────
  const retainerOverride = getOverride('retainer')
  const gateCUnlocked = gateCStatus === 'passed' || gateCStatus === 'overridden'

  const retainerPassedStatuses = ['signed', 'paid', 'fully_retained']
  const retainerCurrentValue = retainerStatus ?? 'not_started'

  let gateDStatus: GateStatus = 'locked'
  if (!gateCUnlocked) {
    gateDStatus = 'locked'
  } else if (retainerOverride) {
    gateDStatus = 'overridden'
  } else if (retainerPassedStatuses.includes(retainerCurrentValue)) {
    gateDStatus = 'passed'
  } else {
    gateDStatus = 'active'
  }

  const gateD: GateState = {
    key: 'retainer',
    label: 'NorvaOS Retainer',
    status: gateDStatus,
    requiredStatuses: ['signed'],
    currentValue: gateCUnlocked ? retainerCurrentValue : null,
    passedAt: null,
    overrideId: retainerOverride?.id ?? null,
  }

  // ── Compute summary ─────────────────────────────────────────────────────
  const gates: [GateState, GateState, GateState, GateState] = [gateA, gateB, gateC, gateD]
  const activeGateIndex = gates.findIndex(
    (g) => g.status === 'active' || g.status === 'blocked'
  )
  const isComplete = gates.every((g) => g.status === 'passed' || g.status === 'overridden')
  const overrideCount = overrides.length

  return {
    gates,
    activeGateIndex: activeGateIndex === -1 ? (isComplete ? 3 : 0) : activeGateIndex,
    isComplete,
    overrideCount,
  }
}

// ─── Master Profile Hook ─────────────────────────────────────────────────────

/**
 * useMasterProfile — The Golden Thread data fusion hook.
 *
 * Composes:
 *   - useLead (existing)
 *   - Contact fetch (existing pattern from CommandCentreContext)
 *   - useLatestConflictScan (existing)
 *   - useCompletedMeetings (new — lightweight count query)
 *   - useIdentityVerification (new — boolean check)
 *   - useGoldenThreadOverrides (new — override check)
 *
 * Returns a unified MasterProfile with computed gate states.
 */
export function useMasterProfile(leadId: string): {
  data: MasterProfile | null
  isLoading: boolean
  error: Error | null
} {
  // ── 1. Lead data (existing hook) ────────────────────────────────────────
  const { data: lead, isLoading: leadLoading, error: leadError } = useLead(leadId)

  const contactId = lead?.contact_id ?? ''

  // ── 2. Contact data ─────────────────────────────────────────────────────
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contacts', 'detail', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!contactId,
  })

  // ── 3. Conflict scan data (existing hook) ───────────────────────────────
  const { data: conflictScan } = useLatestConflictScan(contactId)

  // ── 4. Completed meetings ───────────────────────────────────────────────
  const { data: completedMeetingCount } = useCompletedMeetings(contactId)

  // ── 5. Identity verification ────────────────────────────────────────────
  const { data: identityVerified } = useIdentityVerification(contactId)

  // ── 6. Golden Thread overrides ──────────────────────────────────────────
  const { data: overrides } = useGoldenThreadOverrides(leadId)

  // ── 7. Compute the Master Profile ───────────────────────────────────────
  const isLoading = leadLoading || contactLoading

  // Gate Zero Fix: If the lead exists but has no contact yet, we still
  // evaluate the Golden Thread so Gate A (Conflict Check) is always active.
  // No lead should ever exist without an active gate — this prevents blank
  // rendering on the /command/lead/ workspace.
  if (!lead) {
    return {
      data: null,
      isLoading,
      error: leadError as Error | null,
    }
  }

  const goldenThread = evaluateGoldenThread(
    conflictScan,
    contact?.conflict_status ?? null,
    completedMeetingCount ?? 0,
    identityVerified ?? false,
    lead.retainer_status ?? null,
    lead.payment_status ?? null,
    overrides ?? [],
  )

  const profile: MasterProfile = {
    person: {
      id: contact?.id ?? '',
      firstName: contact?.first_name ?? null,
      lastName: contact?.last_name ?? null,
      email: contact?.email_primary ?? null,
      phone: contact?.phone_primary ?? null,
      dob: contact?.date_of_birth ?? null,
      nationality: contact ? ((contact as Record<string, unknown>).nationality as string | null ?? null) : null,
      immigrationStatus: contact ? ((contact as Record<string, unknown>).immigration_status as string | null ?? null) : null,
      address: contact ? [contact.address_line1, contact.city, contact.province_state].filter(Boolean).join(', ') || null : null,
      conflictStatus: contact?.conflict_status ?? null,
      identityVerified: identityVerified ?? false,
    },
    engagement: {
      id: lead.id,
      stage: lead.stage_id,
      currentStage: lead.current_stage,
      pipelineId: lead.pipeline_id,
      source: lead.source,
      temperature: lead.temperature,
      assignedTo: lead.assigned_to,
      practiceAreaId: lead.practice_area_id,
      matterTypeId: lead.matter_type_id,
      estimatedValue: lead.estimated_value,
      retainerStatus: lead.retainer_status,
      paymentStatus: lead.payment_status,
      status: lead.status,
      createdAt: lead.created_at,
    },
    goldenThread,
    _raw: {
      lead,
      contact: contact ?? null,
      conflictScan: conflictScan ?? { scan: null, matches: [] },
      completedMeetingCount: completedMeetingCount ?? 0,
      identityVerified: identityVerified ?? false,
      activeOverrides: overrides ?? [],
    },
  }

  return {
    data: profile,
    isLoading,
    error: null,
  }
}

// ─── Gate Helper Utilities (for UI consumption) ──────────────────────────────

/** Returns true if the gate is actionable (not locked) */
export function isGateUnlocked(gate: GateState): boolean {
  return gate.status !== 'locked'
}

/** Returns true if the gate is definitively cleared */
export function isGatePassed(gate: GateState): boolean {
  return gate.status === 'passed' || gate.status === 'overridden'
}

/** Returns the CSS border colour class for a gate status */
export function getGateBorderClass(status: GateStatus): string {
  switch (status) {
    case 'locked': return 'border-slate-200 bg-slate-50/50'
    case 'active': return 'border-blue-500/30 bg-white'
    case 'passed': return 'border-emerald-500/30 bg-emerald-950/30/30'
    case 'overridden': return 'border-amber-500/30 bg-amber-950/30/30'
    case 'blocked': return 'border-red-500/30 bg-red-950/30/30'
    default: return 'border-slate-200'
  }
}

/** Returns the icon colour class for a gate status */
export function getGateIconClass(status: GateStatus): string {
  switch (status) {
    case 'locked': return 'text-slate-300'
    case 'active': return 'text-blue-500'
    case 'passed': return 'text-emerald-500'
    case 'overridden': return 'text-amber-500'
    case 'blocked': return 'text-red-500'
    default: return 'text-slate-300'
  }
}
