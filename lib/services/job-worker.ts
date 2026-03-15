/**
 * Job Worker — polls the queue and dispatches jobs to registered handlers.
 *
 * Designed to run inside a Vercel cron route or a long-running process.
 * Supports configurable poll interval, concurrency, per-job timeout, and
 * graceful shutdown.
 */

import { dequeueJobs, completeJob, failJob, appendJobLog } from '@/lib/services/job-queue'
import { getHandler, hasHandler } from '@/lib/services/job-registry'
import type { JobContext } from '@/lib/services/job-registry'
import type { Json } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProcessJobsOptions {
  /** Job types to process. If omitted, processes all types with registered handlers. */
  jobTypes?: string[]
  /** Max jobs to dequeue per poll cycle. Default: 10 */
  batchSize?: number
  /** Per-job execution timeout in milliseconds. Default: 60 000 (60s) */
  timeoutMs?: number
  /** Poll interval in milliseconds (only used in continuous mode). Default: 5 000 */
  pollIntervalMs?: number
  /** Max concurrent jobs per poll cycle. Default: 5 */
  concurrency?: number
}

export interface ProcessJobsResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

// ─── Shutdown signal ────────────────────────────────────────────────────────

let shutdownRequested = false

export function requestShutdown(): void {
  shutdownRequested = true
  log.info('Job worker shutdown requested')
}

export function resetShutdown(): void {
  shutdownRequested = false
}

// ─── Single batch processor ─────────────────────────────────────────────────

/**
 * Process a single batch of jobs. This is the primary entry point for cron-based
 * invocations — dequeue a batch, run handlers, return a summary.
 */
export async function processJobs(
  options: ProcessJobsOptions = {},
): Promise<ProcessJobsResult> {
  const {
    jobTypes,
    batchSize = 10,
    timeoutMs = 60_000,
    concurrency = 5,
  } = options

  const result: ProcessJobsResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }

  const jobs = await dequeueJobs(jobTypes, batchSize)
  if (jobs.length === 0) return result

  // Process in chunks of `concurrency`
  for (let i = 0; i < jobs.length; i += concurrency) {
    if (shutdownRequested) break

    const chunk = jobs.slice(i, i + concurrency)
    const promises = chunk.map(async (job) => {
      result.processed++

      if (!hasHandler(job.job_type)) {
        log.warn('No handler for job type — skipping', {
          job_id: job.id,
          job_type: job.job_type,
        })
        await failJob(job.id, `No handler registered for job type: ${job.job_type}`, false)
        result.skipped++
        return
      }

      const ctx: JobContext = {
        jobId: job.id,
        tenantId: job.tenant_id,
        jobType: job.job_type,
        payload: job.payload,
        retryCount: job.retry_count,
      }

      try {
        const jobResult = await executeWithTimeout(
          () => getHandler(job.job_type)(ctx),
          timeoutMs,
          job.id,
        )

        await completeJob(job.id, (jobResult as Json) ?? null)
        await appendJobLog(job.id, 'info', 'Job completed successfully')
        result.succeeded++
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        await failJob(job.id, errorMessage)
        await appendJobLog(job.id, 'error', errorMessage)
        result.failed++
      }
    })

    await Promise.allSettled(promises)
  }

  log.info('Job batch processed', {
    processed: result.processed.toString(),
    succeeded: result.succeeded.toString(),
    failed: result.failed.toString(),
    skipped: result.skipped.toString(),
  })

  return result
}

// ─── Continuous polling loop ────────────────────────────────────────────────

/**
 * Run the worker in a continuous loop. Useful for non-serverless environments.
 * Stops when `requestShutdown()` is called.
 */
export async function startWorkerLoop(
  options: ProcessJobsOptions = {},
): Promise<void> {
  const { pollIntervalMs = 5_000 } = options
  resetShutdown()

  log.info('Job worker loop started', {
    poll_interval_ms: pollIntervalMs.toString(),
  })

  while (!shutdownRequested) {
    try {
      await processJobs(options)
    } catch (err) {
      log.error('Worker loop error', {
        error_code: err instanceof Error ? err.message : 'unknown',
      })
    }

    if (!shutdownRequested) {
      await sleep(pollIntervalMs)
    }
  }

  log.info('Job worker loop stopped')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  jobId: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    fn()
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}
