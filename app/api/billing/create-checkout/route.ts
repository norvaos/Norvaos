import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { stripe, getStripePriceId } from '@/lib/stripe/config'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/billing/create-checkout
 * Creates a Stripe Checkout session for subscription purchase
 *
 * Body: { planTier: 'starter' | 'professional' | 'enterprise', interval: 'monthly' | 'yearly' }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'create')

    const { data: tenant } = await auth.supabase
      .from('tenants')
      .select('id, name, stripe_customer_id')
      .eq('id', auth.tenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const { planTier, interval } = await request.json()

    if (!['starter', 'professional', 'enterprise'].includes(planTier)) {
      return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 })
    }
    if (!['monthly', 'yearly'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
    }

    const priceId = getStripePriceId(planTier, interval)

    if (!priceId) {
      return NextResponse.json({ error: 'Stripe price not configured for this plan' }, { status: 400 })
    }

    // Create or reuse Stripe customer
    let customerId = tenant.stripe_customer_id

    if (!customerId) {
      // Get user email for Stripe customer
      const { data: userRecord } = await auth.supabase
        .from('users')
        .select('email')
        .eq('id', auth.userId)
        .single()

      const customer = await stripe.customers.create({
        email: userRecord?.email ?? '',
        name: tenant.name,
        metadata: {
          tenant_id: tenant.id,
        },
      })
      customerId = customer.id

      // Store customer ID
      await auth.supabase
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenant.id)
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          tenant_id: tenant.id,
          plan_tier: planTier,
        },
      },
      metadata: {
        tenant_id: tenant.id,
        plan_tier: planTier,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing-plan?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing-plan?cancelled=true`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Create checkout error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/billing/create-checkout')
