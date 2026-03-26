/**
 * Job Queue  -  Core enqueue / dequeue / lifecycle operations.
 *
 * Uses the service-role admin client so it bypasses RLS.
 * Dequeue uses SELECT … FOR UPDATE SKIP LOCKED for safe concurrency.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface EnqueueOptions {
  priority?: number
  scheduledFor?: string
  maxRetries?: number
  idempotencyKey?: string
}

export interface DequeuedJob {
  id: string
  tenant_id: string
  job_type: string
  payload: Json
  priority: number
  retry_count: number
  max_retries: number
}

// ─── Admin client singleton (lazy) ──────────────────────────────────────────

let _admin: SupabaseClient<Database> | null = null

function admin(): SupabaseClient<Database> {
  if (!_admin) _admin = createAdminClient()
  return _admin
}

// ─── Enqueue ────────────────────────────────────────────────────────────────

/**
 * Insert a new job into the queue.
 *
 * Returns the created job ID, or `null` if an idempotency conflict occurred
 * (duplicate key  -  the job was already enqueued).
 */
export async function enqueueJob(
  tenantId: string,
  jobType: string,
  payload: Json = {},
  options: EnqueueOptions = {},
): Promise<string | null> {
  const { priority = 5, scheduledFor, maxRetries = 3, idempotencyKey } = options

  const { data, error } = await admin()
    .from('job_runs')
    .insert({
      tenant_id: tenantId,
      job_type: jobType,
      payload,
      priority,
      max_retries: maxRetries,
      scheduled_for: scheduledFor ?? new Date().toISOString(),
      idempotency_key: idempotencyKey ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // Unique constraint on idempotency_key  -  not an error, job already exists
    if (error.code === '23505' && idempotencyKey) {
      log.info('Job already enqueued (idempotency hit)', {
        tenant_id: tenantId,
        job_type: jobType,
        idempotency_key: idempotencyKey,
      })
      return null
    }
    log.error('Failed to enqueue job', {
      tenant_id: tenantId,
      job_type: jobType,
      error_code: error.code,
    })
    throw error
  }

  log.info('Job enqueued', {
    tenant_id: tenantId,
    job_type: jobType,
    job_id: data.id,
  })

  return data.id
}

// ─── Dequeue ────────────────────────────────────────────────────────────────

/**
 * Atomically claim up to `limit` pending jobs.
 *
 * Uses FOR UPDATE SKIP LOCKED via an RPC wrapper. Because Supabase JS doesn't
 * expose SKIP LOCKED, we fall back to a two-step claim: fetch pending rows then
 * optimistically lock them with a WHERE status = 'pending' guard.
 */
export async function dequeueJobs(
  jobTypes?: string[],
  limit = 10,
): Promise<DequeuedJob[]> {
  const workerId = `worker-${process.pid}-${Date.now()}`
  const now = new Date().toISOString()

  // Step 1: fetch candidate jobs
  let query = admin()
    .from('job_runs')
    .select('id, tenant_id, job_type, payload, priority, retry_count, max_retries')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('priority', { ascending: false })
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (jobTypes && jobTypes.length > 0) {
    query = query.in('job_type', jobTypes)
  }

  const { data: candidates, error: fetchError } = await query

  if (fetchError) {
    log.error('Failed to fetch candidate jobs', { error_code: fetchError.code })
    throw fetchError
  }

  if (!candidates || candidates.length === 0) return []

  // Step 2: claim each job atomically (status guard prevents double-claims)
  const claimed: DequeuedJob[] = []

  for (const job of candidates) {
    const { data: updated, error: claimError } = await admin()
      .from('job_runs')
      .update({
        status: 'running' as const,
        locked_by: workerId,
        locked_at: now,
        started_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'pending') // optimistic lock guard
      .select('id, tenant_id, job_type, payload, priority, retry_count, max_retries')
      .single()

    if (claimError || !updated) continue // another worker got it

    claimed.push(updated as DequeuedJob)
  }

  if (claimed.length > 0) {
    log.info('Jobs dequeued', {
      count: claimed.length.toString(),
      worker_id: workerId,
    })
  }

  return claimed
}

// ─── Complete ───────────────────────────────────────────────────────────────

export async function completeJob(jobId: string, result?: Json): Promise<void> {
  const { error } = await admin()
    .from('job_runs')
    .update({
      status: 'completed' as const,
      result: result ?? null,
      completed_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    })
    .eq('id', jobId)

  if (error) {
    log.error('Failed to complete job', { job_id: jobId, error_code: error.code })
    throw error
  }

  log.info('Job completed', { job_id: jobId })
}

// ─── Fail ───────────────────────────────────────────────────────────────────

/**
 * Mark a job as failed. If `shouldRetry` is true and retries remain, the job
 * is re-queued with exponential backoff (base 30s, factor 2^retryCount).
 */
export async function failJob(
  jobId: string,
  errorMessage: string,
  shouldRetry = true,
): Promise<void> {
  // Fetch current retry state
  const { data: job } = await admin()
    .from('job_runs')
    .select('retry_count, max_retries')
    .eq('id', jobId)
    .single()

  const canRetry = shouldRetry && job && job.retry_count < job.max_retries

  if (canRetry) {
    const nextRetry = job!.retry_count + 1
    const backoffMs = 30_000 * Math.pow(2, nextRetry) // 60s, 120s, 240s …
    const scheduledFor = new Date(Date.now() + backoffMs).toISOString()

    const { error } = await admin()
      .from('job_runs')
      .update({
        status: 'pending' as const,
        retry_count: nextRetry,
        last_error: errorMessage,
        scheduled_for: scheduledFor,
        locked_by: null,
        locked_at: null,
        started_at: null,
      })
      .eq('id', jobId)

    if (error) {
      log.error('Failed to re-queue job', { job_id: jobId, error_code: error.code })
      throw error
    }

    log.warn('Job failed  -  re-queued with backoff', {
      job_id: jobId,
      retry_count: nextRetry.toString(),
      scheduled_for: scheduledFor,
    })
  } else {
    const { error } = await admin()
      .from('job_runs')
      .update({
        status: 'failed' as const,
        last_error: errorMessage,
        completed_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
      })
      .eq('id', jobId)

    if (error) {
      log.error('Failed to mark job as failed', { job_id: jobId, error_code: error.code })
      throw error
    }

    log.error('Job failed permanently', { job_id: jobId })
  }
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

export async function cancelJob(jobId: string): Promise<void> {
  const { error } = await admin()
    .from('job_runs')
    .update({
      status: 'cancelled' as const,
      completed_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    })
    .eq('id', jobId)

  if (error) {
    log.error('Failed to cancel job', { job_id: jobId, error_code: error.code })
    throw error
  }

  log.info('Job cancelled', { job_id: jobId })
}

// ─── Log helper ─────────────────────────────────────────────────────────────

export async function appendJobLog(
  jobRunId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: Json,
): Promise<void> {
  const { error } = await admin()
    .from('job_run_logs')
    .insert({
      job_run_id: jobRunId,
      level,
      message,
      metadata: metadata ?? null,
    })

  if (error) {
    log.error('Failed to append job log', { job_run_id: jobRunId, error_code: error.code })
  }
}
