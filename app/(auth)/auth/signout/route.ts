import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * POST /auth/signout
 *
 * Signs the user out of Supabase and clears all middleware cache cookies,
 * then redirects to /login.
 *
 * Used by the Front Desk header <form action="/auth/signout" method="post">
 * and can also be called programmatically via fetch() from any component.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()

  const origin = new URL(request.url).origin
  const response = NextResponse.redirect(`${origin}/`, { status: 303 })

  // Clear all middleware role/state cache cookies so the next login
  // re-resolves permissions, change-password status, and onboarding status.
  response.cookies.delete('__fd_role')
  response.cookies.delete('__chpw')
  response.cookies.delete('__ob_done')

  return response
}
