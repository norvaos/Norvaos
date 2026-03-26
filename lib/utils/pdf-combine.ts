// ============================================================================
// PDF Combine Utility  -  Client-side multi-page PDF creation
// ============================================================================
// Combines multiple images and/or PDFs into a single multi-page PDF.
// Uses pdf-lib (lazy-loaded) to avoid bloating the main bundle.
// Used by the portal upload sheet for multi-page document scanning.
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StagedPage {
  id: string           // Unique ID for React keys
  file: File           // Raw file object
  previewUrl: string   // Object URL for thumbnail display
  type: 'image' | 'pdf' | 'document'
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a StagedPage from a File with preview URL and type detection.
 */
export function createStagedPage(file: File): StagedPage {
  const type: StagedPage['type'] = file.type.startsWith('image/')
    ? 'image'
    : file.type === 'application/pdf'
      ? 'pdf'
      : 'document'

  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: type === 'image' ? URL.createObjectURL(file) : '',
    type,
  }
}

/**
 * Revoke all object URLs to prevent memory leaks.
 * Call when the upload sheet closes or pages are discarded.
 */
export function revokeStagedPages(pages: StagedPage[]): void {
  for (const page of pages) {
    URL.revokeObjectURL(page.previewUrl)
  }
}

/**
 * Format bytes into a human-readable size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── PDF Combination ────────────────────────────────────────────────────────

/**
 * Combine multiple staged pages into a single multi-page PDF.
 *
 * - Images are embedded into PDF pages scaled to fit A4-ish dimensions
 * - PDFs are merged (all pages copied)
 * - If only 1 page and it's already a PDF, returns it as-is (zero overhead)
 *
 * @param pages - Array of staged pages to combine
 * @param outputFileName - Desired filename for the combined PDF
 * @returns A single File object containing the combined PDF
 */
export async function combinePagesIntoPdf(
  pages: StagedPage[],
  outputFileName: string
): Promise<File> {
  // Shortcut: single PDF → return as-is
  if (pages.length === 1 && pages[0].type === 'pdf') {
    return pages[0].file
  }

  // Shortcut: single image → still combine into PDF for consistency
  // (law firms prefer PDF format for review)

  // Lazy-load pdf-lib
  const { PDFDocument } = await import('pdf-lib')
  const combined = await PDFDocument.create()

  for (const page of pages) {
    const arrayBuffer = await page.file.arrayBuffer()

    if (page.type === 'pdf') {
      // Merge all pages from this PDF
      const sourcePdf = await PDFDocument.load(arrayBuffer)
      const pageIndices = sourcePdf.getPageIndices()
      const copiedPages = await combined.copyPages(sourcePdf, pageIndices)
      for (const copiedPage of copiedPages) {
        combined.addPage(copiedPage)
      }
    } else {
      // Embed image into a new page
      const image = page.file.type === 'image/png'
        ? await combined.embedPng(arrayBuffer)
        : await combined.embedJpg(arrayBuffer)

      // Scale image to fit a reasonable page size
      // Use A4-like proportions (595 x 842 points) as baseline
      const maxWidth = 595
      const maxHeight = 842
      const imgWidth = image.width
      const imgHeight = image.height

      // Scale to fit within max dimensions while preserving aspect ratio
      const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1)
      const scaledWidth = imgWidth * scale
      const scaledHeight = imgHeight * scale

      // Create page sized to the scaled image (not always A4)
      const pdfPage = combined.addPage([scaledWidth, scaledHeight])
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: scaledWidth,
        height: scaledHeight,
      })
    }
  }

  const pdfBytes = await combined.save()
  // Cast needed: pdf-lib returns Uint8Array<ArrayBufferLike> but File/Blob expect ArrayBuffer
  return new File([pdfBytes as BlobPart], outputFileName, { type: 'application/pdf' })
}
