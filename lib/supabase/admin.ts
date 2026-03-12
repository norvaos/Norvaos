import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { incrementDbCalls } from '@/lib/middleware/request-timing'

/**
 * Create a Supabase admin client (service_role key, bypasses RLS).
 *
 * Instrumented: each .from() call increments the request-scoped db_calls counter
 * so withTiming can log the count per route.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // Instrument .from() to count DB round-trips
  const originalFrom = client.from.bind(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client as any).from = (table: string) => {
    incrementDbCalls()
    return originalFrom(table)
  }

  return client
}
