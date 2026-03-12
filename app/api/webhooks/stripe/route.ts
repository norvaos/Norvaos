import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/config'
import { createClient } from '@supabase/supabase-js'
import { withTiming } from '@/lib/middleware/request-timing'
import type Stripe from 'stripe'

// Use service role client for webhook processing (bypasses RLS)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Extract period dates from a Stripe subscription object.
 * Stripe API 2025+ moved these to `current_period` sub-object.
 */
function getSubscriptionPeriod(sub: Record<string, unknown>): {
  periodStart: string | null
  periodEnd: string | null
} {
  // Try new API format: sub.current_period.start / sub.current_period.end
  const currentPeriod = sub.current_period as { start?: number; end?: number } | undefined
  if (currentPeriod?.start && currentPeriod?.end) {
    return {
      periodStart: new Date(currentPeriod.start * 1000).toISOString(),
      periodEnd: new Date(currentPeriod.end * 1000).toISOString(),
    }
  }

  // Fallback: try legacy format (current_period_start / current_period_end)
  const legacyStart = sub.current_period_start as number | undefined
  const legacyEnd = sub.current_period_end as number | undefined
  if (legacyStart && legacyEnd) {
    return {
      periodStart: new Date(legacyStart * 1000).toISOString(),
      periodEnd: new Date(legacyEnd * 1000).toISOString(),
    }
  }

  return { periodStart: null, periodEnd: null }
}

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for subscription lifecycle
 */
async function handlePost(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Webhook signature verification failed: ${message}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  try {
    switch (event.type) {
      // ─── Checkout completed (new subscription) ───────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.metadata?.tenant_id
        const planTier = session.metadata?.plan_tier || 'starter'

        if (!tenantId) {
          console.error('No tenant_id in checkout session metadata')
          break
        }

        // Update tenant with Stripe customer ID and subscription info
        await supabase
          .from('tenants')
          .update({
            stripe_customer_id: session.customer as string,
            subscription_tier: planTier,
            subscription_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId)

        // Create subscription record
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          const subRaw = subscription as unknown as Record<string, unknown>
          const { periodStart, periodEnd } = getSubscriptionPeriod(subRaw)

          await supabase.from('subscriptions').upsert({
            tenant_id: tenantId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: session.customer as string,
            plan_tier: planTier,
            status: subscription.status,
            billing_interval: subscription.items.data[0]?.price?.recurring?.interval || 'month',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id' })
        }

        console.log(`Checkout completed for tenant ${tenantId}, plan: ${planTier}`)
        break
      }

      // ─── Subscription updated (plan change, renewal, etc.) ──────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const tenantId = subscription.metadata?.tenant_id

        if (!tenantId) {
          // Look up tenant by stripe_customer_id
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single()

          if (!tenant) {
            console.error('No tenant found for Stripe customer:', subscription.customer)
            break
          }

          await updateSubscription(supabase, tenant.id, subscription)
        } else {
          await updateSubscription(supabase, tenantId, subscription)
        }
        break
      }

      // ─── Subscription deleted (cancelled or expired) ────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', subscription.customer as string)
          .single()

        if (tenant) {
          await supabase
            .from('tenants')
            .update({
              subscription_status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tenant.id)

          await supabase
            .from('subscriptions')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenant.id)

          console.log(`Subscription cancelled for tenant ${tenant.id}`)
        }
        break
      }

      // ─── Invoice paid (successful payment / renewal) ────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', invoice.customer as string)
          .single()

        if (tenant) {
          const invoiceRaw = invoice as unknown as Record<string, unknown>
          const periodStart = invoiceRaw.period_start as number | undefined
          const periodEnd = invoiceRaw.period_end as number | undefined

          // Record payment
          await supabase.from('billing_invoices').insert({
            tenant_id: tenant.id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: 'paid',
            invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            period_start: periodStart
              ? new Date(periodStart * 1000).toISOString()
              : null,
            period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          })

          // Ensure subscription is active
          await supabase
            .from('tenants')
            .update({
              subscription_status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tenant.id)

          console.log(`Invoice paid for tenant ${tenant.id}: $${(invoice.amount_paid / 100).toFixed(2)}`)
        }
        break
      }

      // ─── Invoice payment failed ─────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', invoice.customer as string)
          .single()

        if (tenant) {
          await supabase.from('billing_invoices').insert({
            tenant_id: tenant.id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: 'failed',
            invoice_url: invoice.hosted_invoice_url,
          })

          await supabase
            .from('tenants')
            .update({
              subscription_status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tenant.id)

          console.log(`Payment failed for tenant ${tenant.id}`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ─── Helper ─────────────────────────────────────────────────────
async function updateSubscription(
  supabase: ReturnType<typeof getAdminClient>,
  tenantId: string,
  subscription: Stripe.Subscription
) {
  const planTier = subscription.metadata?.plan_tier || 'starter'
  const subRaw = subscription as unknown as Record<string, unknown>
  const { periodStart, periodEnd } = getSubscriptionPeriod(subRaw)

  await supabase
    .from('tenants')
    .update({
      subscription_tier: planTier,
      subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)

  await supabase
    .from('subscriptions')
    .upsert({
      tenant_id: tenantId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      plan_tier: planTier,
      status: subscription.status,
      billing_interval: subscription.items.data[0]?.price?.recurring?.interval || 'month',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

  console.log(`Subscription updated for tenant ${tenantId}: ${subscription.status}, plan: ${planTier}`)
}

export const dynamic = 'force-dynamic'
export const POST = withTiming(handlePost, 'POST /api/webhooks/stripe')
