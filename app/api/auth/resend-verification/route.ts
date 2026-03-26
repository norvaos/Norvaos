import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { renderVerificationEmail } from '@/lib/email-templates/verification-email'
import { z } from 'zod'

const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// 3 resend attempts per IP per minute
const resendLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 })

async function handlePost(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, retryAfterMs } = resendLimiter.check(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = resendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email } = parsed.data
    const supabase = createAdminClient()

    // Find the user by email
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 })
    }

    const user = listData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )

    if (!user) {
      // Don't reveal if the email exists  -  return success either way
      return NextResponse.json({ success: true })
    }

    if (user.email_confirmed_at) {
      // Already verified
      return NextResponse.json({ success: true, message: 'Email already verified.' })
    }

    // Generate a magic-link confirmation URL (does NOT send an email itself)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[resend-verification] generateLink error:', linkError?.message ?? 'no action_link')
      return NextResponse.json({ error: 'Failed to resend verification email.' }, { status: 500 })
    }

    // Send the branded verification email via Resend
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('[resend-verification] RESEND_API_KEY not configured')
      return NextResponse.json({ error: 'Email service not configured.' }, { status: 500 })
    }

    const firstName = (user.user_metadata?.first_name as string) || 'there'
    const firmName = (user.user_metadata?.firm_name as string) || 'NorvaOS'
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'
    const fromAddress = fromDomain === 'resend.dev'
      ? 'onboarding@resend.dev'
      : `NorvaOS <notifications@${fromDomain}>`

    const { html, text, subject } = await renderVerificationEmail({
      firmName,
      firstName,
      verificationUrl: linkData.properties.action_link,
    })

    const resend = new Resend(resendApiKey)
    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject,
      html,
      text,
    })

    if (sendError) {
      console.error('[resend-verification] Resend send error:', sendError)
      return NextResponse.json({ error: 'Failed to send verification email.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/auth/resend-verification')
