/**
 * POST /api/ocr/scan-id  -  ID Document Scanner
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
 * Security: Server-side only  -  the OCR API key never touches the client.
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

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB base64
    if (image.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: 'Image too large. Maximum 10MB.' },
        { status: 400 }
      )
    }

    // Determine file type from base64 header or fileName
    const fileType = detectFileType(image, fileName)

    const dataUri = ensureDataUri(image, fileType)

    // Try Engine 2 first (higher accuracy for IDs), fall back to Engine 1
    const rawText = await ocrWithFallback(OCR_API_KEY, dataUri)

    if (!rawText) {
      return NextResponse.json(
        { error: 'No text detected in the image. Please upload a clearer, well-lit photo.' },
        { status: 422 },
      )
    }

    // Log raw OCR text for debugging (visible in terminal)
    console.log('[OCR] Raw text:\n', rawText)

    // Parse structured fields from the raw OCR text
    const fields = parseIdFields(rawText)
    console.log('[OCR] Parsed fields:', JSON.stringify(fields, null, 2))

    // Count how many key fields were extracted
    const keyFields = ['first_name', 'last_name', 'date_of_birth', 'address_line1', 'city', 'province_state', 'postal_code'] as const
    const extractedCount = keyFields.filter(f => fields[f]).length
    const confidence = extractedCount >= 5 ? 'high' : extractedCount >= 3 ? 'medium' : 'low'

    return NextResponse.json({
      success: true,
      data: {
        fields,
        rawText,
        confidence,
        extractedFieldCount: extractedCount,
        totalFieldCount: keyFields.length,
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

/**
 * Try OCR Engine 2 (premium, better for IDs with complex layouts) first.
 * If it fails or returns empty, fall back to Engine 1 (faster, simpler).
 */
async function ocrWithFallback(apiKey: string, dataUri: string): Promise<string | null> {
  // Engine 2: Better accuracy for structured documents (IDs, licences)
  const engine2Text = await callOcrSpace(apiKey, dataUri, '2')
  if (engine2Text && engine2Text.trim().length > 20) {
    console.log('[OCR] Engine 2 succeeded')
    return engine2Text
  }

  // Fallback: Engine 1 (faster, better for simple text)
  console.log('[OCR] Engine 2 insufficient, falling back to Engine 1')
  const engine1Text = await callOcrSpace(apiKey, dataUri, '1')
  if (engine1Text && engine1Text.trim()) {
    console.log('[OCR] Engine 1 succeeded')
    return engine1Text
  }

  return null
}

async function callOcrSpace(apiKey: string, dataUri: string, engine: '1' | '2'): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('apikey', apiKey)
    formData.append('base64Image', dataUri)
    formData.append('language', 'eng')
    formData.append('isOverlayRequired', 'false')
    formData.append('detectOrientation', 'true')
    formData.append('scale', 'true')
    formData.append('isTable', 'true')           // Better for structured ID layouts
    formData.append('OCREngine', engine)

    const res = await fetch(OCR_SPACE_URL, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(engine === '2' ? 30000 : 15000),
    })

    if (!res.ok) {
      console.error(`[OCR] Engine ${engine} HTTP error:`, res.status)
      return null
    }

    const data = await res.json()

    if (data.IsErroredOnProcessing) {
      console.error(`[OCR] Engine ${engine} processing error:`, data.ErrorMessage)
      return null
    }

    return (data.ParsedResults ?? [])
      .map((r: { ParsedText?: string }) => r.ParsedText ?? '')
      .join('\n')
  } catch (err) {
    console.error(`[OCR] Engine ${engine} exception:`, err)
    return null
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
