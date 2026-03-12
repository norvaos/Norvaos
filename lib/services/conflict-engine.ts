/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Conflict Engine — Scan, Score, Match & Decision Logic
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Searches contacts, matters (via matter_contacts), and leads for potential
 * conflicts. Uses weighted matching across name (exact + fuzzy via pg_trgm),
 * email, phone, address, DOB, and organization. Adverse party roles on matters
 * carry the highest weight.
 *
 * Conflict statuses:
 *   not_run → auto_scan_complete | review_suggested | review_required
 *   → cleared_by_lawyer | conflict_confirmed | waiver_required
 *   → waiver_obtained | blocked
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { logAuditServer } from '@/lib/queries/audit-logs'

// ─── Types ───────────────────────────────────────────────────────────────────

type ConflictScan = Database['public']['Tables']['conflict_scans']['Row']
type ConflictMatch = Database['public']['Tables']['conflict_matches']['Row']
type ConflictMatchInsert = Database['public']['Tables']['conflict_matches']['Insert']

export type ConflictStatus =
  | 'not_run'
  | 'auto_scan_complete'
  | 'review_suggested'
  | 'review_required'
  | 'cleared_by_lawyer'
  | 'conflict_confirmed'
  | 'waiver_required'
  | 'waiver_obtained'
  | 'blocked'

export type MatchCategory =
  | 'possible_duplicate'
  | 'adverse_party'
  | 'same_household'
  | 'related_corporate'
  | 'former_client'
  | 'shared_payor'
  | 'opposing_party'

export type TriggerType = 'manual' | 'auto_create' | 'auto_update' | 'pre_matter_open'

export type DecisionType =
  | 'no_conflict'
  | 'proceed_with_caution'
  | 'conflict_confirmed'
  | 'waiver_required'
  | 'waiver_obtained'
  | 'block_matter_opening'

export interface MatchReason {
  field: string
  our_value: string
  their_value: string
  similarity: number // 0–100
}

export interface ScanResult {
  scan: ConflictScan
  matches: ConflictMatch[]
}

// ─── Weight Configuration ────────────────────────────────────────────────────

const WEIGHTS = {
  exact_name: 30,
  fuzzy_name: 20,
  email_match: 25,
  phone_match: 20,
  address_match: 15,
  dob_match: 20,
  org_match: 15,
  adverse_party: 40,
  former_client: 25,
} as const

const FUZZY_NAME_THRESHOLD = 0.3 // pg_trgm similarity threshold

// ─── Run Conflict Scan ───────────────────────────────────────────────────────

export async function runConflictScan(
  supabase: SupabaseClient<Database>,
  params: {
    contactId: string
    tenantId: string
    triggeredBy: string
    triggerType: TriggerType
  }
): Promise<ScanResult> {
  const { contactId, tenantId, triggeredBy, triggerType } = params

  // 1. Fetch the contact being scanned
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .single()

  if (contactError || !contact) {
    throw new Error(`Contact not found: ${contactError?.message ?? 'unknown'}`)
  }

  // 2. Build search inputs snapshot
  const searchInputs = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    email_primary: contact.email_primary,
    email_secondary: contact.email_secondary,
    phone_primary: contact.phone_primary,
    phone_secondary: contact.phone_secondary,
    date_of_birth: contact.date_of_birth,
    address_line1: contact.address_line1,
    city: contact.city,
    organization_name: contact.organization_name,
  }

  // 3. Create scan record (status = running)
  const { data: scan, error: scanError } = await supabase
    .from('conflict_scans')
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      triggered_by: triggeredBy,
      trigger_type: triggerType,
      status: 'running',
      search_inputs: searchInputs,
      completed_at: null,
    })
    .select()
    .single()

  if (scanError || !scan) {
    throw new Error(`Failed to create scan: ${scanError?.message ?? 'unknown'}`)
  }

  try {
    // 4. Run all match queries
    const allMatches: ConflictMatchInsert[] = []

    // 4a. Contact name matches (exact + fuzzy)
    if (contact.first_name || contact.last_name) {
      const nameMatches = await findNameMatches(supabase, {
        tenantId,
        contactId,
        firstName: contact.first_name,
        lastName: contact.last_name,
        scanId: scan.id,
      })
      allMatches.push(...nameMatches)
    }

    // 4b. Email matches
    if (contact.email_primary || contact.email_secondary) {
      const emailMatches = await findEmailMatches(supabase, {
        tenantId,
        contactId,
        emailPrimary: contact.email_primary,
        emailSecondary: contact.email_secondary,
        scanId: scan.id,
      })
      allMatches.push(...emailMatches)
    }

    // 4c. Phone matches
    if (contact.phone_primary || contact.phone_secondary) {
      const phoneMatches = await findPhoneMatches(supabase, {
        tenantId,
        contactId,
        phonePrimary: contact.phone_primary,
        phoneSecondary: contact.phone_secondary,
        scanId: scan.id,
      })
      allMatches.push(...phoneMatches)
    }

    // 4d. Address matches
    if (contact.address_line1 && contact.city) {
      const addressMatches = await findAddressMatches(supabase, {
        tenantId,
        contactId,
        addressLine1: contact.address_line1,
        city: contact.city,
        scanId: scan.id,
      })
      allMatches.push(...addressMatches)
    }

    // 4e. DOB matches
    if (contact.date_of_birth) {
      const dobMatches = await findDobMatches(supabase, {
        tenantId,
        contactId,
        dateOfBirth: contact.date_of_birth,
        scanId: scan.id,
      })
      allMatches.push(...dobMatches)
    }

    // 4f. Organization matches
    if (contact.organization_name) {
      const orgMatches = await findOrgMatches(supabase, {
        tenantId,
        contactId,
        orgName: contact.organization_name,
        scanId: scan.id,
      })
      allMatches.push(...orgMatches)
    }

    // 4g. Adverse party matches (from matter_contacts)
    const adverseMatches = await findAdversePartyMatches(supabase, {
      tenantId,
      contactId,
      firstName: contact.first_name,
      lastName: contact.last_name,
      emailPrimary: contact.email_primary,
      scanId: scan.id,
    })
    allMatches.push(...adverseMatches)

    // 5. Deduplicate matches (same entity may match on multiple fields)
    const deduped = deduplicateMatches(allMatches)

    // 6. Insert matches
    let insertedMatches: ConflictMatch[] = []
    if (deduped.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('conflict_matches')
        .insert(deduped)
        .select()

      if (insertError) {
        console.error('[conflict-engine] Failed to insert matches:', insertError)
      }
      insertedMatches = inserted ?? []
    }

    // 7. Calculate score
    const score = calculateConflictScore(deduped)
    const status = scoreToStatus(score)

    // 8. Update scan record
    await supabase
      .from('conflict_scans')
      .update({
        score,
        match_count: deduped.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', scan.id)

    // 9. Update contact
    await supabase
      .from('contacts')
      .update({
        conflict_score: score,
        conflict_status: status,
      })
      .eq('id', contactId)

    // 10. Audit log
    await logAuditServer({
      supabase,
      tenantId,
      userId: triggeredBy,
      entityType: 'contact',
      entityId: contactId,
      action: 'conflict_scan_completed',
      changes: { score, match_count: deduped.length, status },
      metadata: { scan_id: scan.id, trigger_type: triggerType },
    }).catch(() => {}) // fire-and-forget

    // Return updated scan
    const { data: finalScan } = await supabase
      .from('conflict_scans')
      .select()
      .eq('id', scan.id)
      .single()

    return {
      scan: finalScan ?? { ...scan, score, match_count: deduped.length, status: 'completed' },
      matches: insertedMatches,
    }
  } catch (err) {
    // Mark scan as failed
    await supabase
      .from('conflict_scans')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', scan.id)

    throw err
  }
}

// ─── Record Conflict Decision ────────────────────────────────────────────────

export async function recordConflictDecision(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    scanId?: string
    decidedBy: string
    decision: DecisionType
    decisionScope?: string
    matterTypeId?: string
    notes?: string
    internalNote?: string
  }
): Promise<void> {
  const {
    tenantId,
    contactId,
    scanId,
    decidedBy,
    decision,
    decisionScope = 'contact',
    matterTypeId,
    notes,
    internalNote,
  } = params

  // 1. Insert decision
  const { error } = await supabase.from('conflict_decisions').insert({
    tenant_id: tenantId,
    contact_id: contactId,
    scan_id: scanId ?? null,
    decided_by: decidedBy,
    decision,
    decision_scope: decisionScope,
    matter_type_id: matterTypeId ?? null,
    notes: notes ?? null,
    internal_note: internalNote ?? null,
  })

  if (error) throw new Error(`Failed to record decision: ${error.message}`)

  // 2. Map decision to contact conflict_status
  const statusMap: Record<DecisionType, ConflictStatus> = {
    no_conflict: 'cleared_by_lawyer',
    proceed_with_caution: 'cleared_by_lawyer',
    conflict_confirmed: 'conflict_confirmed',
    waiver_required: 'waiver_required',
    waiver_obtained: 'waiver_obtained',
    block_matter_opening: 'blocked',
  }

  const newStatus = statusMap[decision]

  await supabase
    .from('contacts')
    .update({ conflict_status: newStatus })
    .eq('id', contactId)

  // 3. Audit log
  await logAuditServer({
    supabase,
    tenantId,
    userId: decidedBy,
    entityType: 'contact',
    entityId: contactId,
    action: 'conflict_decision_recorded',
    changes: { decision, conflict_status: newStatus },
    metadata: { scan_id: scanId, decision_scope: decisionScope },
  }).catch(() => {})

  // 4. Notify assigned staff (fire-and-forget)
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('responsible_lawyer_id')
      .eq('id', contactId)
      .single()

    if (contact?.responsible_lawyer_id && contact.responsible_lawyer_id !== decidedBy) {
      const { dispatchNotification } = await import('@/lib/services/notification-engine')
      await dispatchNotification(supabase, {
        tenantId,
        eventType: 'conflict_decision',
        recipientUserIds: [contact.responsible_lawyer_id],
        title: `Conflict decision recorded: ${decision.replace(/_/g, ' ')}`,
        message: notes || undefined,
        entityType: 'contact',
        entityId: contactId,
        priority: decision === 'block_matter_opening' ? 'high' : 'normal',
      })
    }
  } catch {
    // Non-blocking
  }
}

// ─── Gate Checks ─────────────────────────────────────────────────────────────

export function isConflictCleared(status: string): boolean {
  return status === 'cleared_by_lawyer' || status === 'waiver_obtained'
}

export function isScanStale(lastScanDate: string | null, dayThreshold = 30): boolean {
  if (!lastScanDate) return true
  const diff = Date.now() - new Date(lastScanDate).getTime()
  return diff > dayThreshold * 24 * 60 * 60 * 1000
}

// ─── Score Calculation ───────────────────────────────────────────────────────

export function calculateConflictScore(matches: ConflictMatchInsert[]): number {
  if (matches.length === 0) return 0

  let totalScore = 0

  for (const match of matches) {
    const reasons = (match.match_reasons ?? []) as unknown as MatchReason[]
    let matchScore = 0

    for (const reason of reasons) {
      switch (reason.field) {
        case 'exact_name':
          matchScore += WEIGHTS.exact_name
          break
        case 'fuzzy_name':
          matchScore += Math.round(WEIGHTS.fuzzy_name * (reason.similarity / 100))
          break
        case 'email':
          matchScore += WEIGHTS.email_match
          break
        case 'phone':
          matchScore += WEIGHTS.phone_match
          break
        case 'address':
          matchScore += WEIGHTS.address_match
          break
        case 'dob':
          matchScore += WEIGHTS.dob_match
          break
        case 'organization':
          matchScore += WEIGHTS.org_match
          break
        case 'adverse_party':
          matchScore += WEIGHTS.adverse_party
          break
        case 'former_client':
          matchScore += WEIGHTS.former_client
          break
      }
    }

    totalScore = Math.max(totalScore, matchScore)
  }

  return Math.min(totalScore, 100)
}

function scoreToStatus(score: number): ConflictStatus {
  if (score >= 50) return 'review_required'
  if (score >= 25) return 'review_suggested'
  return 'auto_scan_complete'
}

// ─── Match Finders ───────────────────────────────────────────────────────────

async function findNameMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    firstName: string | null
    lastName: string | null
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, firstName, lastName, scanId } = params
  const matches: ConflictMatchInsert[] = []

  if (!firstName && !lastName) return matches

  // Exact name match
  let exactQuery = supabase
    .from('contacts')
    .select('id, first_name, last_name')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)

  if (firstName) exactQuery = exactQuery.ilike('first_name', firstName)
  if (lastName) exactQuery = exactQuery.ilike('last_name', lastName)

  const { data: exactMatches } = await exactQuery.limit(20)

  for (const m of exactMatches ?? []) {
    const matchedName = [m.first_name, m.last_name].filter(Boolean).join(' ')
    const ourName = [firstName, lastName].filter(Boolean).join(' ')

    matches.push({
      tenant_id: tenantId,
      scan_id: scanId,
      matched_entity_type: 'contact',
      matched_entity_id: m.id,
      match_category: 'possible_duplicate',
      confidence: 90,
      matched_name: matchedName,
      match_reasons: [
        {
          field: 'exact_name',
          our_value: ourName,
          their_value: matchedName,
          similarity: 100,
        },
      ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
    })
  }

  // Fuzzy name match via pg_trgm (only if we have a full name)
  if (firstName && lastName) {
    const fullName = `${firstName} ${lastName}`
    const { data: fuzzyMatches } = await supabase.rpc('search_contacts_fuzzy' as never, {
      p_tenant_id: tenantId,
      p_exclude_id: contactId,
      p_search_name: fullName,
      p_threshold: FUZZY_NAME_THRESHOLD,
    } as never)

    // If the RPC doesn't exist yet, fall back to ILIKE partial match
    if (!fuzzyMatches) {
      // Fallback: ILIKE partial match on first name
      const { data: partialMatches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .neq('id', contactId)
        .eq('is_archived', false)
        .or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%`)
        .limit(20)

      for (const m of partialMatches ?? []) {
        // Skip if already found as exact match
        if (matches.some((ex) => ex.matched_entity_id === m.id)) continue

        const matchedName = [m.first_name, m.last_name].filter(Boolean).join(' ')
        const ourName = `${firstName} ${lastName}`

        matches.push({
          tenant_id: tenantId,
          scan_id: scanId,
          matched_entity_type: 'contact',
          matched_entity_id: m.id,
          match_category: 'possible_duplicate',
          confidence: 60,
          matched_name: matchedName,
          match_reasons: [
            {
              field: 'fuzzy_name',
              our_value: ourName,
              their_value: matchedName,
              similarity: 60,
            },
          ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
        })
      }
    } else {
      for (const m of (fuzzyMatches as Array<{ id: string; first_name: string; last_name: string; similarity: number }>) ?? []) {
        if (matches.some((ex) => ex.matched_entity_id === m.id)) continue

        const matchedName = [m.first_name, m.last_name].filter(Boolean).join(' ')
        const sim = Math.round((m.similarity ?? 0.5) * 100)

        matches.push({
          tenant_id: tenantId,
          scan_id: scanId,
          matched_entity_type: 'contact',
          matched_entity_id: m.id,
          match_category: 'possible_duplicate',
          confidence: sim,
          matched_name: matchedName,
          match_reasons: [
            {
              field: 'fuzzy_name',
              our_value: fullName,
              their_value: matchedName,
              similarity: sim,
            },
          ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
        })
      }
    }
  }

  return matches
}

async function findEmailMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    emailPrimary: string | null
    emailSecondary: string | null
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, emailPrimary, emailSecondary, scanId } = params
  const matches: ConflictMatchInsert[] = []

  const emails = [emailPrimary, emailSecondary].filter(Boolean) as string[]
  if (emails.length === 0) return matches

  const orFilters = emails
    .flatMap((e) => [`email_primary.ilike.${e}`, `email_secondary.ilike.${e}`])
    .join(',')

  const { data: emailMatches } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email_primary, email_secondary')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)
    .or(orFilters)
    .limit(20)

  for (const m of emailMatches ?? []) {
    const matchedEmail = emails.find(
      (e) =>
        m.email_primary?.toLowerCase() === e.toLowerCase() ||
        m.email_secondary?.toLowerCase() === e.toLowerCase()
    )

    matches.push({
      tenant_id: tenantId,
      scan_id: scanId,
      matched_entity_type: 'contact',
      matched_entity_id: m.id,
      match_category: 'possible_duplicate',
      confidence: 85,
      matched_name: [m.first_name, m.last_name].filter(Boolean).join(' '),
      match_reasons: [
        {
          field: 'email',
          our_value: matchedEmail ?? emailPrimary ?? '',
          their_value: m.email_primary ?? m.email_secondary ?? '',
          similarity: 100,
        },
      ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
    })
  }

  return matches
}

async function findPhoneMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    phonePrimary: string | null
    phoneSecondary: string | null
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, phonePrimary, phoneSecondary, scanId } = params
  const matches: ConflictMatchInsert[] = []

  // Normalize phone numbers (strip non-digits)
  const normalize = (p: string | null) => p?.replace(/\D/g, '') ?? ''
  const phones = [phonePrimary, phoneSecondary]
    .filter(Boolean)
    .map((p) => normalize(p))
    .filter((p) => p.length >= 7) // Must have at least 7 digits

  if (phones.length === 0) return matches

  // Query contacts and filter in application layer since phone normalization
  // requires stripping non-digit characters
  const { data: candidates } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone_primary, phone_secondary')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)
    .or('phone_primary.neq.,phone_secondary.neq.')
    .limit(500)

  for (const c of candidates ?? []) {
    const cPrimary = normalize(c.phone_primary)
    const cSecondary = normalize(c.phone_secondary)

    const matched = phones.find(
      (p) =>
        (cPrimary && cPrimary === p) ||
        (cSecondary && cSecondary === p) ||
        (cPrimary && cPrimary.endsWith(p)) ||
        (cSecondary && cSecondary.endsWith(p)) ||
        (cPrimary && p.endsWith(cPrimary)) ||
        (cSecondary && p.endsWith(cSecondary))
    )

    if (matched) {
      matches.push({
        tenant_id: tenantId,
        scan_id: scanId,
        matched_entity_type: 'contact',
        matched_entity_id: c.id,
        match_category: 'possible_duplicate',
        confidence: 80,
        matched_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
        match_reasons: [
          {
            field: 'phone',
            our_value: phonePrimary ?? phoneSecondary ?? '',
            their_value: c.phone_primary ?? c.phone_secondary ?? '',
            similarity: 100,
          },
        ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
      })
    }
  }

  return matches
}

async function findAddressMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    addressLine1: string
    city: string
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, addressLine1, city, scanId } = params

  const { data: addressMatches } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, address_line1, city')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)
    .ilike('address_line1', addressLine1)
    .ilike('city', city)
    .limit(20)

  return (addressMatches ?? []).map((m) => ({
    tenant_id: tenantId,
    scan_id: scanId,
    matched_entity_type: 'contact',
    matched_entity_id: m.id,
    match_category: 'same_household',
    confidence: 70,
    matched_name: [m.first_name, m.last_name].filter(Boolean).join(' '),
    match_reasons: [
      {
        field: 'address',
        our_value: `${addressLine1}, ${city}`,
        their_value: `${m.address_line1}, ${m.city}`,
        similarity: 100,
      },
    ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
  }))
}

async function findDobMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    dateOfBirth: string
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, dateOfBirth, scanId } = params

  const { data: dobMatches } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, date_of_birth')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)
    .eq('date_of_birth', dateOfBirth)
    .limit(20)

  return (dobMatches ?? []).map((m) => ({
    tenant_id: tenantId,
    scan_id: scanId,
    matched_entity_type: 'contact',
    matched_entity_id: m.id,
    match_category: 'possible_duplicate',
    confidence: 65,
    matched_name: [m.first_name, m.last_name].filter(Boolean).join(' '),
    match_reasons: [
      {
        field: 'dob',
        our_value: dateOfBirth,
        their_value: m.date_of_birth ?? '',
        similarity: 100,
      },
    ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
  }))
}

async function findOrgMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    orgName: string
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, orgName, scanId } = params

  const { data: orgMatches } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, organization_name')
    .eq('tenant_id', tenantId)
    .neq('id', contactId)
    .eq('is_archived', false)
    .ilike('organization_name', orgName)
    .limit(20)

  return (orgMatches ?? []).map((m) => ({
    tenant_id: tenantId,
    scan_id: scanId,
    matched_entity_type: 'contact',
    matched_entity_id: m.id,
    match_category: 'related_corporate',
    confidence: 60,
    matched_name: [m.first_name, m.last_name].filter(Boolean).join(' '),
    match_reasons: [
      {
        field: 'organization',
        our_value: orgName,
        their_value: m.organization_name ?? '',
        similarity: 100,
      },
    ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
  }))
}

async function findAdversePartyMatches(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    contactId: string
    firstName: string | null
    lastName: string | null
    emailPrimary: string | null
    scanId: string
  }
): Promise<ConflictMatchInsert[]> {
  const { tenantId, contactId, firstName, lastName, emailPrimary, scanId } = params
  const matches: ConflictMatchInsert[] = []

  // Find matters where this contact is involved as a party
  const { data: myMatterLinks } = await supabase
    .from('matter_contacts')
    .select('matter_id, role')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)

  const myMatterIds = (myMatterLinks ?? []).map((l) => l.matter_id)

  // Find other contacts in these matters who have adverse roles
  if (myMatterIds.length > 0) {
    const { data: adverseLinks } = await supabase
      .from('matter_contacts')
      .select('contact_id, matter_id, role, contacts(id, first_name, last_name)')
      .eq('tenant_id', tenantId)
      .neq('contact_id', contactId)
      .in('matter_id', myMatterIds)
      .in('role', ['opposing_party', 'adverse', 'respondent', 'defendant'])

    for (const link of adverseLinks ?? []) {
      const c = (link as unknown as { contacts: { id: string; first_name: string; last_name: string } }).contacts
      if (!c) continue

      matches.push({
        tenant_id: tenantId,
        scan_id: scanId,
        matched_entity_type: 'contact',
        matched_entity_id: c.id,
        match_category: 'adverse_party',
        confidence: 95,
        matched_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
        matched_role: link.role,
        match_reasons: [
          {
            field: 'adverse_party',
            our_value: [firstName, lastName].filter(Boolean).join(' '),
            their_value: [c.first_name, c.last_name].filter(Boolean).join(' '),
            similarity: 100,
          },
        ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
      })
    }
  }

  // Also check: is this contact listed as an adverse party on someone else's matter?
  const { data: adverseOnOthers } = await supabase
    .from('matter_contacts')
    .select('matter_id, role, matters(id, title, matter_number)')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .in('role', ['opposing_party', 'adverse', 'respondent', 'defendant'])

  for (const link of adverseOnOthers ?? []) {
    const m = (link as unknown as { matters: { id: string; title: string; matter_number: string } }).matters
    if (!m) continue

    matches.push({
      tenant_id: tenantId,
      scan_id: scanId,
      matched_entity_type: 'matter',
      matched_entity_id: m.id,
      match_category: 'opposing_party',
      confidence: 95,
      matched_name: m.title || m.matter_number || 'Unknown Matter',
      matched_role: link.role,
      match_reasons: [
        {
          field: 'adverse_party',
          our_value: [firstName, lastName].filter(Boolean).join(' '),
          their_value: m.title ?? '',
          similarity: 100,
        },
      ] as unknown as Database['public']['Tables']['conflict_matches']['Insert']['match_reasons'],
    })
  }

  return matches
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function deduplicateMatches(matches: ConflictMatchInsert[]): ConflictMatchInsert[] {
  const byEntity = new Map<string, ConflictMatchInsert>()

  for (const match of matches) {
    const key = `${match.matched_entity_type}:${match.matched_entity_id}`
    const existing = byEntity.get(key)

    if (!existing) {
      byEntity.set(key, match)
    } else {
      // Merge: keep higher confidence, combine reasons, keep more severe category
      const existingReasons = (existing.match_reasons ?? []) as unknown as MatchReason[]
      const newReasons = (match.match_reasons ?? []) as unknown as MatchReason[]
      const allReasons = [...existingReasons, ...newReasons]

      // Deduplicate reasons by field
      const seenFields = new Set<string>()
      const uniqueReasons = allReasons.filter((r) => {
        if (seenFields.has(r.field)) return false
        seenFields.add(r.field)
        return true
      })

      const categoryPriority: Record<string, number> = {
        adverse_party: 6,
        opposing_party: 5,
        former_client: 4,
        possible_duplicate: 3,
        same_household: 2,
        related_corporate: 1,
        shared_payor: 0,
      }

      const bestCategory =
        (categoryPriority[match.match_category] ?? 0) >
        (categoryPriority[existing.match_category] ?? 0)
          ? match.match_category
          : existing.match_category

      byEntity.set(key, {
        ...existing,
        match_category: bestCategory,
        confidence: Math.max(existing.confidence ?? 0, match.confidence ?? 0),
        match_reasons: uniqueReasons as unknown as ConflictMatchInsert['match_reasons'],
        matched_role: match.matched_role ?? existing.matched_role,
      })
    }
  }

  return Array.from(byEntity.values())
}
