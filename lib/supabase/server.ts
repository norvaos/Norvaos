import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types/database'
import { incrementDbCalls } from '@/lib/middleware/request-timing'
import { enforceRegionCompliance } from './region-guard'

// Directive 005.3: Enforce ca-central-1 at module load (server boot).
// If region is wrong, this throws CriticalComplianceError and halts the app.
enforceRegionCompliance()

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )

  // Instrument .from() to count DB round-trips
  const originalFrom = client.from.bind(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client as any).from = (table: string) => {
    incrementDbCalls()
    return (originalFrom as (table: string) => unknown)(table)
  }

  return client
}

/**
 * Service role Supabase client  -  bypasses RLS entirely.
 * Use ONLY for server-side operations that require elevated privileges,
 * such as storage uploads, admin operations, etc.
 * NEVER expose to client-side code.
 */
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
