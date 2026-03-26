import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/documents/vault-drop  -  Directive 33.0 §B / 40.0 §2
 *
 * Public-facing vault drop. No authentication required.
 * Files are stored in a quarantine bucket indexed by content_hash + temp_session_id.
 *
 * When an intake is later converted to a Matter, the "claim" flow
 * matches orphaned vault hashes against the session and moves documents
 * into the matter's archive  -  zero re-upload.
 */
async function handlePost(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const clientHash = formData.get('sha256') as string | null
    const source = formData.get('source') as string | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 })
    }

    // ── Compute server-side SHA-256 ──────────────────────────────────────
    const fileBuffer = await file.arrayBuffer()
    const serverHash = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')

    // Verify client hash matches server hash (integrity check)
    if (clientHash && clientHash !== serverHash) {
      return NextResponse.json(
        { error: 'Hash mismatch  -  file may have been corrupted in transit' },
        { status: 422 }
      )
    }

    // ── Generate temp_session_id from request fingerprint ────────────────
    // Uses IP + User-Agent + timestamp window (15-min bucket) to group
    // uploads from the same kiosk/concierge session without requiring auth.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    const ua = request.headers.get('user-agent') ?? 'unknown'
    const timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)) // 15-min window
    const sessionFingerprint = createHash('sha256')
      .update(`${ip}|${ua}|${timeBucket}`)
      .digest('hex')
      .slice(0, 32)

    const admin = createAdminClient()

    // ── Upload to quarantine bucket ──────────────────────────────────────
    const storagePath = `vault-quarantine/${sessionFingerprint}/${serverHash}-${file.name}`

    const { error: storageErr } = await admin.storage
      .from('matter-documents')
      .upload(storagePath, Buffer.from(fileBuffer), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageErr) {
      // If file already exists (duplicate hash), treat as success
      if (storageErr.message?.includes('already exists') || storageErr.message?.includes('Duplicate')) {
        return NextResponse.json({
          success: true,
          content_hash: serverHash,
          temp_session_id: sessionFingerprint,
          storage_path: storagePath,
          duplicate: true,
        })
      }
      return NextResponse.json(
        { error: `Storage upload failed: ${storageErr.message}` },
        { status: 500 }
      )
    }

    // ── Index in vault_drops table ───────────────────────────────────────
    // This orphan record is "claimed" when the intake converts to a matter.
    const { data: vaultDrop, error: insertErr } = await (admin as any)
      .from('vault_drops')
      .insert({
        temp_session_id: sessionFingerprint,
        content_hash: serverHash,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: storagePath,
        source: source ?? 'vault_drop',
        claimed_matter_id: null,
        claimed_at: null,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[vault-drop] Failed to index vault drop:', insertErr)
      // Non-fatal  -  file is already in storage, index can be rebuilt
    }

    // ── Auto-Scan: extract fields from scannable files (Directive 40.0) ──
    // Fire-and-forget: scan runs asynchronously so upload response is fast.
    // Results are persisted to vault_drops.ai_extracted_data for later
    // intake pre-fill when the drop is claimed by a matter.
    const SCANNABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    const MAX_SCAN_SIZE = 1024 * 1024 // 1 MB (OCR.space free tier limit)

    if (
      vaultDrop?.id &&
      SCANNABLE_TYPES.includes(file.type) &&
      file.size <= MAX_SCAN_SIZE
    ) {
      autoScanVaultDrop(admin, vaultDrop.id, Buffer.from(fileBuffer), file.type, file.name).catch(
        (err) => console.error('[vault-drop] Auto-scan failed (non-fatal):', err),
      )
    }

    return NextResponse.json({
      success: true,
      content_hash: serverHash,
      temp_session_id: sessionFingerprint,
      storage_path: storagePath,
      duplicate: false,
      auto_scan: !!(vaultDrop?.id && SCANNABLE_TYPES.includes(file.type) && file.size <= MAX_SCAN_SIZE),
    })
  } catch (err) {
    console.error('[vault-drop] Unexpected error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/vault-drop')

// ── Auto-Scan Helper ────────────────────────────────────────────────────────

/**
 * Asynchronously scan a vault drop file via OCR.space and persist
 * the extracted fields to vault_drops.ai_extracted_data.
 * Runs fire-and-forget  -  failures are logged but never block the upload.
 */
async function autoScanVaultDrop(
  admin: ReturnType<typeof createAdminClient>,
  vaultDropId: string,
  fileBuffer: Buffer,
  fileType: string,
  fileName: string,
) {
  const apiKey = process.env.OCR_SPACE_API_KEY
  if (!apiKey) {
    console.warn('[vault-drop] OCR_SPACE_API_KEY not set  -  skipping auto-scan')
    return
  }

  const base64 = fileBuffer.toString('base64')

  // Call OCR.space API directly (inline to avoid auth requirement of /api/documents/scan)
  const formData = new FormData()
  formData.append('base64Image', `data:${fileType};base64,${base64}`)
  formData.append('language', 'eng')
  formData.append('isOverlayRequired', 'false')
  formData.append('OCREngine', '2')
  formData.append('scale', 'true')
  formData.append('isTable', 'true')
  if (fileType === 'application/pdf') {
    formData.append('filetype', 'PDF')
  }

  const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: formData,
  })

  if (!ocrResponse.ok) {
    console.error(`[vault-drop] OCR API error: ${ocrResponse.status}`)
    return
  }

  const ocrData = await ocrResponse.json()
  if (ocrData.IsErroredOnProcessing || ocrData.OCRExitCode !== 1) {
    console.error('[vault-drop] OCR processing failed:', ocrData.ErrorMessage)
    return
  }

  const rawText = ocrData.ParsedResults?.map((r: { ParsedText: string }) => r.ParsedText).join('\n') ?? ''
  if (!rawText.trim()) return

  // Import the scan route's extraction logic dynamically
  // We replicate the essential extraction here to avoid circular imports
  const { detectAndExtractWithAI } = await import('@/lib/services/document-extractor')
  const { documentType, fields, confidence, summary } = await detectAndExtractWithAI(rawText)

  // Persist to vault_drops.ai_extracted_data
  await (admin as any)
    .from('vault_drops')
    .update({
      ai_extracted_data: {
        detected_document_type: documentType,
        confidence,
        extracted_fields: fields,
        raw_text_summary: summary,
        scanned_at: new Date().toISOString(),
        auto_scanned: true,
      },
    })
    .eq('id', vaultDropId)

  console.log(`[vault-drop] Auto-scan complete for ${fileName}: ${documentType} (${confidence}% confidence, ${Object.values(fields).filter(Boolean).length} fields)`)
}
