import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { isJurisdictionEnabled, DEFAULT_JURISDICTION } from '@/lib/config/jurisdictions'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const signupSchema = z.object({
  firmName: z.string().min(1, 'Firm name is required').max(255),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  jurisdictionCode: z.string().optional(),
})

// 5 signups per IP per minute
const signupLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })

async function handlePost(request: Request) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, retryAfterMs } = signupLimiter.check(ip)
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

    const { firmName, firstName, lastName, email, password, jurisdictionCode } = parsed.data

    // Validate jurisdiction
    const jurisdiction = jurisdictionCode || DEFAULT_JURISDICTION
    if (!isJurisdictionEnabled(jurisdiction)) {
      return NextResponse.json(
        { data: null, error: `Jurisdiction '${jurisdiction}' is not currently available.` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Step 1: Create the auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          firm_name: firmName,
        },
      })

    if (authError) {
      return NextResponse.json(
        { data: null, error: authError.message },
        { status: 400 }
      )
    }

    const authUserId = authData.user.id

    // Step 2: Create the tenant
    // Seat-limit exempt: signup creates a new tenant with 0 users, always passes.
    // max_users is set explicitly (non-null) because the DB trigger (enforce_max_users)
    // raises an exception when max_users IS NULL.
    const slug = firmName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

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
        date_format: 'YYYY-MM-DD',
        subscription_tier: 'starter',
        subscription_status: 'trialing',
        max_users: 5,
        max_storage_gb: 5,
        feature_flags: {},
        settings: {},
        portal_branding: {},
        jurisdiction_code: jurisdiction,
      })
      .select()
      .single()

    if (tenantError) {
      // Clean up: remove the auth user we just created
      await supabase.auth.admin.deleteUser(authUserId)
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
      // Clean up: remove tenant and auth user
      await supabase.from('tenants').delete().eq('id', tenant.id)
      await supabase.auth.admin.deleteUser(authUserId)
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
      })
      .select()
      .single()

    if (userError) {
      // Clean up: remove role, tenant, and auth user
      await supabase.from('roles').delete().eq('id', role.id)
      await supabase.from('tenants').delete().eq('id', tenant.id)
      await supabase.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { data: null, error: `Failed to create user: ${userError.message}` },
        { status: 500 }
      )
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
