import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export interface AuthContext {
  userId: string       // users.id (app user)
  authUserId: string   // auth.uid()
  tenantId: string
  supabase: SupabaseClient<Database>
}

/**
 * Authenticate an API route request and resolve user + tenant context.
 * Uses the session cookie to create a server-side Supabase client.
 * Throws structured errors for 401/403 scenarios.
 */
export async function authenticateRequest(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient()

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

  if (authError || !authUser) {
    throw new AuthError('Authentication required', 401)
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_user_id', authUser.id)
    .single()

  if (userError || !appUser) {
    throw new AuthError('User account not found', 403)
  }

  if (!appUser.tenant_id) {
    throw new AuthError('No tenant associated with user', 403)
  }

  return {
    userId: appUser.id,
    authUserId: authUser.id,
    tenantId: appUser.tenant_id,
    supabase: supabase as SupabaseClient<Database>,
  }
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}
