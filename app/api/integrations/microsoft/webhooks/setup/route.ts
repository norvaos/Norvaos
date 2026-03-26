import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOneDriveSubscription } from '@/lib/services/microsoft-webhooks'

/**
 * POST /api/integrations/microsoft/webhooks/setup
 *
 * Creates a Graph webhook subscription for the authenticated user's
 * Microsoft connection. Called after OAuth connect or from settings.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get active Microsoft connection
    const admin = createAdminClient()
    const { data: connection } = await admin
      .from('microsoft_connections')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'No active Microsoft connection' }, { status: 404 })
    }

    // Build the webhook notification URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json({ error: 'APP_URL not configured' }, { status: 500 })
    }
    const notificationUrl = `${appUrl}/api/webhooks/microsoft`

    // Create the subscription
    const subscription = await createOneDriveSubscription(
      connection.id,
      admin,
      notificationUrl
    )

    // Store in DB
    await admin.from('graph_webhook_subscriptions').insert({
      tenant_id: profile.tenant_id,
      connection_id: connection.id,
      graph_subscription_id: subscription.id,
      resource: subscription.resource,
      change_types: subscription.changeType,
      client_state: subscription.clientState,
      notification_url: subscription.notificationUrl,
      expiration_datetime: subscription.expirationDateTime,
    })

    return NextResponse.json({
      message: 'Webhook subscription created',
      subscriptionId: subscription.id,
      expiresAt: subscription.expirationDateTime,
    })
  } catch (error) {
    console.error('[webhook-setup] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create webhook'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
