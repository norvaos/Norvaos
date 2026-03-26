import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processDocumentReminders } from '@/lib/services/document-reminder-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/cron/document-reminders
 *
 * Daily cron job for sending document upload reminders to clients
 * and escalating to staff when clients are unresponsive.
 *
 * Uses admin client (service role) to operate across all tenants.
 * Auth: Bearer token matching CRON_SECRET env var (or skip for dev).
 *
 * Schedule: Daily at 9 AM (configured in vercel.json or Vercel Cron).
 */
async function handlePost(request: Request) {
  // Auth check  -  fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const stats = await processDocumentReminders(supabase)

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      stats,
    })
  } catch (error) {
    console.error('[document-reminders cron] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/document-reminders')
