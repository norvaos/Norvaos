import Stripe from 'stripe'

/**
 * Server-side Stripe instance  -  lazily initialised so that
 * the SDK is never constructed at Next.js build time (when
 * STRIPE_SECRET_KEY is not available in the build environment).
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(key, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
      appInfo: {
        name: 'NorvaOS',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      },
    })
  }
  return _stripe
}

// Convenience re-export so existing callers can migrate gradually
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as never)[prop]
  },
})

/**
 * Stripe price IDs mapped to our plan tiers
 * These are set via environment variables and created in Stripe Dashboard
 */
export const STRIPE_PRICES = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
  starter_yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '',
  professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '',
  professional_yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || '',
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
  enterprise_yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
} as const

/**
 * Get the Stripe price ID for a given plan and interval
 */
export function getStripePriceId(
  plan: 'starter' | 'professional' | 'enterprise',
  interval: 'monthly' | 'yearly'
): string {
  const key = `${plan}_${interval}` as keyof typeof STRIPE_PRICES
  return STRIPE_PRICES[key]
}
