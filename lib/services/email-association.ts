import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AssociationResult {
  success: boolean
  matterId: string | null
  contactId: string | null
  method: string | null
  confidence: number
}

export interface AssociationSuggestion {
  matterId: string
  matterTitle: string
  matterNumber: string | null
  confidence: number
  reason: string
}

// ─── Auto-Association Logic ─────────────────────────────────────────────────

/**
 * Attempts to auto-associate an email thread to a matter.
 *
 * Priority:
 *   1. Thread lock — if thread is already associated via 'manual' or 'thread_lock', keep it
 *   2. Contact match — match participant_emails against contact email addresses
 *   3. Subject match — look for matter number pattern in subject line
 *   4. If ambiguous — create unmatched_email_queue entry
 */
export async function associateEmailToMatter(
  supabase: SupabaseClient<Database>,
  threadId: string
): Promise<AssociationResult> {
  // Fetch the thread
  const { data: thread } = await supabase
    .from('email_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  if (!thread) {
    return { success: false, matterId: null, contactId: null, method: null, confidence: 0 }
  }

  // 1. Thread lock — already associated with high confidence
  if (
    thread.matter_id &&
    (thread.association_method === 'manual' || thread.association_method === 'thread_lock')
  ) {
    return {
      success: true,
      matterId: thread.matter_id,
      contactId: thread.contact_id,
      method: thread.association_method,
      confidence: 1.0,
    }
  }

  // 2. Contact match — find contacts whose email matches a participant
  const participantEmails = thread.participant_emails ?? []
  if (participantEmails.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email_primary, first_name, last_name')
      .eq('tenant_id', thread.tenant_id)
      .in('email_primary', participantEmails)
      .limit(10)

    if (contacts && contacts.length > 0) {
      // Find matters associated with these contacts
      const contactIds = contacts.map((c) => c.id)
      const { data: matterContacts } = await supabase
        .from('matter_people')
        .select('matter_id, contact_id')
        .eq('tenant_id', thread.tenant_id)
        .in('contact_id', contactIds)
        .limit(10)

      if (matterContacts && matterContacts.length === 1) {
        // Single match — high confidence
        const match = matterContacts[0]
        await supabase
          .from('email_threads')
          .update({
            matter_id: match.matter_id,
            contact_id: match.contact_id,
            association_confidence: 0.85,
            association_method: 'contact_match',
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId)

        return {
          success: true,
          matterId: match.matter_id,
          contactId: match.contact_id,
          method: 'contact_match',
          confidence: 0.85,
        }
      }

      if (matterContacts && matterContacts.length > 1) {
        // Ambiguous — multiple matters for the same contact(s)
        const suggestedMatterIds = [...new Set(matterContacts.map((mc) => mc.matter_id).filter((id): id is string => id != null))]
        const suggestedContactIds = [...new Set(matterContacts.map((mc) => mc.contact_id).filter((id): id is string => id != null))]

        // Update contact_id on thread if we have exactly one contact
        if (contacts.length === 1) {
          await supabase
            .from('email_threads')
            .update({
              contact_id: contacts[0].id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', threadId)
        }

        await supabase.from('unmatched_email_queue').insert({
          tenant_id: thread.tenant_id,
          thread_id: threadId,
          suggested_matter_ids: suggestedMatterIds,
          suggested_contact_ids: suggestedContactIds,
          reason: `Contact matched to ${suggestedMatterIds.length} matters — manual selection required`,
          status: 'pending',
        })

        return {
          success: false,
          matterId: null,
          contactId: contacts.length === 1 ? contacts[0].id : null,
          method: null,
          confidence: 0,
        }
      }
    }
  }

  // 3. Subject match — look for matter number in subject line
  if (thread.subject) {
    // Match patterns like "MAT-2024-001" or "[MAT-2024-001]"
    const matterNumberMatch = thread.subject.match(/\b(MAT-\d{4}-\d+)\b/i)
    if (matterNumberMatch) {
      const matterNumber = matterNumberMatch[1].toUpperCase()
      const { data: matter } = await supabase
        .from('matters')
        .select('id')
        .eq('tenant_id', thread.tenant_id)
        .eq('matter_number', matterNumber)
        .maybeSingle()

      if (matter) {
        await supabase
          .from('email_threads')
          .update({
            matter_id: matter.id,
            association_confidence: 0.95,
            association_method: 'subject_match',
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId)

        return {
          success: true,
          matterId: matter.id,
          contactId: thread.contact_id,
          method: 'subject_match',
          confidence: 0.95,
        }
      }
    }
  }

  // 4. No match — add to unmatched queue
  await supabase.from('unmatched_email_queue').insert({
    tenant_id: thread.tenant_id,
    thread_id: threadId,
    suggested_matter_ids: [],
    suggested_contact_ids: [],
    reason: 'No contact or subject match found',
    status: 'pending',
  })

  return { success: false, matterId: null, contactId: null, method: null, confidence: 0 }
}

// ─── Manual Association ─────────────────────────────────────────────────────

/**
 * Manually associate a thread to a matter. Creates an audit event and
 * locks the thread association so auto-association won't override it.
 */
export async function manualAssociate(
  supabase: SupabaseClient<Database>,
  threadId: string,
  matterId: string,
  userId: string
): Promise<void> {
  // Fetch current state for audit
  const { data: thread } = await supabase
    .from('email_threads')
    .select('tenant_id, matter_id')
    .eq('id', threadId)
    .single()

  if (!thread) throw new Error('Thread not found')

  const previousMatterId = thread.matter_id

  // Update thread
  await supabase
    .from('email_threads')
    .update({
      matter_id: matterId,
      association_confidence: 1.0,
      association_method: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)

  // Create audit event
  await supabase.from('email_association_events').insert({
    tenant_id: thread.tenant_id,
    thread_id: threadId,
    matter_id: matterId,
    associated_by: userId,
    association_type: previousMatterId ? 'override' : 'manual',
    confidence_score: 1.0,
    previous_matter_id: previousMatterId,
  })

  // Resolve any pending unmatched queue entries for this thread
  await supabase
    .from('unmatched_email_queue')
    .update({
      status: 'resolved',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('thread_id', threadId)
    .eq('status', 'pending')
}

// ─── Association Suggestions ────────────────────────────────────────────────

/**
 * Returns suggestions for associating an unmatched thread to a matter.
 * Checks participant emails against contacts and looks for subject patterns.
 */
export async function getAssociationSuggestions(
  supabase: SupabaseClient<Database>,
  threadId: string
): Promise<AssociationSuggestion[]> {
  const { data: thread } = await supabase
    .from('email_threads')
    .select('tenant_id, subject, participant_emails')
    .eq('id', threadId)
    .single()

  if (!thread) return []

  const suggestions: AssociationSuggestion[] = []
  const participantEmails = thread.participant_emails ?? []

  // 1. Contact-based suggestions
  if (participantEmails.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email_primary')
      .eq('tenant_id', thread.tenant_id)
      .in('email_primary', participantEmails)
      .limit(10)

    if (contacts && contacts.length > 0) {
      const contactIds = contacts.map((c) => c.id)
      const { data: matterContacts } = await supabase
        .from('matter_people')
        .select('matter_id, contact_id')
        .eq('tenant_id', thread.tenant_id)
        .in('contact_id', contactIds)
        .limit(20)

      if (matterContacts) {
        const matterIds = [...new Set(matterContacts.map((mc) => mc.matter_id))]
        if (matterIds.length > 0) {
          const { data: matters } = await supabase
            .from('matters')
            .select('id, title, matter_number')
            .in('id', matterIds)

          for (const matter of matters ?? []) {
            suggestions.push({
              matterId: matter.id,
              matterTitle: matter.title,
              matterNumber: matter.matter_number,
              confidence: 0.7,
              reason: 'Contact email matches a participant in this thread',
            })
          }
        }
      }
    }
  }

  // 2. Subject-based suggestions
  if (thread.subject) {
    const matterNumberMatch = thread.subject.match(/\b(MAT-\d{4}-\d+)\b/i)
    if (matterNumberMatch) {
      const matterNumber = matterNumberMatch[1].toUpperCase()
      const { data: matter } = await supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', thread.tenant_id)
        .eq('matter_number', matterNumber)
        .maybeSingle()

      if (matter) {
        // Check if already in suggestions
        if (!suggestions.find((s) => s.matterId === matter.id)) {
          suggestions.push({
            matterId: matter.id,
            matterTitle: matter.title,
            matterNumber: matter.matter_number,
            confidence: 0.95,
            reason: `Matter number "${matterNumber}" found in subject line`,
          })
        }
      }
    }
  }

  // Sort by confidence descending
  return suggestions.sort((a, b) => b.confidence - a.confidence)
}
