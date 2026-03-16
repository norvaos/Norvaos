import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import type { PortalSharedDocument } from '@/lib/types/portal'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── GET /api/portal/[token]/shared-documents ────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Fetch documents shared with client for this matter
    const { data: docs, error } = await admin
      .from('documents')
      .select('id, file_name, category, description, file_type, file_size, shared_at, client_viewed_at')
      .eq('matter_id', link.matter_id)
      .eq('is_shared_with_client', true)
      .order('shared_at', { ascending: false })

    if (error) throw error

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents: PortalSharedDocument[] = ((docs ?? []) as any[]).map((d) => ({
      id: d.id,
      file_name: d.file_name,
      category: d.category ?? null,
      description: d.description ?? null,
      file_type: d.file_type ?? null,
      file_size: d.file_size ?? null,
      shared_at: d.shared_at,
      client_viewed_at: d.client_viewed_at ?? null,
    }))

    return NextResponse.json({ documents })
  } catch (err) {
    console.error('[portal/shared-documents] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/portal/[token]/shared-documents ──────────────────────────────
// Records first view of a shared document and returns a signed download URL.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    const body = await request.json()
    const documentId = body.document_id
    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 })
    }

    // Verify document belongs to this matter AND is shared with client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docError } = await (admin as any)
      .from('documents')
      .select('id, storage_path, client_viewed_at')
      .eq('id', documentId)
      .eq('matter_id', link.matter_id)
      .eq('is_shared_with_client', true)
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Record first view only — do not overwrite existing viewed timestamp
    if (!doc.client_viewed_at) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('documents')
        .update({ client_viewed_at: new Date().toISOString() })
        .eq('id', documentId)
    }

    // Generate signed download URL (60 min expiry)
    const { data: signedData, error: signError } = await admin.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600)

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      viewed_at: doc.client_viewed_at ?? new Date().toISOString(),
    })
  } catch (err) {
    console.error('[portal/shared-documents] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
