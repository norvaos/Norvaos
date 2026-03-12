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
    !request.nextUrl.pathname.startsWith('/signing')
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
    const isDashboardRoute = pathname === '/' || (
      !pathname.startsWith('/front-desk') &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/auth') &&
      !pathname.startsWith('/login') &&
      !pathname.startsWith('/signup') &&
      !pathname.startsWith('/forgot-password') &&
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
            .select('role_id, roles!inner(name, permissions)')
            .eq('auth_user_id', user.id)
            .limit(1)
            .maybeSingle()

          if (userData) {
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
