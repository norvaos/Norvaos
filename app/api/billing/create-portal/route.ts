import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { stripe } from '@/lib/stripe/config'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/billing/create-portal
 * Creates a Stripe Customer Portal session for managing subscription
 * (update payment method, view invoices, cancel, etc.)
 */
async function handlePost() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const { data: tenant } = await auth.supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', auth.tenantId)
      .single()

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing-plan`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Create portal error:', error)
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const POST = withTiming(handlePost, 'POST /api/billing/create-portal')
