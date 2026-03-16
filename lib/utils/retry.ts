/**
 * Exponential backoff retry utility.
 *
 * Provides a typed, bounded retry mechanism for async operations.
 * Used by notification and email delivery adapters to harden dispatch
 * without requiring changes to the underlying service implementations.
 *
 * Design constraints:
 * - Max attempts is always finite — no infinite retry loops
 * - Non-retryable errors (HTTP 4xx except 429) are surfaced immediately
 * - Every retry attempt is logged with tenant context via the structured logger
 * - Jitter is applied to spread load under mass failure scenarios
 */

import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of total attempts (including the first). Must be >= 1. */
  maxAttempts: number
  /** Base delay in milliseconds before applying exponential factor. */
  baseDelayMs: number
  /** Ceiling on computed delay — prevents unbounded waits. */
  maxDelayMs: number
  /** Optional tenant identifier for structured log context. */
  tenantId?: string
  /** Optional operation label used in log lines. */
  operation?: string
  /**
   * Called before each retry (not before the first attempt).
   * Receives the 1-based attempt number about to be executed and the
   * error that caused the previous attempt to fail.
   */
  onRetry?: (attempt: number, error: Error) => void
}

export type RetryResult<T> =
  | { success: true; value: T; attempts: number }
  | { success: false; error: Error; attempts: number }

/**
 * Errors that should NOT be retried. These represent caller errors
 * (bad request, unauthorized, forbidden, not found) where retrying
 * will produce the same result. The one exception is 429 (rate limit),
 * which is retried because the server may accept the request later.
 */
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 405, 406, 409, 410, 422, 451])

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Compute delay for the nth retry (1-based) with full jitter.
 *
 * Formula: min(maxDelayMs, baseDelayMs * 2^(attempt-1)) + jitter
 * Jitter: uniform random in [0, computed_base * 0.2] to spread load.
 */
function computeDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1)
  const capped = Math.min(exponential, maxDelayMs)
  const jitter = Math.random() * capped * 0.2
  return Math.floor(capped + jitter)
}

/**
 * Determine whether an error should prevent retrying.
 *
 * Checks the error message for HTTP status codes that indicate
 * a non-retryable client error. This is necessarily heuristic —
 * individual adapters may override this via the `onRetry` callback
 * by throwing a `NonRetryableError` instead.
 */
function isNonRetryable(err: Error): boolean {
  // Allow callers to mark errors explicitly as non-retryable
  if (err instanceof NonRetryableError) return true

  // Heuristic: detect HTTP status in error message (e.g. Resend API errors)
  const match = err.message.match(/\b(4\d\d)\b/)
  if (match) {
    const status = parseInt(match[1], 10)
    return NON_RETRYABLE_HTTP_STATUSES.has(status)
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── NonRetryableError ───────────────────────────────────────────────────────

/**
 * Throw this from inside `fn` to signal that the error is permanent
 * and retrying would be futile (e.g. message validation failure,
 * invalid recipient address).
 */
export class NonRetryableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'NonRetryableError'
  }
}

// ─── Core Retry Function ─────────────────────────────────────────────────────

/**
 * Execute `fn` up to `options.maxAttempts` times with exponential backoff.
 *
 * Returns a discriminated union so callers can handle success and failure
 * without try/catch. Never throws.
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => sendEmail(payload),
 *   { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, tenantId }
 * )
 * if (!result.success) { log.error('send failed', { error: result.error.message }) }
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    tenantId,
    operation = 'operation',
    onRetry,
  } = options

  if (maxAttempts < 1) {
    return {
      success: false,
      error: new Error('retryWithBackoff: maxAttempts must be >= 1'),
      attempts: 0,
    }
  }

  let lastError: Error = new Error('No attempts made')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn()
      if (attempt > 1) {
        log.info('Retry succeeded', {
          tenant_id: tenantId,
          operation,
          attempt,
        })
      }
      return { success: true, value, attempts: attempt }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Non-retryable — surface immediately, no further attempts
      if (isNonRetryable(lastError)) {
        log.warn('Non-retryable error — aborting retry sequence', {
          tenant_id: tenantId,
          operation,
          attempt,
          error_code: 'NON_RETRYABLE',
          error_message: lastError.message,
        })
        return { success: false, error: lastError, attempts: attempt }
      }

      const isLastAttempt = attempt === maxAttempts

      if (isLastAttempt) {
        log.error('All retry attempts exhausted', {
          tenant_id: tenantId,
          operation,
          attempts_made: maxAttempts,
          error_code: 'RETRY_EXHAUSTED',
          error_message: lastError.message,
        })
        break
      }

      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs)

      log.warn('Attempt failed — will retry', {
        tenant_id: tenantId,
        operation,
        attempt,
        next_attempt: attempt + 1,
        delay_ms: delayMs,
        error_message: lastError.message,
      })

      if (onRetry) {
        try {
          onRetry(attempt + 1, lastError)
        } catch {
          // onRetry callbacks must not abort the retry sequence
        }
      }

      await sleep(delayMs)
    }
  }

  return { success: false, error: lastError, attempts: maxAttempts }
}
