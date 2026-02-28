import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { firmName, firstName, lastName, email, password } = body

    // Validate required fields
    if (!firmName || !firstName || !lastName || !email || !password) {
      return NextResponse.json(
        { data: null, error: 'All fields are required.' },
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
