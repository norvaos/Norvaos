/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Form Pack PDF Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Standalone utility functions for:
 *   - Template checksum validation (SHA-256, hard-fail on mismatch)
 *   - DRAFT watermark application (red, rotated, every page)
 *   - File checksum computation
 *
 * Design rules:
 *   - Every function either succeeds or throws (no silent null returns)
 *   - Checksum validation returns a result object  -  caller decides behavior
 *   - Watermark uses pdf-lib (JavaScript), not pikepdf (Python)
 *     because watermarking doesn't touch XFA streams
 */

import { createHash } from 'crypto'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'

// ── Checksum Computation ──────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex checksum of a byte array.
 * Used for both template validation and artifact integrity tracking.
 */
export function computeFileChecksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// ── Template Checksum Validation ──────────────────────────────────────────────

export interface TemplateChecksumResult {
  /** Whether the actual checksum matches the expected one */
  valid: boolean
  /** SHA-256 hex of the actual bytes */
  actual: string
  /** SHA-256 hex we expected (from DB) */
  expected: string
}

/**
 * Validate a template checksum from already-loaded bytes (no file I/O).
 * Use this when the template has been downloaded from Supabase Storage.
 * If no expected checksum is provided, validation is skipped (returns valid=true).
 */
export function validateTemplateBytesChecksum(
  bytes: Uint8Array,
  expected: string | null | undefined,
): TemplateChecksumResult {
  const actual = computeFileChecksum(bytes)
  if (!expected) return { valid: true, actual, expected: '' }
  return { valid: actual === expected, actual, expected }
}

// ── DRAFT Watermark ───────────────────────────────────────────────────────────

/**
 * Apply a "DRAFT" watermark overlay on every page of a PDF.
 *
 * The watermark is:
 *   - Red text, 15% opacity
 *   - Rotated 45 degrees
 *   - Large font (80pt) centered on each page
 *   - Text: "DRAFT  -  NOT FOR SUBMISSION"
 *
 * This uses pdf-lib which does NOT modify XFA streams  -  it only adds
 * content stream operators on top of each page, so the XFA data remains
 * intact and renderable in Adobe Reader.
 *
 * @param pdfBytes - The filled PDF bytes (after XFA filling)
 * @returns New PDF bytes with watermark overlay
 */
export async function applyDraftWatermark(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    // Don't throw on encrypted or problematic PDFs  -  XFA PDFs can be finicky
    ignoreEncryption: true,
  })

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pages = pdfDoc.getPages()

  const watermarkText = 'DRAFT'
  const subText = 'NOT FOR SUBMISSION'
  const fontSize = 80
  const subFontSize = 24
  const opacity = 0.15
  const color = rgb(0.8, 0, 0) // Dark red

  for (const page of pages) {
    const { width, height } = page.getSize()

    // Main "DRAFT" text  -  centered and rotated
    const textWidth = font.widthOfTextAtSize(watermarkText, fontSize)
    const textHeight = fontSize
    page.drawText(watermarkText, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(45),
    })

    // Sub text  -  below the main watermark
    const subWidth = font.widthOfTextAtSize(subText, subFontSize)
    page.drawText(subText, {
      x: (width - subWidth) / 2,
      y: (height / 2) - 60,
      size: subFontSize,
      font,
      color,
      opacity,
      rotate: degrees(45),
    })
  }

  return pdfDoc.save()
}

// ── Error Classes ─────────────────────────────────────────────────────────────

/**
 * Thrown when the template PDF checksum doesn't match the expected value.
 * This is a hard failure  -  generation must stop.
 */
export class TemplateIntegrityError extends Error {
  readonly formCode: string
  readonly actual: string
  readonly expected: string

  constructor(formCode: string, actual: string, expected: string) {
    super(
      `Template integrity check failed for ${formCode}. ` +
      `Expected checksum: ${expected.slice(0, 12)}..., ` +
      `Actual: ${actual.slice(0, 12)}... ` +
      `The IRCC template may have been updated. ` +
      `Update EXPECTED_TEMPLATE_CHECKSUMS and verify field mappings before proceeding.`
    )
    this.name = 'TemplateIntegrityError'
    this.formCode = formCode
    this.actual = actual
    this.expected = expected
  }
}

/**
 * Thrown when the XFA fill engine returns null (Python/pikepdf failure).
 * This replaces the old silent fallback to summary PDF.
 */
export class XFAFillError extends Error {
  readonly formCode: string

  constructor(formCode: string, cause?: unknown) {
    super(
      `XFA fill engine failed for ${formCode}. ` +
      `No PDF output was produced. ` +
      `This is a hard failure  -  no fallback PDF will be generated.`
    )
    this.name = 'XFAFillError'
    this.formCode = formCode
    if (cause) this.cause = cause
  }
}

/**
 * Thrown when readiness check fails and generation cannot proceed.
 */
export class ReadinessError extends Error {
  readonly missingFields: string[]
  readonly errors: string[]

  constructor(missingFields: string[], errors: string[]) {
    const parts: string[] = []
    if (missingFields.length > 0) {
      parts.push(`Missing required fields: ${missingFields.join(', ')}`)
    }
    if (errors.length > 0) {
      parts.push(`Validation errors: ${errors.join('; ')}`)
    }
    super(`Cannot generate form pack. ${parts.join('. ')}`)
    this.name = 'ReadinessError'
    this.missingFields = missingFields
    this.errors = errors
  }
}
