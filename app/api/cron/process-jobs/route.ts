import { NextResponse } from 'next/server'
import { withTiming } from '@/lib/middleware/request-timing'
import { processJobs } from '@/lib/services/job-worker'

// Ensure stub handlers are registered on import
import '@/lib/services/job-registry'

/**
 * POST /api/cron/process-jobs
 *
 * Cron endpoint that processes queued jobs in batches.
 * Designed to be called by Vercel Cron or an external scheduler.
 *
 * Query params:
 *   batchSize  -  max jobs per run (default 10, max 50)
 *   jobTypes   -  comma-separated list of job types to process (optional)
 */
async function handlePost(request: Request) {
  // Auth check  -  fail-closed: reject if CRON_SECRET is unset
  const cronSecret = process.env['CRON_SECRET']
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Parse options from query params
  const url = new URL(request.url)
  const batchSizeParam = url.searchParams.get('batchSize')
  const jobTypesParam = url.searchParams.get('jobTypes')

  const batchSize = Math.min(
    Math.max(parseInt(batchSizeParam || '10', 10) || 10, 1),
    50,
  )
  const jobTypes = jobTypesParam ? jobTypesParam.split(',').map((t) => t.trim()).filter(Boolean) : undefined

  try {
    const result = await processJobs({ batchSize, jobTypes })

    return NextResponse.json({
      message: 'Job processing complete',
      ...result,
    })
  } catch (error) {
    console.error('[cron/process-jobs] Fatal error:', error)
    return NextResponse.json(
      { error: 'Job processing failed' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/process-jobs')
