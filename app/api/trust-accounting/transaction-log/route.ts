/**
 * GET  /api/trust-accounting/transaction-log  -  Query the trust transaction log (read-only)
 *
 * The transaction log is append-only. Entries are written internally by
 * services  -  API consumers may only read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryTransactionLog } from '@/lib/services/trust-accounting/trust-transaction-log-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const trustAccountId = searchParams.get('trustAccountId') ?? undefined
    const matterId = searchParams.get('matterId') ?? undefined
    const eventType = (searchParams.get('eventType') ?? undefined) as any
    const dateFrom = searchParams.get('dateFrom') ?? undefined
    const dateTo = searchParams.get('dateTo') ?? undefined
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)

    const result = await queryTransactionLog({
      supabase,
      tenantId: auth.tenantId,
      trustAccountId,
      matterId,
      eventType,
      dateFrom,
      dateTo,
      page,
      pageSize,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      entries: result.data?.data ?? [],
      pagination: { page, pageSize, total: result.data?.total ?? 0 },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
