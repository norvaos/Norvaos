import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/internal/form-generation-callback
 *
 * Internal callback endpoint called by the Python sidecar after form generation
 * completes (success or failure). Updates form_generation_log status.
 *
 * This endpoint is internal  -  it is not exposed to the browser. It is called
 * server-to-server from the Python sidecar.
 *
 * Auth: X-Worker-Key header must match WORKER_SECRET env var.
 *
 * Body: {
 *   job_id:      string          -  form_generation_log.id
 *   status:      'completed' | 'failed'
 *   output_path: string | null   -  storage path of generated PDF (completed only)
 *   page_count:  number | null
 *   error:       string | null   -  error message (failed only)
 * }
 */
export async function POST(request: Request) {
  // Validate worker key
  const workerKey = request.headers.get('x-worker-key') ?? ''
  const workerSecret = process.env['WORKER_SECRET'] ?? ''

  if (!workerSecret || workerKey !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const job_id = typeof body['job_id'] === 'string' ? body['job_id'] : null
  const status = typeof body['status'] === 'string' ? body['status'] : null

  if (!job_id || !status || !['completed', 'failed'].includes(status)) {
    return NextResponse.json(
      { error: 'job_id and status (completed|failed) are required' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()

  const updatePayload: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (status === 'completed') {
    updatePayload['output_path'] = typeof body['output_path'] === 'string' ? body['output_path'] : null
    updatePayload['page_count'] = typeof body['page_count'] === 'number' ? body['page_count'] : null
  }

  if (status === 'failed') {
    updatePayload['error_message'] = typeof body['error'] === 'string' ? body['error'] : 'Unknown error'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (admin as any)
    .from('form_generation_log')
    .update(updatePayload)
    .eq('id', job_id)

  if (updateErr) {
    console.error('[form-generation-callback] DB update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to update job status' }, { status: 500 })
  }

  console.log(`[form-generation-callback] Job ${job_id} updated to ${status}`)
  return NextResponse.json({ success: true, job_id, status })
}
