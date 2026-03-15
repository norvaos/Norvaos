/**
 * Job Handler Registry.
 *
 * Maps job type strings to async handler functions.
 * The worker loop calls `getHandler(jobType)` to dispatch each dequeued job.
 */

import type { Json } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JobContext {
  jobId: string
  tenantId: string
  jobType: string
  payload: Json
  retryCount: number
}

export type JobHandler = (ctx: JobContext) => Promise<Json | void>

// ─── Registry ───────────────────────────────────────────────────────────────

const handlers = new Map<string, JobHandler>()

export function registerJobHandler(jobType: string, handler: JobHandler): void {
  if (handlers.has(jobType)) {
    log.warn('Overwriting existing job handler', { job_type: jobType })
  }
  handlers.set(jobType, handler)
  log.debug('Job handler registered', { job_type: jobType })
}

export function getHandler(jobType: string): JobHandler {
  const handler = handlers.get(jobType)
  if (!handler) {
    throw new Error(`No handler registered for job type: ${jobType}`)
  }
  return handler
}

export function hasHandler(jobType: string): boolean {
  return handlers.has(jobType)
}

export function getRegisteredJobTypes(): string[] {
  return Array.from(handlers.keys())
}

// ─── Stub handlers ──────────────────────────────────────────────────────────
// Pre-register placeholder handlers for known job types. Each stub logs that
// the handler is not yet implemented and returns a descriptive result so the
// job completes (rather than failing) during development.

function stubHandler(jobType: string): JobHandler {
  return async (ctx) => {
    log.warn(`Stub handler invoked — ${jobType} is not yet implemented`, {
      tenant_id: ctx.tenantId,
      job_id: ctx.jobId,
    })
    return { stub: true, message: `${jobType} handler not yet implemented` }
  }
}

const STUB_JOB_TYPES = [
  'python_worker_xfa_scan',
  'python_worker_xfa_fill',
  'python_worker_pdf_preview',
  'email_inbound_sync',
  'email_outbound_send',
  'notification_dispatch',
  'onedrive_sync',
  'delegation_expiry_check',
  'break_glass_expiry_check',
] as const

for (const jobType of STUB_JOB_TYPES) {
  registerJobHandler(jobType, stubHandler(jobType))
}
