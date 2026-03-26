/**
 * POST /api/ocr/scan-id — ID Document Scanner
 *
 * Accepts a base64-encoded image of a government ID (driver's licence,
 * passport, PR card) and extracts structured fields using OCR.space API.
 *
 * The raw OCR text is parsed through Canadian ID heuristics to extract:
 *   - First name, last name
 *   - Date of birth
 *   - Address (line1, city, province, postal code)
 *   - Document number
 *   - Expiry date
 *
 * Security: Server-side only — the OCR API key never touches the client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseIdFields } from '@/lib/services/ocr/id-field-parser'

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image'
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!OCR_API_KEY) {
    return NextResponse.json(
      { error: 'OCR service not configured' },
      { status: 503 },
    )
  }

  try {
    const body = await req.json()
    const { image, fileName } = body as { image?: string; fileName?: string }

    if (!image) {
      return NextResponse.json(
        { error: 'Missing required field: image (base64)' },
        { status: 400 },
      )
    }

    // Determine file type from base64 header or fileName
    const fileType = detectFileType(image, fileName)

    // Prepare form data for OCR.space
    const formData = new FormData()
    formData.append('apikey', OCR_API_KEY)
    formData.append('base64Image', ensureDataUri(image, fileType))
    formData.append('language', 'eng')
    formData.append('isOverlayRequired', 'false')
    formData.append('detectOrientation', 'true')
    formData.append('scale', 'true')
    formData.append('OCREngine', '1') // Engine 1: faster (~3-5s vs 15-30s)

    const ocrRes = await fetch(OCR_SPACE_URL, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000), // 15s timeout
    })

    if (!ocrRes.ok) {
      const errText = await ocrRes.text()
      console.error('[OCR] API error:', ocrRes.status, errText)
      return NextResponse.json(
        { error: 'OCR service returned an error' },
        { status: 502 },
      )
    }

    const ocrData = await ocrRes.json()

    if (ocrData.IsErroredOnProcessing) {
      console.error('[OCR] Processing error:', ocrData.ErrorMessage)
      return NextResponse.json(
        { error: ocrData.ErrorMessage?.[0] ?? 'OCR processing failed' },
        { status: 422 },
      )
    }

    // Extract raw text from all parsed results
    const rawText = (ocrData.ParsedResults ?? [])
      .map((r: { ParsedText?: string }) => r.ParsedText ?? '')
      .join('\n')

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: 'No text detected in the image. Please upload a clearer photo.' },
        { status: 422 },
      )
    }

    // Log raw OCR text for debugging (visible in terminal)
    console.log('[OCR] Raw text:\n', rawText)

    // Parse structured fields from the raw OCR text
    const fields = parseIdFields(rawText)
    console.log('[OCR] Parsed fields:', JSON.stringify(fields, null, 2))

    return NextResponse.json({
      success: true,
      data: {
        fields,
        rawText,
        confidence: ocrData.ParsedResults?.[0]?.TextOverlay?.HasOverlay ? 'high' : 'medium',
      },
    })
  } catch (err) {
    console.error('[OCR] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Failed to process ID document' },
      { status: 500 },
    )
  }
}

function detectFileType(base64: string, fileName?: string): string {
  if (base64.startsWith('data:image/')) return '' // already has data URI
  if (fileName?.endsWith('.pdf')) return 'application/pdf'
  if (fileName?.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

function ensureDataUri(base64: string, fileType: string): string {
  if (base64.startsWith('data:')) return base64
  if (!fileType) return `data:image/jpeg;base64,${base64}`
  return `data:${fileType};base64,${base64}`
}
