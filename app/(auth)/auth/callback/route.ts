import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import { renderWelcomeEmail } from '@/lib/email-templates/welcome-email'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const type = searchParams.get('type') // Supabase passes type=signup for email confirmation

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data?.user) {
      // Send welcome email on first email confirmation (signup verification)
      if (type === 'signup' || type === 'email') {
        try {
          const user = data.user
          const firstName = user.user_metadata?.first_name ?? 'there'
          const firmName = user.user_metadata?.firm_name ?? 'your firm'
          const email = user.email

          if (email) {
            // Check if welcome email was already sent (prevent duplicates on refresh)
            const admin = createAdminClient()
            const { count } = await admin
              .from('activities')
              .select('id', { count: 'exact', head: true })
              .eq('activity_type', 'welcome_email_sent')
              .eq('description', email)

            if ((count ?? 0) === 0) {
              const dashboardUrl = `${origin}/`
              const { html, text, subject } = await renderWelcomeEmail({
                firmName,
                firstName,
                dashboardUrl,
              })

              await resend.emails.send({
                from: process.env.RESEND_FROM_DOMAIN === 'resend.dev'
                  ? 'NorvaOS <onboarding@resend.dev>'
                  : (process.env.RESEND_FROM_EMAIL ?? `NorvaOS <notifications@${process.env.RESEND_FROM_DOMAIN || 'norvaos.com'}>`),
                to: email,
                subject,
                html,
                text,
              })

              // Log to prevent duplicates
              await admin.from('activities').insert({
                activity_type: 'welcome_email_sent',
                title: 'Welcome email sent',
                description: email,
                entity_type: 'user',
                entity_id: user.id,
              } as any)
            }
          }
        } catch (e) {
          // Non-blocking — don't prevent login if welcome email fails
          console.error('[auth/callback] Failed to send welcome email:', e)
        }

        // Auto-provision the tenant with the Golden Template
        try {
          const provisionRes = await fetch(`${origin}/api/onboarding/wizard/default`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': request.headers.get('cookie') ?? '',
            },
          })
          if (!provisionRes.ok) {
            console.error('[auth/callback] Auto-provisioning failed:', await provisionRes.text())
          }
        } catch (e) {
          console.error('[auth/callback] Auto-provisioning error:', e)
        }

        // ── Contextual routing based on role ────────────────────────────
        // Look up all memberships for this auth user to decide where to land.
        try {
          const admin = createAdminClient()
          const { data: memberships } = await admin
            .from('users')
            .select('tenant_id, role_id, roles!inner(name, permissions)')
            .eq('auth_user_id', data.user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })

          const hasOwnerRole = memberships?.some((m: any) => {
            const roleName = m.roles?.name?.toLowerCase()
            const perms = m.roles?.permissions as Record<string, any> | null
            // Owner/Admin = has settings + users CRUD
            return (
              roleName === 'admin' ||
              roleName === 'owner' ||
              (perms?.settings?.create && perms?.users?.create)
            )
          })

          if (hasOwnerRole) {
            return NextResponse.redirect(`${origin}/provisioning`)
          }

          // Client-only: redirect to portal
          return NextResponse.redirect(`${origin}/portal`)
        } catch (e) {
          console.error('[auth/callback] Role lookup failed, defaulting to provisioning:', e)
          return NextResponse.redirect(`${origin}/provisioning`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
