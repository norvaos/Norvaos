import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { checkKioskRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'

/**
 * POST /api/kiosk/[token]/client-lookup
 *
 * Searches for a returning client by email or phone.
 * Returns their matters and booking pages for the kiosk portal view.
 *
 * Lookup strategy (two-path to handle all association patterns):
 *   Path A: matter_people.email/phone → matter_id (handles persons stored inline
 *           on the matter, with or without a linked contact record)
 *   Path B: contacts.email_primary/phone_primary → contact_id →
 *           matter_people.contact_id → matter_id (handles fully-linked contacts)
 *
 * Security: only contact name, matter reference, status, and lawyer name are
 * returned. No sensitive legal content exposed at this stage. (Rule #8)
 * Rule #7: Token validated first. Rule #17: Multi-tenant isolation.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    const rateLimitResponse = await checkKioskRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    const body = await request.json()
    const { searchType, searchValue } = body as {
      searchType: 'email' | 'phone'
      searchValue: string
    }

    if (!searchValue || searchValue.trim().length < 3) {
      return NextResponse.json({ error: 'Search value must be at least 3 characters' }, { status: 400 })
    }

    if (searchType !== 'email' && searchType !== 'phone') {
      return NextResponse.json({ error: 'Invalid searchType' }, { status: 400 })
    }

    const term = searchValue.trim()
    const matterIdSet = new Set<string>()

    // ── Path A: search matter_people directly by email or phone ───────────────
    // This is the primary path and handles the common case where matter_people
    // rows may have contact_id = null (person data stored inline on the matter).
    let personName = ''
    let personContactId: string | null = null

    {
      let mpQuery = admin
        .from('matter_people')
        .select('matter_id, contact_id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(10)

      if (searchType === 'email') {
        mpQuery = mpQuery.ilike('email', `%${term}%`)
      } else {
        mpQuery = mpQuery.ilike('phone', `%${term}%`)
      }

      const { data: mpRows } = await mpQuery

      if (mpRows && mpRows.length > 0) {
        for (const row of mpRows) {
          matterIdSet.add(row.matter_id)
          // Capture name from the first match
          if (!personName && (row.first_name || row.last_name)) {
            personName = [row.first_name, row.last_name].filter(Boolean).join(' ')
          }
          if (!personContactId && row.contact_id) {
            personContactId = row.contact_id
          }
        }
      }
    }

    // ── Path B: search contacts table → matter_people via contact_id ──────────
    // Supplements Path A for contacts that are fully linked.

    {
      let cQuery = admin
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .limit(1)

      if (searchType === 'email') {
        cQuery = cQuery.ilike('email_primary', `%${term}%`)
      } else {
        cQuery = cQuery.ilike('phone_primary', `%${term}%`)
      }

      const { data: contact } = await cQuery.maybeSingle()

      if (contact) {
        // Prefer contact name if we didn't get one from matter_people
        if (!personName) {
          personName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        }
        if (!personContactId) {
          personContactId = contact.id
        }

        // Find matter_people rows for this contact
        const { data: mpByContact } = await admin
          .from('matter_people')
          .select('matter_id')
          .eq('contact_id', contact.id)
          .eq('is_active', true)
          .limit(10)

        for (const row of mpByContact ?? []) {
          matterIdSet.add(row.matter_id)
        }
      }
    }

    // Nothing found at all
    if (matterIdSet.size === 0 && !personContactId && !personName) {
      return NextResponse.json({ found: false })
    }

    // If we found a person name but no matters, return found=true with empty matters
    // so the UI can show the "no active matter" message rather than "not found"
    if (matterIdSet.size === 0) {
      return NextResponse.json({
        found: true,
        contact: { id: personContactId ?? '', name: personName },
        matters: [],
        bookingPages: [],
      })
    }

    // ── Fetch matters (no aggressive status filter  -  show all non-archived) ───
    const { data: matters } = await admin
      .from('matters')
      .select('id, matter_number, title, status, matter_type_id, responsible_lawyer_id')
      .in('id', [...matterIdSet])
      .neq('status', 'archived')
      .neq('status', IMPORT_REVERTED_STATUS)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!matters || matters.length === 0) {
      return NextResponse.json({
        found: true,
        contact: { id: personContactId ?? '', name: personName },
        matters: [],
        bookingPages: [],
      })
    }

    // ── Batch-resolve matter types ─────────────────────────────────────────────
    const matterTypeIds = [...new Set(matters.map((m) => m.matter_type_id).filter(Boolean))]
    let matterTypesMap: Record<string, string> = {}
    if (matterTypeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: types } = await (admin as any)
        .from('matter_types')
        .select('id, name')
        .in('id', matterTypeIds)
      matterTypesMap = Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (types ?? []).map((t: any) => [t.id, t.name as string]),
      )
    }

    // ── Batch-resolve lawyers ─────────────────────────────────────────────────
    const lawyerIdSet = new Set<string>()
    matters.forEach((m) => { if (m.responsible_lawyer_id) lawyerIdSet.add(m.responsible_lawyer_id) })
    const lawyerIds = [...lawyerIdSet]

    let lawyersMap: Record<string, { name: string; avatarUrl: string | null }> = {}
    if (lawyerIds.length > 0) {
      const { data: lawyers } = await admin
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .in('id', lawyerIds)
      lawyersMap = Object.fromEntries(
        (lawyers ?? []).map((l) => [
          l.id,
          {
            name: [l.first_name, l.last_name].filter(Boolean).join(' '),
            avatarUrl: l.avatar_url ?? null,
          },
        ]),
      )
    }

    // ── Fetch published booking pages for the relevant lawyers ────────────────
    let bookingPages: Array<{
      id: string
      title: string
      slug: string
      durationMinutes: number
      lawyerName: string
      lawyerId: string
    }> = []

    if (lawyerIds.length > 0) {
      const { data: pages } = await admin
        .from('booking_pages')
        .select('id, title, slug, duration_minutes, user_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .eq('is_active', true)
        .in('user_id', lawyerIds)
        .limit(5)

      bookingPages = (pages ?? []).map((bp) => ({
        id: bp.id,
        title: bp.title,
        slug: bp.slug,
        durationMinutes: bp.duration_minutes,
        lawyerName: lawyersMap[bp.user_id]?.name ?? '',
        lawyerId: bp.user_id,
      }))
    }

    // ── Enrich matters with pending counts ────────────────────────────────────
    const enrichedMatters = await Promise.all(
      matters.map(async (m) => {
        const { count: pendingDocs } = await admin
          .from('document_slots')
          .select('id', { count: 'exact', head: true })
          .eq('matter_id', m.id)
          .eq('is_active', true)
          .in('status', ['empty', 'needs_re_upload'])

        const { count: taskCount } = await admin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('matter_id', m.id)
          .eq('is_deleted', false)
          .in('category', ['client_facing'])
          .eq('status', 'pending')

        const lawyerId = m.responsible_lawyer_id ?? null
        const lawyer = lawyerId ? lawyersMap[lawyerId] : null

        return {
          id: m.id,
          matterNumber: m.matter_number ?? '',
          title: m.title ?? '',
          status: m.status ?? '',
          matterTypeName: m.matter_type_id ? (matterTypesMap[m.matter_type_id] ?? '') : '',
          lawyerName: lawyer?.name ?? '',
          lawyerAvatarUrl: lawyer?.avatarUrl ?? null,
          lawyerId: lawyerId ?? null,
          pendingDocuments: pendingDocs ?? 0,
          pendingTasks: taskCount ?? 0,
        }
      }),
    )

    log.info('[kiosk-client-lookup] Client found', {
      contact_id: personContactId,
      matters_count: enrichedMatters.length,
      tenant_id: tenantId,
      search_type: searchType,
      path_a_hits: matterIdSet.size,
    })

    return NextResponse.json({
      found: true,
      contact: { id: personContactId ?? '', name: personName },
      matters: enrichedMatters,
      bookingPages,
    })
  } catch (error) {
    log.error('[kiosk-client-lookup] Unexpected error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/kiosk/[token]/client-lookup')
