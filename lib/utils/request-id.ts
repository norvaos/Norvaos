/**
 * Request-scoped ID for correlating logs across a single API request.
 *
 * Usage in route handlers:
 *   import { withRequestId, getRequestId } from '@/lib/utils/request-id'
 *
 *   export async function POST(request: Request) {
 *     return withRequestId(async () => {
 *       log.info('handling request', { request_id: getRequestId() })
 *       // ...
 *     })
 *   }
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const requestIdStore = new AsyncLocalStorage<string>()

/**
 * Run a function with a unique request ID in async context.
 */
export function withRequestId<T>(fn: () => Promise<T>): Promise<T> {
  return requestIdStore.run(crypto.randomUUID(), fn)
}

/**
 * Get the current request ID. Returns 'unknown' if called outside withRequestId.
 */
export function getRequestId(): string {
  return requestIdStore.getStore() ?? 'unknown'
}
