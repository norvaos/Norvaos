import { NextResponse } from 'next/server'
import { writeFile, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { fillXFAFormFromDB } from '@/lib/ircc/xfa-filler-db-server'
import { renderPreview } from '@/lib/services/python-worker-client'

// 10 preview requests per minute per user
const previewLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * POST /api/ircc/forms/[formId]/preview
 *
 * Renders a filled PDF preview as base64 PNG image(s).
 *
 * Body: {
 *   page?: number                              -- page index to render (default: 0)
 *   profile_overrides?: Record<string, unknown> -- optional field overrides for testing
 * }
 *
 * Returns: {
 *   images: [{ page: number, base64_png: string, width: number, height: number }]
 *   page_count: number
 * }
 *
 * Note: Preview is approximate  -  verify final output in Adobe Reader.
 * PyMuPDF XFA rendering may differ from Adobe for complex dynamic layouts.
 */
export async function POST(request: Request, { params }: RouteParams) {
  let tempDir: string | null = null

  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')

    // Rate limit by userId
    const { allowed, retryAfterMs } = await previewLimiter.check(auth.userId)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many preview requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // 1. Fetch form + verify ownership
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('id, form_code, form_name, scan_status, storage_path')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    if (form.scan_status === 'pending') {
      return NextResponse.json(
        { error: 'Form has not been scanned yet. Run a scan first.' },
        { status: 409 },
      )
    }

    // 2. Parse request body
    const body = await request.json().catch(() => ({}))
    const pageIndex: number = typeof body.page === 'number' ? body.page : 0
    const profileOverrides: Record<string, unknown> = body.profile_overrides ?? {}

    // 3. Build a minimal test profile from field mappings (fills fields with placeholder values)
    const { data: fields } = await supabase
      .from('ircc_form_fields')
      .select('profile_path, field_type, label, is_mapped')
      .eq('form_id', formId)
      .eq('is_mapped', true)
      .not('profile_path', 'is', null)

    // Build a synthetic profile from mapped fields for preview
    const testProfile: Record<string, unknown> = {}
    for (const field of fields ?? []) {
      const path = field.profile_path as string
      const type = field.field_type as string
      // Only set if not already overridden
      if (!(path in profileOverrides)) {
        const placeholder = buildPlaceholderValue(type, field.label as string)
        setNestedValue(testProfile, path, placeholder)
      }
    }
    // Apply any overrides on top
    for (const [path, value] of Object.entries(profileOverrides)) {
      setNestedValue(testProfile, path, value)
    }

    // 4. Download template from storage + fill the PDF
    const formCode = form.form_code as string
    const storagePath = form.storage_path as string | null

    if (!storagePath) {
      return NextResponse.json(
        { error: 'Template storage path not set. Re-upload the form PDF first.' },
        { status: 409 },
      )
    }

    const { data: templateBlob, error: templateDownloadError } = await supabase.storage
      .from('documents')
      .download(storagePath)

    if (templateDownloadError || !templateBlob) {
      return NextResponse.json(
        { error: `Failed to download template from storage: ${storagePath}` },
        { status: 500 },
      )
    }

    tempDir = await mkdtemp(join(tmpdir(), 'ircc-preview-'))
    const templateBytes = new Uint8Array(await (templateBlob as Blob).arrayBuffer())
    const tempTemplatePath = join(tempDir, `${formCode}.pdf`)
    await writeFile(tempTemplatePath, templateBytes)

    const filledBytes = await fillXFAFormFromDB(
      tempTemplatePath,
      formId,
      testProfile,
      supabase,
    )

    if (!filledBytes) {
      return NextResponse.json(
        { error: 'PDF fill engine returned no output. Check field mappings.' },
        { status: 502 },
      )
    }

    // 5. Render preview via Python worker sidecar
    const result = await renderPreview(filledBytes.bytes, pageIndex, {
      timeoutMs: 30_000,
      dpi: 150,
    })

    if ('error' in result && result.error) {
      return NextResponse.json(
        { error: `Preview render failed: ${(result as { error: string }).error}` },
        { status: 502 },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    console.error('[preview] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    // Clean up temp files
    if (tempDir) {
      try {
        const { rm } = await import('fs/promises')
        await rm(tempDir, { recursive: true, force: true })
      } catch {
        // Non-critical cleanup
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a human-readable placeholder value for a given field type */
function buildPlaceholderValue(fieldType: string, label: string): unknown {
  const short = label?.slice(0, 20) ?? 'Sample'
  switch (fieldType) {
    case 'date':
      return '2000-01-01'
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      return ''
    case 'country':
      return 'CAN'
    default:
      return short
  }
}

/** Set a value at a dot-notation path on an object (mutates in place) */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (cur[p] === null || cur[p] === undefined || typeof cur[p] !== 'object') {
      cur[p] = {}
    }
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}
