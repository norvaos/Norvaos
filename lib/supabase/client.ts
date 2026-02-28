import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!cached) {
    cached = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return cached
}
