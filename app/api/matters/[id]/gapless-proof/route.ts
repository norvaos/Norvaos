import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { checkChronologicalGaps, type DateRange } from '@/lib/utils/continuity'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/matters/[id]/gapless-proof
 *
 * Generates the "Chronological Proof" JSON for Directive 024.
 * Lists every address and employment entry with a "0-Day Gap Verified" flag.
 * Fed into the Narrative Builder to draft the "Un-Rejectable" submission letter.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params
    const supabase = auth.supabase as SupabaseClient<any>

    // 1. Fetch matter + primary contact
    const { data: matter } = await supabase
      .from('matters')
      .select('id, title, matter_number')
      .eq('id', matterId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    const { data: mc } = await supabase
      .from('matter_contacts')
      .select('contact_id, contacts(first_name, last_name)')
      .eq('matter_id', matterId)
      .eq('is_primary', true)
      .maybeSingle()

    // 2. Fetch address history
    const { data: addressRows } = await (supabase as SupabaseClient<any>)
      .from('address_history')
      .select('*')
      .eq('matter_id', matterId)
      .order('start_date', { ascending: true })

    const addresses = addressRows ?? []
    const addressRanges: DateRange[] = addresses.map((r: any) => ({
      id: r.id,
      label: r.label || `${r.city}, ${r.country}`,
      start_date: r.start_date,
      end_date: r.end_date || new Date().toISOString().split('T')[0],
    }))
    const addressGaps = checkChronologicalGaps(addressRanges)

    // 3. Fetch personal/employment history
    const { data: personalRows } = await (supabase as SupabaseClient<any>)
      .from('personal_history')
      .select('*')
      .eq('matter_id', matterId)
      .order('start_date', { ascending: true })

    const personal = personalRows ?? []
    const personalRanges: DateRange[] = personal.map((r: any) => ({
      id: r.id,
      label: r.label || `${r.history_type}: ${r.organization ?? 'Unknown'}`,
      start_date: r.start_date,
      end_date: r.end_date || new Date().toISOString().split('T')[0],
    }))
    const personalGaps = checkChronologicalGaps(personalRanges)

    // 4. Build proof entries with per-transition verification
    const buildProofEntries = (
      rows: any[],
      gaps: typeof addressGaps,
      type: 'address' | 'employment',
    ) => {
      return rows.map((row: any, idx: number) => {
        // Check if there's a gap AFTER this entry (between this and the next)
        const gapAfter = gaps.gaps.find(
          (g) => g.between[0] === (row.label || `${row.city}, ${row.country}`) ||
                 g.between[0] === (row.label || `${row.history_type}: ${row.organization ?? 'Unknown'}`)
        )

        return {
          sequence: idx + 1,
          type,
          label: row.label || (type === 'address' ? `${row.city}, ${row.country}` : `${row.history_type}: ${row.organization ?? 'Unknown'}`),
          start_date: row.start_date,
          end_date: row.end_date || 'Present',
          is_current: row.is_current ?? false,
          gap_after_days: gapAfter?.gap_days ?? 0,
          zero_day_gap_verified: !gapAfter,
          ...(gapAfter ? { gap_detail: `${gapAfter.gap_days} day gap: ${gapAfter.gap_start} to ${gapAfter.gap_end}` } : {}),
        }
      })
    }

    const contactInfo = mc?.contacts as any
    const applicantName = contactInfo
      ? `${contactInfo.first_name ?? ''} ${contactInfo.last_name ?? ''}`.trim()
      : 'Unknown Applicant'

    // 5. Build the proof document
    const proof = {
      title: 'Chronological Proof — Gapless Affidavit Data',
      matter: {
        id: matter.id,
        title: matter.title,
        matter_number: matter.matter_number,
      },
      applicant: applicantName,
      generated_at: new Date().toISOString(),

      address_proof: {
        total_entries: addresses.length,
        is_gapless: addressGaps.isGapless,
        total_dark_days: addressGaps.totalDarkDays,
        verified_ranges: addressGaps.verifiedRanges,
        entries: buildProofEntries(addresses, addressGaps, 'address'),
        dark_periods: addressGaps.gaps,
      },

      employment_proof: {
        total_entries: personal.length,
        is_gapless: personalGaps.isGapless,
        total_dark_days: personalGaps.totalDarkDays,
        verified_ranges: personalGaps.verifiedRanges,
        entries: buildProofEntries(personal, personalGaps, 'employment'),
        dark_periods: personalGaps.gaps,
      },

      overall: {
        is_fully_gapless: addressGaps.isGapless && personalGaps.isGapless,
        total_address_gaps: addressGaps.gaps.length,
        total_employment_gaps: personalGaps.gaps.length,
        submission_ready: addressGaps.isGapless && personalGaps.isGapless,
        verdict: addressGaps.isGapless && personalGaps.isGapless
          ? 'GAPLESS VERIFIED — File meets chronological continuity standard'
          : `GAPS DETECTED — ${addressGaps.gaps.length + personalGaps.gaps.length} dark period(s) require resolution`,
      },
    }

    return NextResponse.json(proof)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[gapless-proof] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/gapless-proof')
