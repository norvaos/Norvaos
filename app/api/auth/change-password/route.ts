import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

/**
 * POST /api/auth/change-password
 *
 * Clears the must_change_password flag on the user's row.
 * The actual password update is done client-side via supabase.auth.updateUser().
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Update the auth user's password via admin API
    const { error: pwErr } = await admin.auth.admin.updateUserById(auth.authUserId, {
      password: parsed.data.password,
    })

    if (pwErr) {
      return NextResponse.json({ error: pwErr.message }, { status: 400 })
    }

    // Clear the must_change_password flag
    const { error: updateErr } = await admin
      .from('users')
      .update({ must_change_password: false } as any)
      .eq('auth_user_id', auth.authUserId)

    if (updateErr) {
      return NextResponse.json(
        { error: 'Password updated but failed to clear change-password flag. Contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { success: true }, error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/auth/change-password')
