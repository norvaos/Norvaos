/**
 * Database assertion utility for action definitions.
 *
 * Every Supabase write in an action execute() function must check for errors.
 * This utility wraps the result and throws a descriptive error on failure,
 * preventing silent data loss.
 *
 * Usage:
 *   const lead = assertOk(
 *     await supabase.from('leads').update({ ... }).eq('id', id).select().single(),
 *     'log_call:update_lead'
 *   )
 */

interface SupabaseResult<T> {
  data: T
  error: { message: string; code?: string; details?: string } | null
}

/**
 * Assert that a Supabase query succeeded. Throws with context on failure.
 */
export function assertOk<T>(result: SupabaseResult<T>, context: string): T {
  if (result.error) {
    throw new Error(`[${context}] Database error: ${result.error.message}`)
  }
  return result.data
}

/**
 * Assert that a Supabase query succeeded, allowing null data (e.g. for updates without .select()).
 */
export function assertNoError<T>(result: SupabaseResult<T>, context: string): void {
  if (result.error) {
    throw new Error(`[${context}] Database error: ${result.error.message}`)
  }
}
