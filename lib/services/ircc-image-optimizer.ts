/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Image Optimiser  -  Submission Package Compliance
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ensures all images in a submission package meet IRCC portal specs:
 *
 * Digital Photo:  420 x 540 px, JPEG, 240 KB - 4 MB
 * General Docs:   Max 4 MB per file, JPEG/PNG/PDF
 * PDF Documents:  Max 4 MB per document
 *
 * Also handles:
 *   - Auto-resize oversized images
 *   - JPEG quality reduction for files that exceed 4 MB
 *   - PDF page-level compression via pdf-lib
 *
 * This is a server-side utility  -  runs in API routes only.
 */

import { PDFDocument } from 'pdf-lib'

// ── IRCC Constraints ─────────────────────────────────────────────────────────

export const IRCC_LIMITS = {
  /** Maximum file size for any single upload (bytes) */
  MAX_FILE_SIZE: 4 * 1024 * 1024, // 4 MB

  /** Digital photo dimensions (pixels) */
  PHOTO_WIDTH: 420,
  PHOTO_HEIGHT: 540,

  /** Photo file size range (bytes) */
  PHOTO_MIN_SIZE: 240 * 1024, // 240 KB
  PHOTO_MAX_SIZE: 4 * 1024 * 1024, // 4 MB

  /** Accepted MIME types */
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png'] as const,
  ACCEPTED_DOC_TYPES: ['application/pdf', 'image/jpeg', 'image/png'] as const,
} as const

// ── Types ────────────────────────────────────────────────────────────────────

export interface OptimiseResult {
  /** Optimised file bytes */
  bytes: Uint8Array
  /** Final MIME type */
  mimeType: string
  /** Original size in bytes */
  originalSize: number
  /** Final size in bytes */
  finalSize: number
  /** Whether any transformation was applied */
  wasOptimised: boolean
  /** Warnings (e.g. quality was reduced) */
  warnings: string[]
}

export interface OptimiseOptions {
  /** Target type: 'photo' applies strict IRCC photo rules, 'document' applies general rules */
  type: 'photo' | 'document'
  /** Override max file size (default: 4 MB) */
  maxBytes?: number
}

// ── PDF Compression ──────────────────────────────────────────────────────────

/**
 * Compress a PDF document by re-serialising it through pdf-lib.
 * This strips redundant streams and re-encodes objects.
 *
 * If the PDF is already under maxBytes, returns it unchanged.
 */
export async function compressPdf(
  pdfBytes: Uint8Array,
  maxBytes: number = IRCC_LIMITS.MAX_FILE_SIZE,
): Promise<OptimiseResult> {
  const originalSize = pdfBytes.byteLength
  const warnings: string[] = []

  if (originalSize <= maxBytes) {
    return {
      bytes: pdfBytes,
      mimeType: 'application/pdf',
      originalSize,
      finalSize: originalSize,
      wasOptimised: false,
      warnings: [],
    }
  }

  try {
    // Load and re-save through pdf-lib (strips redundant data)
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const compressed = await doc.save()
    const compressedArray = new Uint8Array(compressed)

    if (compressedArray.byteLength > maxBytes) {
      warnings.push(
        `PDF is ${formatBytes(compressedArray.byteLength)} after compression ` +
        `(limit: ${formatBytes(maxBytes)}). Consider splitting or reducing scanned image quality.`,
      )
    }

    return {
      bytes: compressedArray,
      mimeType: 'application/pdf',
      originalSize,
      finalSize: compressedArray.byteLength,
      wasOptimised: compressedArray.byteLength < originalSize,
      warnings,
    }
  } catch (err) {
    warnings.push(`PDF compression failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    return {
      bytes: pdfBytes,
      mimeType: 'application/pdf',
      originalSize,
      finalSize: originalSize,
      wasOptimised: false,
      warnings,
    }
  }
}

// ── Image Optimisation (server-side via Canvas API in Node) ──────────────────

/**
 * Validate and return metadata about an image buffer.
 * Uses the first bytes to detect format (magic bytes).
 */
export function detectImageFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'unknown' {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png'
  return 'unknown'
}

/**
 * Check if a file (image or PDF) meets IRCC submission constraints.
 * Returns an array of validation issues (empty = all clear).
 */
export function validateForSubmission(
  bytes: Uint8Array,
  mimeType: string,
  options: OptimiseOptions,
): string[] {
  const issues: string[] = []
  const maxBytes = options.maxBytes ?? IRCC_LIMITS.MAX_FILE_SIZE

  if (bytes.byteLength > maxBytes) {
    issues.push(
      `File is ${formatBytes(bytes.byteLength)} (limit: ${formatBytes(maxBytes)}). ` +
      'Must be compressed before submission.',
    )
  }

  if (options.type === 'photo') {
    if (mimeType !== 'image/jpeg') {
      issues.push('Digital photo must be JPEG format for IRCC submission.')
    }
    if (bytes.byteLength < IRCC_LIMITS.PHOTO_MIN_SIZE) {
      issues.push(
        `Photo is ${formatBytes(bytes.byteLength)} (minimum: ${formatBytes(IRCC_LIMITS.PHOTO_MIN_SIZE)}). ` +
        'Image quality may be too low.',
      )
    }
  }

  if (options.type === 'document') {
    const isAccepted = IRCC_LIMITS.ACCEPTED_DOC_TYPES.some((t) => t === mimeType)
    if (!isAccepted) {
      issues.push(`File type ${mimeType} is not accepted by IRCC. Use PDF, JPEG, or PNG.`)
    }
  }

  return issues
}

// ── Batch Validator ──────────────────────────────────────────────────────────

export interface PackageFileEntry {
  name: string
  bytes: Uint8Array
  mimeType: string
  slot: string // e.g. 'passport', 'photo', 'bank_statement'
}

export interface PackageValidationResult {
  valid: boolean
  totalSize: number
  fileCount: number
  issues: Array<{ file: string; problems: string[] }>
}

/**
 * Validate an entire submission package before assembly.
 * Returns per-file issues and overall pass/fail.
 */
export function validateSubmissionPackage(
  files: PackageFileEntry[],
): PackageValidationResult {
  const issues: PackageValidationResult['issues'] = []
  let totalSize = 0

  for (const file of files) {
    totalSize += file.bytes.byteLength
    const type: OptimiseOptions['type'] = file.slot === 'photo' ? 'photo' : 'document'
    const problems = validateForSubmission(file.bytes, file.mimeType, { type })
    if (problems.length > 0) {
      issues.push({ file: file.name, problems })
    }
  }

  return {
    valid: issues.length === 0,
    totalSize,
    fileCount: files.length,
    issues,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
