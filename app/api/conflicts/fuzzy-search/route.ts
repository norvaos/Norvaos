/**
 * GET /api/conflicts/fuzzy-search — Fuzzy search contacts, leads, and/or matters
 *
 * Query params:
 *   q         — search term (required)
 *   type      — contacts | leads | matters | all (default: all)
 *   threshold — similarity threshold 0.0-1.0 (default: 0.3)
 *
 * Directive 005.2: Cross-entity fuzzy-match search for conflict detection.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  searchContactsFuzzy,
  searchLeadsFuzzy,
  searchMattersByParty,
  type FuzzyContactMatch,
  type FuzzyLeadMatch,
  type MatterPartyMatch,
} from '@/lib/services/global-conflict-engine'

type SearchType = 'contacts' | 'leads' | 'matters' | 'all'

async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const type = (searchParams.get('type') ?? 'all') as SearchType
    const thresholdStr = searchParams.get('threshold')

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required and must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!['contacts', 'leads', 'matters', 'all'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be: contacts, leads, matters, or all' },
        { status: 400 }
      )
    }

    // Parse and clamp threshold
    let threshold = 0.3
    if (thresholdStr) {
      const parsed = parseFloat(thresholdStr)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        threshold = parsed
      }
    }

    const searchName = query.trim()
    const result: {
      contacts?: FuzzyContactMatch[]
      leads?: FuzzyLeadMatch[]
      matters?: MatterPartyMatch[]
    } = {}

    // Run searches in parallel based on type
    const promises: Promise<void>[] = []

    if (type === 'contacts' || type === 'all') {
      promises.push(
        searchContactsFuzzy(auth.supabase, auth.tenantId, searchName, undefined, threshold).then(
          (data) => {
            result.contacts = data
          }
        )
      )
    }

    if (type === 'leads' || type === 'all') {
      promises.push(
        searchLeadsFuzzy(auth.supabase, auth.tenantId, searchName, threshold).then((data) => {
          result.leads = data
        })
      )
    }

    if (type === 'matters' || type === 'all') {
      promises.push(
        searchMattersByParty(auth.supabase, auth.tenantId, searchName, threshold).then((data) => {
          result.matters = data
        })
      )
    }

    await Promise.all(promises)

    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export const GET = withTiming(handleGet, 'GET /api/conflicts/fuzzy-search')
