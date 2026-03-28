import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  refreshGoogleAccessToken,
  encryptGoogleToken,
  listGmailMessages,
} from '@/lib/services/google-gmail'

const MAX_ERROR_COUNT = 10

/**
 * POST /api/cron/google-sync
 *
 * Background worker for syncing all active Google/Gmail email accounts.
 * Designed to be called by Vercel Cron (every 15 minutes) or manually.
 */
async function handlePost(request: Request) {
  // Auth check - fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET not set' },
      { status: 500 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const stats = {
    processed: 0,
    emailsSynced: 0,
    errors: 0,
  }

  try {
    // Fetch all active Google email accounts under the error threshold
    const { data: accounts, error: fetchError } = await admin
      .from('email_accounts')
      .select('id, user_id, tenant_id, email_address, encrypted_refresh_token, error_count')
      .eq('is_active', true)
      .eq('sync_enabled', true)
      .eq('provider', 'google')
      .lt('error_count', MAX_ERROR_COUNT)

    if (fetchError) {
      console.error('[cron/google-sync] Failed to fetch accounts:', fetchError.message)
      return NextResponse.json(
        { error: 'Failed to fetch Google accounts', details: fetchError.message },
        { status: 500 },
      )
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: 'No active Google accounts to sync', stats })
    }

    for (const acct of accounts) {
      try {
        stats.processed++

        // 1. Refresh the access token
        if (!acct.encrypted_refresh_token) {
          console.warn(`[cron/google-sync] Account ${acct.id} has no refresh token, skipping`)
          continue
        }

        const tokens = await refreshGoogleAccessToken(acct.encrypted_refresh_token)

        // 2. Persist the new access token (and refresh token if rotated)
        const tokenUpdate: Record<string, unknown> = {
          encrypted_access_token: encryptGoogleToken(tokens.access_token),
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (tokens.refresh_token && tokens.refresh_token !== acct.encrypted_refresh_token) {
          tokenUpdate.encrypted_refresh_token = encryptGoogleToken(tokens.refresh_token)
        }

        await admin.from('email_accounts').update(tokenUpdate).eq('id', acct.id)

        // 3. List recent messages (stub - just fetches the list for now)
        const listResult = await listGmailMessages(tokens.access_token, {
          maxResults: 20,
          query: 'newer_than:1d',
        })

        const messageCount = listResult.messages?.length ?? 0
        console.log(
          `[cron/google-sync] Account ${acct.email_address}: ${messageCount} recent messages found`,
        )

        // TODO: Expand - iterate messages, fetch full payloads, upsert into
        // email_messages / email_threads tables (mirror microsoft-sync pattern).

        // Reset error count on success
        await admin
          .from('email_accounts')
          .update({
            error_count: 0,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', acct.id)

        stats.emailsSynced++
      } catch (err) {
        stats.errors++
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(
          `[cron/google-sync] Error for account ${acct.id} (${acct.email_address}):`,
          errorMessage,
        )

        // Increment error count so we back off after MAX_ERROR_COUNT failures
        await admin
          .from('email_accounts')
          .update({
            error_count: (acct.error_count ?? 0) + 1,
            last_error: errorMessage,
            last_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', acct.id)
      }
    }

    return NextResponse.json({ message: 'Google sync complete', stats })
  } catch (error) {
    console.error('[cron/google-sync] Fatal error:', error)
    return NextResponse.json({ error: 'Google sync cron failed', stats }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/google-sync')
