import { NextResponse } from 'next/server'
import { writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { fillXFAFormFromDB } from '@/lib/ircc/xfa-filler-db-server'
import { renderPreview } from '@/lib/services/python-worker-client'

/**
 * POST /api/ircc/live-preview
 *
 * The "Live Mirror" endpoint for the SovereignSplitPreview component.
 * Takes real matter profile data (not synthetic placeholders) and returns
 * a filled PDF rendered as PNG images.
 *
 * Rate limited: 20 requests per minute per user (the debounced watcher
 * fires at most every 500ms, but network latency + render time means
 * ~2-4 req/min in practice).
 *
 * Body: {
 *   formId: string             -- ircc_forms.id
 *   formCode: string           -- e.g. 'IMM5257E'
 *   profileData: Record        -- form field data keyed by profile_path
 *   page?: number              -- page index to render (default: 0)
 *   dpi?: number               -- render DPI (default: 100, lower = faster)
 * }
 *
 * Returns: {
 *   images: [{ page, base64_png, width, height }]
 *   page_count: number
 *   render_ms: number
 * }
 */

// 20 previews per minute  -  generous for debounced live editing
const livePreviewLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

export async function POST(request: Request) {
  let tempDir: string | null = null
  const startMs = Date.now()

  try {
    const auth = await authenticateRequest()

    const { allowed, retryAfterMs } = livePreviewLimiter.check(auth.userId)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Preview rate limit exceeded. The mirror will refresh shortly.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body?.formId || !body?.formCode) {
      return NextResponse.json(
        { error: 'formId and formCode are required' },
        { status: 400 },
      )
    }

    const {
      formId,
      formCode,
      profileData = {},
      page = 0,
      dpi = 100, // Lower DPI for speed in live preview
    } = body as {
      formId: string
      formCode: string
      profileData: Record<string, unknown>
      page?: number
      dpi?: number
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Verify form exists and belongs to tenant
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('id, form_code, storage_path, scan_status')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    if (form.scan_status === 'pending') {
      return NextResponse.json(
        { error: 'Form not yet scanned. Run a field scan first.' },
        { status: 409 },
      )
    }

    // Resolve template: local file first (fast), storage fallback
    const localPath = join(process.cwd(), 'public', 'ircc-forms', `${formCode}.pdf`)
    let templateBytes: Uint8Array

    if (existsSync(localPath)) {
      const { readFile } = await import('fs/promises')
      templateBytes = new Uint8Array(await readFile(localPath))
    } else if (form.storage_path) {
      const { data: blob, error: dlError } = await supabase.storage
        .from('documents')
        .download(form.storage_path as string)

      if (dlError || !blob) {
        return NextResponse.json(
          { error: 'Template download failed' },
          { status: 500 },
        )
      }
      templateBytes = new Uint8Array(await (blob as Blob).arrayBuffer())
    } else {
      return NextResponse.json(
        { error: 'No PDF template available for this form' },
        { status: 409 },
      )
    }

    // Write template to temp file (xfa-filler-db-server reads from disk)
    tempDir = await mkdtemp(join(tmpdir(), 'norva-live-preview-'))
    const tempTemplatePath = join(tempDir, `${formCode}.pdf`)
    await writeFile(tempTemplatePath, templateBytes)

    // Fill the PDF using real profile data
    const fillResult = await fillXFAFormFromDB(
      tempTemplatePath,
      formId,
      profileData,
      supabase,
    )

    if (!fillResult) {
      return NextResponse.json(
        { error: 'PDF fill returned no output. Check field mappings.' },
        { status: 502 },
      )
    }

    // Render to PNG
    const renderResult = await renderPreview(fillResult.bytes, page, {
      timeoutMs: 15_000, // Tight timeout for live preview
      dpi: Math.min(Math.max(dpi, 72), 200), // Clamp: 72-200 for speed
    })

    if ('error' in renderResult && renderResult.error) {
      return NextResponse.json(
        { error: `Render failed: ${(renderResult as { error: string }).error}` },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ...renderResult,
      render_ms: Date.now() - startMs,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    console.error('[live-preview] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch {
        // Non-critical cleanup
      }
    }
  }
}
