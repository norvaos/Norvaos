import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { INVITE_EXPIRY_STATUS, INVITE_PENDING_STATUS } from '@/lib/services/seat-limit'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/cron/expire-invites
 *
 * Nightly cleanup: marks stale pending invites (expires_at <= now()) as expired.
 *
 * Uses the same INVITE_EXPIRY_STATUS and INVITE_PENDING_STATUS constants as
 * checkSeatLimit()'s on-read expiration so both code paths produce identical
 * results on the same dataset. After the cron runs, checkSeatLimit() should
 * never "expire more" for the same data — the shared constants guarantee this.
 *
 * Designed to be called by Vercel Cron (daily at 2 AM) or manually.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 */
async function handlePost(request: Request) {
  // Auth check for production
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const admin = createAdminClient()

    // Mark all stale pending invites as expired across all tenants
    // Uses shared constants: same status values as checkSeatLimit() on-read expiration
    const { data, error } = await admin
      .from('user_invites')
      .update({ status: INVITE_EXPIRY_STATUS })
      .eq('status', INVITE_PENDING_STATUS)
      .lt('expires_at', new Date().toISOString())
      .select('id')

    const expiredCount = data?.length ?? 0

    if (error) {
      log.error('[cron/expire-invites] Failed to expire invites', { error_code: error.code })
      return NextResponse.json(
        { error: `Failed to expire invites: ${error.message}` },
        { status: 500 }
      )
    }

    log.info('[cron/expire-invites] Expired stale invites', {
      expired_count: expiredCount,
    })

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      stats: { expired: expiredCount },
    })
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/expire-invites')
