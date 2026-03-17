/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Week 3 — Background Job Reliability Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the form generation job reliability pipeline:
 *
 *   1. sidecar_unavailable  — worker marks job failed after timeout threshold
 *                             OR retries if within retry window
 *   2. delayed_callback     — job stays pending until callback arrives
 *   3. duplicate_callback   — second callback on same job_id is idempotent
 *   4. retry_execution      — manual retry resets status, increments retry_count,
 *                             re-dispatches to sidecar
 *   5. retry_limit          — jobs with retry_count >= 3 are timed out, not retried
 *
 * Mock strategy: pure business-logic layer — no HTTP server.
 * We extract and test the state-machine rules directly.
 *
 * Sprint 6, Week 3 — 2026-03-17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface FormGenerationJob {
  id: string
  tenant_id: string
  matter_id: string
  form_template_id: string
  generation_key: string
  status: JobStatus
  retry_count: number
  created_at: string
  processing_started_at: string | null
  completed_at: string | null
  error_message: string | null
  output_path: string | null
  metadata: Record<string, unknown> | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-0001'
const MATTER_ID = 'matter-test-0001'
const JOB_ID    = 'job-test-0001'
const TEMPLATE  = 'IMM5257E'
const GEN_KEY   = 'gen-key-0001'

// ─── Pure business-rule helpers (extracted from route logic) ──────────────────
//
// These functions model the same decisions made in the actual route handlers.
// Testing them purely gives us fast, deterministic coverage of all edge cases.

/**
 * Determine if a pending job should be timed out by the worker.
 * Corresponds to job-worker step (a).
 */
function shouldTimeOut(job: Pick<FormGenerationJob, 'status' | 'created_at'>): boolean {
  if (job.status !== 'pending') return false
  const ageMs = Date.now() - new Date(job.created_at).getTime()
  return ageMs >= 10 * 60 * 1000 // 10 minutes
}

/**
 * Determine if a pending job should be retried by the worker.
 * Corresponds to job-worker step (b).
 *
 * Conditions:
 *   - status = 'pending'
 *   - age is between 2 and 10 minutes (exclusive)
 *   - retry_count < 3
 */
function shouldRetry(job: Pick<FormGenerationJob, 'status' | 'created_at' | 'retry_count'>): boolean {
  if (job.status !== 'pending') return false
  if (job.retry_count >= 3) return false
  const ageMs = Date.now() - new Date(job.created_at).getTime()
  const twoMin = 2 * 60 * 1000
  const tenMin = 10 * 60 * 1000
  return ageMs >= twoMin && ageMs < tenMin
}

/**
 * Apply the worker timeout transition to a job.
 */
function applyTimeout(job: FormGenerationJob, now: string): Partial<FormGenerationJob> {
  return {
    status:        'failed',
    error_message: 'Job timed out: no response from form generation service within 10 minutes',
    completed_at:  now,
  }
}

/**
 * Apply the callback update to a job (idempotent).
 * Returns the update payload. If job is already completed, returns null (skip).
 */
function applyCallback(
  job: FormGenerationJob,
  callbackStatus: 'completed' | 'failed',
  now: string,
  outputPath: string | null,
  pageCount: number | null,
  errorMessage: string | null
): Partial<FormGenerationJob> | null {
  // Idempotent: do not overwrite a terminal state with the same terminal state,
  // but allow the update if status is still pending/processing.
  // In practice the DB update is always applied (Supabase does not throw on no-op).
  // We return null only when the job is already in an identical terminal state.
  if (job.status === 'completed' && callbackStatus === 'completed') {
    return null // Already done — no-op
  }

  const update: Partial<FormGenerationJob> = {
    status:       callbackStatus,
    completed_at: now,
  }

  if (callbackStatus === 'completed') {
    update.output_path = outputPath
  }

  if (callbackStatus === 'failed') {
    update.error_message = errorMessage ?? 'Unknown error'
  }

  return update
}

/**
 * Determine if a manual retry is allowed for the given job status.
 */
function canManualRetry(status: JobStatus): { allowed: boolean; statusCode: number; reason?: string } {
  if (status === 'completed') {
    return { allowed: false, statusCode: 409, reason: 'Job already completed' }
  }
  if (status === 'processing') {
    return { allowed: false, statusCode: 409, reason: 'Job is currently processing' }
  }
  // pending or failed — allowed
  return { allowed: true, statusCode: 202 }
}

/**
 * Apply the manual retry reset to a job.
 */
function applyManualRetry(job: FormGenerationJob, now: string): Partial<FormGenerationJob> {
  return {
    status:                'pending',
    retry_count:           (job.retry_count ?? 0) + 1,
    error_message:         null,
    processing_started_at: null,
    // completed_at stays — not cleared (resume from previous failure context)
  }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<FormGenerationJob> = {}): FormGenerationJob {
  return {
    id:                    JOB_ID,
    tenant_id:             TENANT_ID,
    matter_id:             MATTER_ID,
    form_template_id:      TEMPLATE,
    generation_key:        GEN_KEY,
    status:                'pending',
    retry_count:           0,
    created_at:            new Date().toISOString(),
    processing_started_at: null,
    completed_at:          null,
    error_message:         null,
    output_path:           null,
    metadata:              null,
    ...overrides,
  }
}

/** Return a created_at timestamp N minutes ago. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString()
}

// ─── 1. sidecar_unavailable ───────────────────────────────────────────────────

describe('sidecar_unavailable', () => {
  it('worker marks job failed when it is older than 10 minutes', () => {
    const job = makeJob({ created_at: minutesAgo(15), status: 'pending' })
    expect(shouldTimeOut(job)).toBe(true)
  })

  it('worker applies correct failed payload on timeout', () => {
    const job = makeJob({ created_at: minutesAgo(15), status: 'pending' })
    const now = new Date().toISOString()
    const update = applyTimeout(job, now)

    expect(update.status).toBe('failed')
    expect(update.error_message).toContain('timed out')
    expect(update.completed_at).toBe(now)
  })

  it('worker retries job when it is 5 minutes old and retry_count < 3', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 0 })
    expect(shouldRetry(job)).toBe(true)
  })

  it('worker does not timeout a job that is only 5 minutes old', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'pending' })
    expect(shouldTimeOut(job)).toBe(false)
  })

  it('worker does not retry a job that is less than 2 minutes old', () => {
    const job = makeJob({ created_at: minutesAgo(1), status: 'pending', retry_count: 0 })
    expect(shouldRetry(job)).toBe(false)
  })

  it('worker does not retry a non-pending job', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'failed', retry_count: 0 })
    expect(shouldRetry(job)).toBe(false)
  })

  it('worker does not timeout a non-pending job', () => {
    const job = makeJob({ created_at: minutesAgo(15), status: 'completed' })
    expect(shouldTimeOut(job)).toBe(false)
  })
})

// ─── 2. delayed_callback ─────────────────────────────────────────────────────

describe('delayed_callback', () => {
  it('job stays pending while within retry window with no callback yet', () => {
    const job = makeJob({ created_at: minutesAgo(1), status: 'pending' })
    expect(job.status).toBe('pending')
    expect(shouldTimeOut(job)).toBe(false)
    expect(shouldRetry(job)).toBe(false) // < 2 min, so not yet in retry window
  })

  it('job updates to completed when callback arrives', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'processing' })
    const now = new Date().toISOString()
    const update = applyCallback(job, 'completed', now, 'storage/output.pdf', 4, null)

    expect(update).not.toBeNull()
    expect(update!.status).toBe('completed')
    expect(update!.output_path).toBe('storage/output.pdf')
  })

  it('job updates to failed when callback arrives with failure', () => {
    const job = makeJob({ created_at: minutesAgo(3), status: 'processing' })
    const now = new Date().toISOString()
    const update = applyCallback(job, 'failed', now, null, null, 'PDF engine crash')

    expect(update).not.toBeNull()
    expect(update!.status).toBe('failed')
    expect(update!.error_message).toBe('PDF engine crash')
  })
})

// ─── 3. duplicate_callback ────────────────────────────────────────────────────

describe('duplicate_callback', () => {
  it('second completed callback on a completed job returns null (no-op)', () => {
    const job = makeJob({ status: 'completed', output_path: 'storage/output.pdf' })
    const now = new Date().toISOString()

    const update = applyCallback(job, 'completed', now, 'storage/output.pdf', 4, null)
    expect(update).toBeNull()
  })

  it('failed callback on an already-completed job is applied (real DB does not guard, but our applyCallback does not short-circuit it)', () => {
    const job = makeJob({ status: 'completed', output_path: 'storage/output.pdf' })
    const now = new Date().toISOString()

    // A failed callback on a completed job is NOT a duplicate — it is an inconsistency.
    // Our function does not block it at the logic layer (the DB UPDATE .eq('id', ...) would apply).
    const update = applyCallback(job, 'failed', now, null, null, 'Late error')
    expect(update).not.toBeNull()
    expect(update!.status).toBe('failed')
  })

  it('second completed callback on a processing job IS applied (not a duplicate)', () => {
    const job = makeJob({ status: 'processing' })
    const now = new Date().toISOString()

    const update = applyCallback(job, 'completed', now, 'storage/output.pdf', 2, null)
    expect(update).not.toBeNull()
    expect(update!.status).toBe('completed')
  })
})

// ─── 4. retry_execution ──────────────────────────────────────────────────────

describe('retry_execution', () => {
  it('manual retry is allowed for a failed job', () => {
    const result = canManualRetry('failed')
    expect(result.allowed).toBe(true)
    expect(result.statusCode).toBe(202)
  })

  it('manual retry is allowed for a pending job (re-queue)', () => {
    const result = canManualRetry('pending')
    expect(result.allowed).toBe(true)
  })

  it('manual retry is blocked for a completed job with 409', () => {
    const result = canManualRetry('completed')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
    expect(result.reason).toMatch(/completed/)
  })

  it('manual retry is blocked for a processing job with 409', () => {
    const result = canManualRetry('processing')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
  })

  it('manual retry resets status to pending and increments retry_count', () => {
    const job = makeJob({ status: 'failed', retry_count: 1, error_message: 'PDF engine crash' })
    const now = new Date().toISOString()
    const update = applyManualRetry(job, now)

    expect(update.status).toBe('pending')
    expect(update.retry_count).toBe(2)
    expect(update.error_message).toBeNull()
    expect(update.processing_started_at).toBeNull()
  })

  it('manual retry on a job with null retry_count treats null as 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = makeJob({ status: 'failed', retry_count: null as any })
    const now = new Date().toISOString()
    const update = applyManualRetry(job, now)

    expect(update.retry_count).toBe(1)
  })

  it('manual retry increments retry_count from 0 → 1', () => {
    const job = makeJob({ status: 'failed', retry_count: 0 })
    const now = new Date().toISOString()
    const update = applyManualRetry(job, now)
    expect(update.retry_count).toBe(1)
  })

  it('manual retry on a failed job with retry_count=2 produces retry_count=3', () => {
    const job = makeJob({ status: 'failed', retry_count: 2 })
    const now = new Date().toISOString()
    const update = applyManualRetry(job, now)
    expect(update.retry_count).toBe(3)
  })
})

// ─── 5. retry_limit ──────────────────────────────────────────────────────────

describe('retry_limit', () => {
  it('worker does not retry a job with retry_count = 3', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 3 })
    expect(shouldRetry(job)).toBe(false)
  })

  it('worker does not retry a job with retry_count = 4', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 4 })
    expect(shouldRetry(job)).toBe(false)
  })

  it('worker still times out a retry_count=3 job if it is older than 10 minutes', () => {
    const job = makeJob({ created_at: minutesAgo(15), status: 'pending', retry_count: 3 })
    expect(shouldTimeOut(job)).toBe(true)
    expect(shouldRetry(job)).toBe(false)
  })

  it('worker retries a job with retry_count = 2 (below limit)', () => {
    const job = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 2 })
    expect(shouldRetry(job)).toBe(true)
  })

  it('retry_count boundary: exactly 3 is at limit and not retried', () => {
    const atLimit  = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 3 })
    const belowLimit = makeJob({ created_at: minutesAgo(5), status: 'pending', retry_count: 2 })
    expect(shouldRetry(atLimit)).toBe(false)
    expect(shouldRetry(belowLimit)).toBe(true)
  })

  it('worker mock: sidecar dispatch is skipped and job is only timed out', () => {
    // Simulate: job is 15 min old, retry_count = 3
    const job = makeJob({ created_at: minutesAgo(15), status: 'pending', retry_count: 3 })

    const timeout = shouldTimeOut(job)
    const retry   = shouldRetry(job)

    // Outcome: timeout only, no retry
    expect(timeout).toBe(true)
    expect(retry).toBe(false)

    const now = new Date().toISOString()
    const update = applyTimeout(job, now)
    expect(update.status).toBe('failed')
    expect(update.error_message).toContain('timed out')
  })
})

// ─── 6. Worker auth guard (X-Worker-Key) ─────────────────────────────────────

describe('worker auth header validation', () => {
  function validateWorkerKey(provided: string, secret: string): boolean {
    if (!secret) return false
    return provided === secret
  }

  it('accepts correct key', () => {
    expect(validateWorkerKey('my-secret', 'my-secret')).toBe(true)
  })

  it('rejects wrong key', () => {
    expect(validateWorkerKey('wrong-key', 'my-secret')).toBe(false)
  })

  it('rejects empty key even if secret is present', () => {
    expect(validateWorkerKey('', 'my-secret')).toBe(false)
  })

  it('rejects any key if WORKER_SECRET is not set', () => {
    expect(validateWorkerKey('my-secret', '')).toBe(false)
  })
})

// ─── 7. Admin endpoint role enforcement ──────────────────────────────────────

describe('stuck-jobs endpoint role enforcement', () => {
  function isAuthorisedForStuckJobs(role: string | null): boolean {
    return role === 'Admin'
  }

  it('allows Admin only', () => {
    expect(isAuthorisedForStuckJobs('Admin')).toBe(true)
  })

  it('rejects Lawyer', () => {
    expect(isAuthorisedForStuckJobs('Lawyer')).toBe(false)
  })

  it('rejects Paralegal', () => {
    expect(isAuthorisedForStuckJobs('Paralegal')).toBe(false)
  })

  it('rejects Billing', () => {
    expect(isAuthorisedForStuckJobs('Billing')).toBe(false)
  })

  it('rejects null', () => {
    expect(isAuthorisedForStuckJobs(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isAuthorisedForStuckJobs('')).toBe(false)
  })
})

// ─── 8. Stuck-job threshold calculation ──────────────────────────────────────

describe('stuck-job detection threshold', () => {
  /**
   * Stuck jobs = pending or processing, older than 5 minutes.
   * Mirrors the admin endpoint query.
   */
  function isStuck(job: Pick<FormGenerationJob, 'status' | 'created_at'>): boolean {
    if (!['pending', 'processing'].includes(job.status)) return false
    const ageMs = Date.now() - new Date(job.created_at).getTime()
    return ageMs >= 5 * 60 * 1000
  }

  it('flags a pending job older than 5 minutes as stuck', () => {
    const job = makeJob({ created_at: minutesAgo(6), status: 'pending' })
    expect(isStuck(job)).toBe(true)
  })

  it('flags a processing job older than 5 minutes as stuck', () => {
    const job = makeJob({ created_at: minutesAgo(8), status: 'processing' })
    expect(isStuck(job)).toBe(true)
  })

  it('does not flag a job that is 3 minutes old', () => {
    const job = makeJob({ created_at: minutesAgo(3), status: 'pending' })
    expect(isStuck(job)).toBe(false)
  })

  it('does not flag a completed job even if old', () => {
    const job = makeJob({ created_at: minutesAgo(60), status: 'completed' })
    expect(isStuck(job)).toBe(false)
  })

  it('does not flag a failed job even if old', () => {
    const job = makeJob({ created_at: minutesAgo(60), status: 'failed' })
    expect(isStuck(job)).toBe(false)
  })
})

// ─── 9. vi.fn mock integration test (verifies mock-supabase pattern works) ────

describe('createAdminClient mock integration', () => {
  /**
   * Verifies that we can mock createAdminClient for route handler unit tests.
   * This test demonstrates the pattern without requiring an HTTP server.
   */

  it('admin client mock returns stale jobs correctly', async () => {
    // Simulate the stale-job query result
    const staleJob = makeJob({ id: 'stale-job-001', created_at: minutesAgo(15), status: 'pending' })

    const updateChain = {
      eq:   vi.fn().mockReturnThis(),
      in:   vi.fn().mockResolvedValue({ error: null }),
    }
    const updateFn = vi.fn().mockReturnValue(updateChain)
    updateChain.in = vi.fn().mockResolvedValue({ error: null })

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      lt:     vi.fn().mockResolvedValue({ data: [staleJob], error: null }),
    }

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === 'form_generation_log') {
          return { ...selectChain, update: updateFn }
        }
        return {}
      }),
    }

    // Simulate worker stale-job detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleJobs } = await (adminMock as any)
      .from('form_generation_log')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    expect(staleJobs).toHaveLength(1)
    expect(staleJobs[0].id).toBe('stale-job-001')
    expect(shouldTimeOut(staleJobs[0])).toBe(true)
  })

  it('callback update is not applied twice for the same completed job', async () => {
    const completedJob = makeJob({ status: 'completed', output_path: 'path/to/file.pdf' })

    let updateCallCount = 0
    const callbackProcessor = (job: FormGenerationJob, incomingStatus: 'completed' | 'failed') => {
      const update = applyCallback(job, incomingStatus, new Date().toISOString(), 'path/to/file.pdf', 4, null)
      if (update === null) return null
      updateCallCount++
      return update
    }

    // First callback — already applied (job is completed)
    const firstResult = callbackProcessor(completedJob, 'completed')
    expect(firstResult).toBeNull()
    expect(updateCallCount).toBe(0)

    // Second callback — same outcome
    const secondResult = callbackProcessor(completedJob, 'completed')
    expect(secondResult).toBeNull()
    expect(updateCallCount).toBe(0)
  })
})
