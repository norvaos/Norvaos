/**
 * POST /api/conflicts/global-scan  -  Run a global conflict scan
 * GET  /api/conflicts/global-scan  -  Get scan history for an entity
 *
 * Directive 005.2: Cross-entity fuzzy-match conflict detection.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  runGlobalConflictScan,
  getGlobalConflictHistory,
} from '@/lib/services/global-conflict-engine'

// ─── POST: Run global conflict scan ─────────────────────────────────────────

async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    const body = await request.json()
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      passportNumber,
      excludeContactId,
      sourceEntityType,
      sourceEntityId,
    } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName' },
        { status: 400 }
      )
    }

    // Validate sourceEntityType if provided
    if (sourceEntityType && !['contact', 'lead', 'intake'].includes(sourceEntityType)) {
      return NextResponse.json(
        { error: 'Invalid sourceEntityType. Must be: contact, lead, or intake' },
        { status: 400 }
      )
    }

    const result = await runGlobalConflictScan({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: email ? String(email).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      dateOfBirth: dateOfBirth ? String(dateOfBirth) : undefined,
      passportNumber: passportNumber ? String(passportNumber).trim() : undefined,
      excludeContactId: excludeContactId ? String(excludeContactId) : undefined,
      sourceEntityType: sourceEntityType ?? 'contact',
      sourceEntityId: sourceEntityId ? String(sourceEntityId) : undefined,
      scannedBy: auth.userId,
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── GET: Scan history for an entity ────────────────────────────────────────

async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') as 'contact' | 'lead' | 'intake' | null
    const entityId = searchParams.get('entityId')

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: 'Missing required query params: entityType, entityId' },
        { status: 400 }
      )
    }

    if (!['contact', 'lead', 'intake'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entityType. Must be: contact, lead, or intake' },
        { status: 400 }
      )
    }

    const history = await getGlobalConflictHistory(
      auth.supabase,
      auth.tenantId,
      entityType,
      entityId
    )

    return NextResponse.json({ data: history })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export const POST = withTiming(handlePost, 'POST /api/conflicts/global-scan')
export const GET = withTiming(handleGet, 'GET /api/conflicts/global-scan')
