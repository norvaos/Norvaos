import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { log } from '@/lib/utils/logger'

// ── GET /api/settings/signature ────────────────────────────────────────────
// Returns current user's saved signature metadata + signed URL for the PNG.

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    // Fetch user's settings JSONB
    const { data: user, error } = await admin
      .from('users')
      .select('settings')
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ((user as any).settings ?? {}) as Record<string, unknown>
    const signature = settings.signature as Record<string, unknown> | undefined

    if (!signature || !signature.storage_path) {
      return NextResponse.json({ signature: null })
    }

    // Generate a short-lived signed URL for the signature PNG
    const { data: signedUrl } = await admin.storage
      .from('documents')
      .createSignedUrl(signature.storage_path as string, 300) // 5 min expiry

    return NextResponse.json({
      signature: {
        mode: signature.mode,
        typedName: signature.typed_name ?? null,
        updatedAt: signature.updated_at,
        imageUrl: signedUrl?.signedUrl ?? null,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-signature] GET error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PUT /api/settings/signature ────────────────────────────────────────────
// Saves a new signature. Body: { dataUrl: string; mode: 'drawn'|'typed'|'uploaded'; typedName?: string }

async function handlePut(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    const body = await request.json()
    const { dataUrl, mode, typedName } = body as {
      dataUrl: string
      mode: 'drawn' | 'typed' | 'uploaded'
      typedName?: string
    }

    if (!dataUrl || !mode) {
      return NextResponse.json(
        { error: 'dataUrl and mode are required' },
        { status: 400 },
      )
    }

    if (!['drawn', 'typed', 'uploaded'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be "drawn", "typed", or "uploaded"' },
        { status: 400 },
      )
    }

    // Decode base64 PNG
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    if (imageBuffer.length < 100) {
      return NextResponse.json(
        { error: 'Signature image is too small' },
        { status: 400 },
      )
    }

    if (imageBuffer.length > 500_000) {
      return NextResponse.json(
        { error: 'Signature image exceeds 500KB limit' },
        { status: 400 },
      )
    }

    // Deterministic storage path  -  upsert overwrites previous
    const storagePath = `${auth.tenantId}/signatures/${auth.userId}.png`

    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to upload signature: ${uploadError.message}` },
        { status: 500 },
      )
    }

    // Update users.settings JSONB  -  merge signature metadata
    const { data: currentUser } = await admin
      .from('users')
      .select('settings')
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentSettings = (((currentUser as any)?.settings ?? {}) as Record<string, unknown>)

    const updatedSettings = {
      ...currentSettings,
      signature: {
        storage_path: storagePath,
        mode,
        typed_name: typedName ?? null,
        updated_at: new Date().toISOString(),
      },
    }

    const { error: updateError } = await admin
      .from('users' as never)
      .update({ settings: updatedSettings } as never)
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to save signature settings: ${updateError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-signature] PUT error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/settings/signature ─────────────────────────────────────────
// Removes the saved signature from storage and clears settings.

async function handleDelete() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    // Fetch current settings to get storage path
    const { data: user } = await admin
      .from('users')
      .select('settings')
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = (((user as any)?.settings ?? {}) as Record<string, unknown>)
    const signature = settings.signature as Record<string, unknown> | undefined

    if (signature?.storage_path) {
      // Remove file from storage (ignore errors  -  file may already be gone)
      await admin.storage
        .from('documents')
        .remove([signature.storage_path as string])
    }

    // Clear signature from settings
    const { signature: _removed, ...restSettings } = settings
    const { error: updateError } = await admin
      .from('users' as never)
      .update({ settings: restSettings } as never)
      .eq('id', auth.userId)
      .eq('tenant_id', auth.tenantId)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to clear signature settings: ${updateError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[settings-signature] DELETE error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = handleGet
export const PUT = handlePut
export const DELETE = handleDelete
