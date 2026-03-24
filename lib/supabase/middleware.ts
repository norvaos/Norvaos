import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Use getSession() for local JWT decode instead of getUser() which makes
  // a network call to Supabase Auth on every request. Full JWT verification
  // still happens in authenticateRequest() on API routes.
  // Scale Fix Pack v1: eliminates ~100-500ms network call per page navigation.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  // Protected routes - redirect to login if not authenticated
  if (
    !user &&
    request.nextUrl.pathname !== '/' &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/forgot-password') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api') &&
    !request.nextUrl.pathname.startsWith('/portal') &&
    !request.nextUrl.pathname.startsWith('/forms') &&
    !request.nextUrl.pathname.startsWith('/booking') &&
    !request.nextUrl.pathname.startsWith('/kiosk') &&
    !request.nextUrl.pathname.startsWith('/invite') &&
    !request.nextUrl.pathname.startsWith('/signing') &&
    !request.nextUrl.pathname.startsWith('/help')
  ) {
    const url = request.nextUrl.clone()
    const redirectPath = request.nextUrl.pathname
    url.pathname = '/login'
    // Preserve the intended destination so login can redirect back
    if (redirectPath && redirectPath !== '/') {
      url.searchParams.set('redirect', redirectPath)
    }
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (
    user &&
    (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/signup'))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // ── Front Desk Route Hardening ──────────────────────────────────────────
  // If user has front_desk:view permission but NOT general CRM access,
  // block all dashboard routes and redirect to /front-desk.
  // Uses a short-lived cookie cache to avoid a DB query on every request.
  if (user) {
    const pathname = request.nextUrl.pathname

    // Only check for dashboard routes (skip front-desk, api, auth, portal, etc.)
    const isDashboardRoute = (
      !pathname.startsWith('/front-desk') &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/auth') &&
      !pathname.startsWith('/login') &&
      !pathname.startsWith('/signup') &&
      !pathname.startsWith('/forgot-password') &&
      !pathname.startsWith('/change-password') &&
      !pathname.startsWith('/onboarding') &&
      !pathname.startsWith('/portal') &&
      !pathname.startsWith('/kiosk') &&
      !pathname.startsWith('/booking') &&
      !pathname.startsWith('/forms') &&
      !pathname.startsWith('/_next')
    )

    if (isDashboardRoute) {
      // Check cookie cache first (5 min TTL)
      const cachedRole = request.cookies.get('__fd_role')?.value

      if (cachedRole === 'front_desk_only') {
        // Cached: user is front-desk-only → redirect
        const url = request.nextUrl.clone()
        url.pathname = '/front-desk'
        return NextResponse.redirect(url)
      }

      if (!cachedRole) {
        // No cache — resolve role from DB (one query, cached for 5 min)
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('role_id, is_active, roles!inner(name, permissions)')
            .eq('auth_user_id', user.id)
            .limit(1)
            .maybeSingle()

          if (userData) {
            // Block deactivated users at navigation level
            if (userData.is_active === false) {
              const url = request.nextUrl.clone()
              url.pathname = '/login'
              url.searchParams.set('error', 'account_deactivated')
              // Clear the session cookie so they can't keep navigating
              supabaseResponse.cookies.delete('__fd_role')
              return NextResponse.redirect(url)
            }

            const role = (userData as any).roles as { name: string; permissions: Record<string, any> } | null
            const perms = role?.permissions ?? {}
            const hasFrontDesk = perms.front_desk?.view === true
            const hasMatters = perms.matters?.view === true
            const isAdmin = role?.name === 'Admin'

            const roleTag = (hasFrontDesk && !hasMatters && !isAdmin) ? 'front_desk_only' : 'full_access'

            // Set cache cookie (5 min, httpOnly)
            supabaseResponse.cookies.set('__fd_role', roleTag, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 300, // 5 minutes
              path: '/',
            })

            if (roleTag === 'front_desk_only') {
              const url = request.nextUrl.clone()
              url.pathname = '/front-desk'
              return NextResponse.redirect(url)
            }
          }
        } catch (err) {
          // Fail-closed: if role check fails, redirect to front-desk as safe default
          console.error('[middleware] Role check failed, redirecting to /front-desk', err instanceof Error ? err.message : err)
          const url = request.nextUrl.clone()
          url.pathname = '/front-desk'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  // ── Must-Change-Password Gate ────────────────────────────────────────────────
  // If an admin created the user with a temp password, force them to set their
  // own password before accessing any page. Uses cookie __chpw to cache result.
  if (user) {
    const pathname = request.nextUrl.pathname
    // Page lives at /change-password (app/(auth)/change-password/page.tsx)
    const isChangePwRoute = pathname.startsWith('/change-password')
    const isApiRoute      = pathname.startsWith('/api')
    const isSystemRoute   = (
      pathname.startsWith('/front-desk') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/portal') ||
      pathname.startsWith('/kiosk') ||
      pathname.startsWith('/booking') ||
      pathname.startsWith('/forms') ||
      pathname.startsWith('/invite') ||
      pathname.startsWith('/signing') ||
      pathname.startsWith('/_next')
    )

    if (!isChangePwRoute && !isApiRoute && !isSystemRoute) {
      const chpwDone = request.cookies.get('__chpw')?.value

      if (chpwDone !== '0') {
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('must_change_password')
            .eq('auth_user_id', user.id)
            .limit(1)
            .maybeSingle()

          if ((userData as any)?.must_change_password === true) {
            const url = request.nextUrl.clone()
            url.pathname = '/change-password'
            return NextResponse.redirect(url)
          } else {
            // Cache: no need to change password (5 min)
            supabaseResponse.cookies.set('__chpw', '0', {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 300,
              path: '/',
            })
          }
        } catch {
          // Fail-open: let user through rather than blocking
        }
      }
    }
  }

  // ── Onboarding Gate ─────────────────────────────────────────────────────────
  // If a logged-in user's tenant hasn't completed onboarding, redirect them to
  // /onboarding unless they're already on an /onboarding* or /api* route.
  // Uses a short-lived cookie cache (__ob_done) to avoid a DB query on every
  // page navigation. TTL 10 min (sufficient to get through the wizard in one go).
  if (user) {
    const pathname = request.nextUrl.pathname

    const isOnboardingRoute = pathname.startsWith('/onboarding')
    const isApiRoute        = pathname.startsWith('/api')
    const isSystemRoute     = (
      pathname.startsWith('/front-desk') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/change-password') ||
      pathname.startsWith('/portal') ||
      pathname.startsWith('/kiosk') ||
      pathname.startsWith('/booking') ||
      pathname.startsWith('/forms') ||
      pathname.startsWith('/invite') ||
      pathname.startsWith('/signing') ||
      pathname.startsWith('/provisioning') ||
      pathname.startsWith('/_next')
    )

    if (!isOnboardingRoute && !isApiRoute && !isSystemRoute) {
      const obDone = request.cookies.get('__ob_done')?.value

      if (obDone !== '1') {
        // Check wizard status in DB
        try {
          // RLS policy on tenant_onboarding_wizard scopes by auth.uid(),
          // so no explicit tenant_id filter is needed here.
          const { data: wizard } = await supabase
            .from('tenant_onboarding_wizard')
            .select('status')
            .limit(1)
            .maybeSingle()

          // RLS returns the row only if it belongs to the current user's tenant.
          // Supabase anon client RLS uses auth.uid() which the getSession() call
          // above already refreshed in the cookie.
          // If no wizard row exists (never started) treat as not complete.
          const isComplete =
            wizard?.status === 'activated' || wizard?.status === 'default_applied'

          if (isComplete) {
            // Cache the result so we don't query on every navigation
            supabaseResponse.cookies.set('__ob_done', '1', {
              httpOnly: true,
              secure:   process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge:   600, // 10 minutes
              path:     '/',
            })
          } else {
            // Redirect to onboarding gate page
            const url = request.nextUrl.clone()
            url.pathname = '/onboarding'
            return NextResponse.redirect(url)
          }
        } catch {
          // If the onboarding check fails, let the user through rather than
          // blocking them. The wizard page itself will handle the state.
        }
      }
    }
  }

  // ── Security Headers ────────────────────────────────────────────────────────
  // Applied to all responses for defense-in-depth.
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
  // Document view API is loaded in same-origin iframes for PDF/image preview.
  // Use SAMEORIGIN for that route; DENY everywhere else.
  const isDocumentView = request.nextUrl.pathname === '/api/documents/view'
  supabaseResponse.headers.set('X-Frame-Options', isDocumentView ? 'SAMEORIGIN' : 'DENY')
  supabaseResponse.headers.set('X-XSS-Protection', '1; mode=block')
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS: enforce HTTPS. max-age=1y, includeSubDomains. Only effective over HTTPS.
  supabaseResponse.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )

  return supabaseResponse
}
