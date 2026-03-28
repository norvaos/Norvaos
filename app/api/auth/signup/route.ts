import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { isJurisdictionEnabled, DEFAULT_JURISDICTION } from '@/lib/config/jurisdictions'
import { withTiming } from '@/lib/middleware/request-timing'
import { Resend } from 'resend'
import { renderVerificationEmail } from '@/lib/email-templates/verification-email'
import { z } from 'zod'

const signupSchema = z.object({
  firmName: z.string().min(1, 'Firm name is required').max(255),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  jurisdictionCode: z.string().optional(),
  membershipNo: z.string().max(100).optional(),
})

// 5 signups per IP per minute
const signupLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })

async function handlePost(request: Request) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, retryAfterMs } = await signupLimiter.check(ip)
  if (!allowed) {
    return NextResponse.json(
      { data: null, error: 'Too many signup attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { firmName, firstName, lastName, email, password, jurisdictionCode, membershipNo } = parsed.data

    // Validate jurisdiction
    const jurisdiction = jurisdictionCode || DEFAULT_JURISDICTION
    if (!isJurisdictionEnabled(jurisdiction)) {
      return NextResponse.json(
        { data: null, error: `Jurisdiction '${jurisdiction}' is not currently available.` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Step 1: Resolve auth user  -  create fresh or reuse existing
    // An email may already have an auth account (e.g. invited to another tenant).
    // In that case we reuse the existing auth_user_id and update their password,
    // then create a brand-new tenant for them. Each tenant is fully isolated by RLS.
    let authUserId: string
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          firm_name: firmName,
        },
      })

    if (authError) {
      const alreadyExists =
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('already been registered') ||
        authError.message.toLowerCase().includes('email address is already')

      if (!alreadyExists) {
        return NextResponse.json(
          { data: null, error: authError.message },
          { status: 400 }
        )
      }

      // Email already has an auth account  -  look it up and update password
      const { data: listData, error: listError } =
        await supabase.auth.admin.listUsers()
      if (listError) {
        return NextResponse.json(
          { data: null, error: 'Failed to resolve existing account.' },
          { status: 500 }
        )
      }
      const existing = listData.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      )
      if (!existing) {
        return NextResponse.json(
          { data: null, error: 'Account conflict  -  please try again or contact support.' },
          { status: 400 }
        )
      }

      // Update password so the user can sign in with the credentials they just provided
      await supabase.auth.admin.updateUserById(existing.id, { password })

      // If the existing user is not email-confirmed, re-trigger verification
      if (!existing.email_confirmed_at) {
        // Generate a new signup confirmation link  -  Supabase will send the email
        await supabase.auth.admin.generateLink({
          type: 'signup',
          email,
          password,
        }).catch((e) => {
          console.warn('[signup] Failed to regenerate verification for existing user:', e)
        })
      }

      authUserId = existing.id
    } else {
      authUserId = authData.user.id
    }
    const authUserIsNew = !authError

    // Step 2: Create the tenant
    // Seat-limit exempt: signup creates a new tenant with 0 users, always passes.
    // max_users is set explicitly (non-null) because the DB trigger (enforce_max_users)
    // raises an exception when max_users IS NULL.
    // Slug must be globally unique  -  append a short random suffix on collision.
    const baseSlug = firmName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Try base slug first, then append random 4-char hex suffix until unique
    let slug = baseSlug
    {
      const { count } = await supabase
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .eq('slug', slug)
      if ((count ?? 0) > 0) {
        slug = `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`
      }
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: firmName,
        slug,
        primary_color: '#1e293b',
        secondary_color: '#64748b',
        accent_color: '#3b82f6',
        timezone: 'America/Toronto',
        currency: 'CAD',
        date_format: 'DD-MM-YYYY',
        subscription_tier: 'starter',
        subscription_status: 'trialing',
        max_users: 5,
        max_storage_gb: 5,
        feature_flags: {
          front_desk_mode: true,
          portal_enabled: true,
          billing_enabled: true,
        },
        settings: {},
        portal_branding: {},
        jurisdiction_code: jurisdiction,
      })
      .select()
      .single()

    if (tenantError) {
      if (authUserIsNew) await supabase.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { data: null, error: `Failed to create firm: ${tenantError.message}` },
        { status: 500 }
      )
    }

    // Step 3: Create the admin role with full permissions
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .insert({
        tenant_id: tenant.id,
        name: 'Admin',
        description: 'Full access to all features and settings',
        permissions: {
          contacts: { create: true, read: true, update: true, delete: true },
          matters: { create: true, read: true, update: true, delete: true },
          leads: { create: true, read: true, update: true, delete: true },
          tasks: { create: true, read: true, update: true, delete: true },
          billing: { create: true, read: true, update: true, delete: true },
          reports: { create: true, read: true, update: true, delete: true },
          settings: { create: true, read: true, update: true, delete: true },
          users: { create: true, read: true, update: true, delete: true },
        },
        is_system: true,
      })
      .select()
      .single()

    if (roleError) {
      await supabase.from('tenants').delete().eq('id', tenant.id)
      if (authUserIsNew) await supabase.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { data: null, error: `Failed to create role: ${roleError.message}` },
        { status: 500 }
      )
    }

    // Step 4: Create the user record linked to auth user and tenant
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_user_id: authUserId,
        email,
        first_name: firstName,
        last_name: lastName,
        role_id: role.id,
        is_active: true,
        notification_prefs: {
          email: true,
          push: true,
          in_app: true,
        },
        device_tokens: [],
        calendar_sync_enabled: false,
        settings: {},
        ...(membershipNo ? { rep_membership_number: membershipNo } : {}),
      })
      .select()
      .single()

    if (userError) {
      await supabase.from('roles').delete().eq('id', role.id)
      await supabase.from('tenants').delete().eq('id', tenant.id)
      if (authUserIsNew) await supabase.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { data: null, error: `Failed to create user: ${userError.message}` },
        { status: 500 }
      )
    }

    // ─── Send branded verification email via Resend ──
    // Supabase does NOT auto-send verification emails when using admin.createUser
    // with email_confirm: false. We must send it explicitly.
    let emailStatus = 'not_attempted'
    try {
      console.log('[signup] Generating verification link for:', email)
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })

      if (linkError) {
        console.error('[signup] generateLink error:', linkError.message)
        emailStatus = `link_error: ${linkError.message}`
      } else if (!linkData?.properties?.action_link) {
        console.warn('[signup] generateLink returned no action_link')
        emailStatus = 'no_action_link'
      } else {
        console.log('[signup] Verification link generated, sending via Resend...')
        const resendApiKey = process.env.RESEND_API_KEY
        if (!resendApiKey) {
          console.error('[signup] RESEND_API_KEY is not set!')
          emailStatus = 'missing_api_key'
        } else {
          const fromDomain = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'
          const fromAddress = fromDomain === 'resend.dev'
            ? 'onboarding@resend.dev'
            : `NorvaOS <notifications@${fromDomain}>`

          console.log('[signup] Sending from:', fromAddress, 'to:', email)

          const { html, text, subject } = await renderVerificationEmail({
            firmName,
            firstName,
            verificationUrl: linkData.properties.action_link,
          })

          const resend = new Resend(resendApiKey)
          const { data: sendData, error: sendError } = await resend.emails.send({
            from: fromAddress,
            to: email,
            subject,
            html,
            text,
          })

          if (sendError) {
            console.error('[signup] Resend API error:', JSON.stringify(sendError))
            emailStatus = `send_error: ${JSON.stringify(sendError)}`
          } else {
            console.log('[signup] Verification email sent successfully. Resend ID:', sendData?.id)
            emailStatus = 'sent'
          }
        }
      }
    } catch (emailErr) {
      console.error('[signup] Verification email exception:', emailErr)
      emailStatus = `exception: ${emailErr}`
    }

    return NextResponse.json({
      data: { user, tenant },
      error: null,
    })
  } catch {
    return NextResponse.json(
      { data: null, error: 'An unexpected error occurred during sign up.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/auth/signup')
