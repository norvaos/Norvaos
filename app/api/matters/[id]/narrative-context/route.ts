import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { checkChronologicalGaps, type DateRange } from '@/lib/utils/continuity'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/matters/[id]/narrative-context
 *
 * Exports the gapless chronological history + compliance milestones
 * into a JSON format optimised for the Narrative Builder (Directive 021).
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params
    const supabase = auth.supabase as SupabaseClient<any>

    // 1. Fetch matter details
    const { data: matter } = await supabase
      .from('matters')
      .select('id, title, matter_number, status, matter_type_id, created_at, readiness_score')
      .eq('id', matterId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // 2. Get primary contact
    const { data: mc } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('is_primary', true)
      .maybeSingle()

    const contactId = mc?.contact_id ?? null
    let contact = null

    if (contactId) {
      const { data: c } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, date_of_birth, nationality, country_of_birth, country_of_residence, immigration_status, marital_status')
        .eq('id', contactId)
        .single()
      contact = c
    }

    // 3. Fetch address history
    const { data: addressRows } = await (supabase as SupabaseClient<any>)
      .from('address_history')
      .select('*')
      .eq('matter_id', matterId)
      .order('start_date', { ascending: true })

    const addressEntries: DateRange[] = (addressRows ?? []).map((r: any) => ({
      id: r.id,
      label: r.label || `${r.city}, ${r.country}`,
      start_date: r.start_date,
      end_date: r.end_date || new Date().toISOString().split('T')[0],
    }))
    const addressContinuity = checkChronologicalGaps(addressEntries)

    // 4. Fetch personal/employment history
    const { data: personalRows } = await (supabase as SupabaseClient<any>)
      .from('personal_history')
      .select('*')
      .eq('matter_id', matterId)
      .order('start_date', { ascending: true })

    const personalEntries: DateRange[] = (personalRows ?? []).map((r: any) => ({
      id: r.id,
      label: r.label || `${r.history_type}: ${r.organization ?? 'Unknown'}`,
      start_date: r.start_date,
      end_date: r.end_date || new Date().toISOString().split('T')[0],
    }))
    const personalContinuity = checkChronologicalGaps(personalEntries)

    // 5. Fetch compliance milestones (genesis block, stage history, key dates)
    const { data: genesis } = await (supabase as SupabaseClient<any>)
      .from('matter_genesis_metadata')
      .select('generated_at, is_compliant, has_sequence_violation, compliance_notes, genesis_hash')
      .eq('matter_id', matterId)
      .eq('is_revoked', false)
      .maybeSingle()

    // 6. Fetch document slots status
    const { data: docSlots } = await supabase
      .from('document_slots')
      .select('id, label, status, is_required, document_type')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    // 7. Build narrative context
    const narrativeContext = {
      matter: {
        id: matter.id,
        title: matter.title,
        matter_number: matter.matter_number,
        status: matter.status,
        readiness_score: matter.readiness_score,
        created_at: matter.created_at,
      },
      applicant: contact ? {
        full_name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
        date_of_birth: contact.date_of_birth,
        nationality: contact.nationality,
        country_of_birth: contact.country_of_birth,
        country_of_residence: contact.country_of_residence,
        immigration_status: contact.immigration_status,
        marital_status: contact.marital_status,
      } : null,
      address_history: {
        entries: addressRows ?? [],
        continuity: addressContinuity,
        is_gapless: addressContinuity.isGapless,
      },
      personal_history: {
        entries: personalRows ?? [],
        continuity: personalContinuity,
        is_gapless: personalContinuity.isGapless,
      },
      compliance: {
        genesis_sealed: !!genesis,
        genesis_compliant: genesis?.is_compliant ?? false,
        has_sequence_violation: genesis?.has_sequence_violation ?? false,
        compliance_notes: genesis?.compliance_notes ?? null,
        genesis_hash: genesis?.genesis_hash ?? null,
        sealed_at: genesis?.generated_at ?? null,
      },
      documents: {
        total: (docSlots ?? []).length,
        approved: (docSlots ?? []).filter((d: any) => d.status === 'accepted' || d.status === 'approved').length,
        pending: (docSlots ?? []).filter((d: any) => d.status === 'pending' || d.status === 'uploaded').length,
        missing: (docSlots ?? []).filter((d: any) => d.status === 'missing' || d.status === 'required').length,
        slots: docSlots ?? [],
      },
      generated_at: new Date().toISOString(),
    }

    return NextResponse.json(narrativeContext)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[narrative-context] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/narrative-context')
