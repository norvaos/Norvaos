import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import type { Json } from '@/lib/types/database'

/**
 * POST /api/push/subscribe
 *
 * Save a browser push subscription to the user's device_tokens array.
 *
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 */
async function handlePost(request: Request) {
  try {
    const { userId, supabase } = await authenticateRequest()
    // No requirePermission — self-service push subscription for authenticated users

    const body = await request.json()
    const { subscription } = body as {
      subscription?: {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }
    }

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    // Fetch current device_tokens (read via auth-scoped client)
    const { data: user } = await supabase
      .from('users')
      .select('device_tokens')
      .eq('id', userId)
      .single()

    const existing = (user?.device_tokens as Array<Record<string, unknown>> | null) ?? []

    // Deduplicate by endpoint
    const filtered = existing.filter(
      (t) => (t as { endpoint?: string }).endpoint !== subscription.endpoint
    )

    const updated = [
      ...filtered,
      {
        platform: 'web',
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        token: subscription.endpoint, // legacy compat
        created_at: new Date().toISOString(),
      },
    ]

    // Write via admin client to bypass RLS
    const admin = createAdminClient()
    await admin
      .from('users')
      .update({ device_tokens: updated as unknown as Json })
      .eq('id', userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/push/subscribe')
