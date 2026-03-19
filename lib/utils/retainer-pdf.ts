/**
 * Retainer Agreement PDF Generator
 *
 * Server-side utility for generating professional retainer agreement PDFs using pdf-lib.
 *
 * Guardrails:
 * - All free-text fields sanitized: control chars (U+0000-U+001F except \n)
 *   and zero-width chars stripped. NO transliteration — full Unicode via
 *   embedded Inter font.
 * - Pagination: auto-adds new pages when content overflows
 * - A4 page format (595x842pt)
 * - Inter Regular / Inter Bold fonts (embedded TTF with fontkit)
 * - Monetary values: subtotalCents/taxAmountCents/totalAmountCents in cents;
 *   lineItems/governmentFees/disbursements in dollars (matching builder storage)
 * - Required sections: firm header, client info, billing type, fee table,
 *   govt fees, disbursements, totals, payment terms, payment plan, signatures, consent, footer
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  rgb,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { formatDateWithFormat } from '@/lib/utils/formatters'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetainerPdfData {
  firmName: string
  firmAddress?: string | null
  clientName: string
  clientEmail?: string | null
  matterType?: string | null
  billingType: string
  lineItems: { description: string; quantity: number; unitPrice: number }[] // unitPrice in dollars
  governmentFees: { description: string; amount: number }[] // in dollars
  disbursements: { description: string; amount: number }[] // in dollars
  hstApplicable: boolean
  subtotalCents: number
  taxAmountCents: number
  totalAmountCents: number
  paymentTerms?: string | null
  paymentPlan?: { amount: number; dueDate?: string; milestone?: string }[] | null
  currency?: string // default 'CAD'
  /** Unique verification code for paper-sign authentication. Printed on PDF footer. */
  verificationCode?: string | null
  /** Tenant's preferred date format token, e.g. "DD/MM/YYYY". Passed from API route. */
  dateFormat?: string | null
}

// ── Constants (exported for template renderer) ──────────────────────────────

export const PAGE_WIDTH = 595   // A4 width in points
export const PAGE_HEIGHT = 842  // A4 height in points
export const MARGIN_LEFT = 50
export const MARGIN_RIGHT = 50
export const MARGIN_TOP = 50
export const MARGIN_BOTTOM = 60
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

// Colours (greyscale-friendly)
export const COLOR_BLACK = rgb(0, 0, 0)
export const COLOR_DARK = rgb(0.2, 0.2, 0.2)
export const COLOR_MID = rgb(0.45, 0.45, 0.45)
export const COLOR_LIGHT = rgb(0.7, 0.7, 0.7)
export const COLOR_BG = rgb(0.96, 0.96, 0.96)
export const COLOR_PRIMARY = rgb(0.15, 0.35, 0.65) // Blue accent

// Font sizes
export const FONT_TITLE = 18
export const FONT_HEADING = 11
export const FONT_BODY = 9
export const FONT_SMALL = 7.5
export const LINE_HEIGHT = 14

// ── Font Loading ─────────────────────────────────────────────────────────────

let cachedRegular: Buffer | null = null
let cachedBold: Buffer | null = null

function loadFontBytes(filename: string): Buffer {
  return readFileSync(join(process.cwd(), 'lib', 'fonts', filename))
}

export function getRegularFontBytes(): Buffer {
  if (!cachedRegular) cachedRegular = loadFontBytes('Inter-Regular.ttf')
  return cachedRegular
}

export function getBoldFontBytes(): Buffer {
  if (!cachedBold) cachedBold = loadFontBytes('Inter-Bold.ttf')
  return cachedBold
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize free-text for PDF rendering.
 * Only strips control chars and zero-width chars.
 * NO transliteration — the embedded Inter font handles full Unicode.
 */
export function sanitize(text: string | null | undefined): string {
  if (!text) return ''
  return text
    // Strip control characters except newline
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
    // Strip zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

/** Format cents to currency string */
export function formatCurrency(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** Format dollars to currency string (no cents division) */
export function formatDollars(dollars: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/**
 * Format ISO date string using the tenant's preferred format.
 * Delegates to formatDateWithFormat (timezone-safe manual parsing).
 */
function formatDate(isoDate: string, dateFormat?: string | null): string {
  return formatDateWithFormat(isoDate, dateFormat)
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Truncate text to fit within a given width */
function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
}

// ── Page Manager ─────────────────────────────────────────────────────────────

export class PdfPageManager {
  private doc: PDFDocument
  private currentPage: PDFPage
  private yPos: number
  private font: PDFFont
  private fontBold: PDFFont
  private pageCount = 1

  constructor(
    doc: PDFDocument,
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
  ) {
    this.doc = doc
    this.currentPage = page
    this.font = font
    this.fontBold = fontBold
    this.yPos = PAGE_HEIGHT - MARGIN_TOP
  }

  get y(): number {
    return this.yPos
  }

  set y(val: number) {
    this.yPos = val
  }

  get page(): PDFPage {
    return this.currentPage
  }

  /** Check if there's room for N points of content; if not, add a new page */
  ensureSpace(neededPoints: number): void {
    if (this.yPos - neededPoints < MARGIN_BOTTOM) {
      this.addPage()
    }
  }

  addPage(): void {
    // Draw page number on current page footer before moving on
    this.drawPageNumber()
    // Create new page
    this.currentPage = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.pageCount++
    this.yPos = PAGE_HEIGHT - MARGIN_TOP
  }

  drawPageNumber(): void {
    const text = `Page ${this.pageCount}`
    const textWidth = this.font.widthOfTextAtSize(text, FONT_SMALL)
    this.currentPage.drawText(text, {
      x: PAGE_WIDTH - MARGIN_RIGHT - textWidth,
      y: MARGIN_BOTTOM - 25,
      size: FONT_SMALL,
      font: this.font,
      color: COLOR_LIGHT,
    })
  }

  /** Draw text at current position */
  drawText(
    text: string,
    opts: {
      font?: PDFFont
      size?: number
      color?: ReturnType<typeof rgb>
      x?: number
      maxWidth?: number
    } = {},
  ): void {
    const f = opts.font ?? this.font
    const size = opts.size ?? FONT_BODY
    const x = opts.x ?? MARGIN_LEFT
    const displayText = opts.maxWidth
      ? truncateText(sanitize(text), f, size, opts.maxWidth)
      : sanitize(text)

    this.currentPage.drawText(displayText, {
      x,
      y: this.yPos,
      size,
      font: f,
      color: opts.color ?? COLOR_DARK,
    })
  }

  /** Draw right-aligned text */
  drawTextRight(
    text: string,
    opts: {
      font?: PDFFont
      size?: number
      color?: ReturnType<typeof rgb>
    } = {},
  ): void {
    const f = opts.font ?? this.font
    const size = opts.size ?? FONT_BODY
    const textWidth = f.widthOfTextAtSize(sanitize(text), size)
    this.drawText(text, {
      ...opts,
      x: PAGE_WIDTH - MARGIN_RIGHT - textWidth,
    })
  }

  /** Draw centered text */
  drawTextCentered(
    text: string,
    opts: {
      font?: PDFFont
      size?: number
      color?: ReturnType<typeof rgb>
    } = {},
  ): void {
    const f = opts.font ?? this.font
    const size = opts.size ?? FONT_BODY
    const textWidth = f.widthOfTextAtSize(sanitize(text), size)
    this.drawText(text, {
      ...opts,
      x: (PAGE_WIDTH - textWidth) / 2,
    })
  }

  /** Draw a horizontal line */
  drawLine(
    opts: {
      y?: number
      color?: ReturnType<typeof rgb>
      thickness?: number
      startX?: number
      endX?: number
    } = {},
  ): void {
    const y = opts.y ?? this.yPos
    this.currentPage.drawLine({
      start: { x: opts.startX ?? MARGIN_LEFT, y },
      end: { x: opts.endX ?? (PAGE_WIDTH - MARGIN_RIGHT), y },
      thickness: opts.thickness ?? 0.5,
      color: opts.color ?? COLOR_LIGHT,
    })
  }

  /** Draw a filled rectangle */
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: ReturnType<typeof rgb>,
  ): void {
    this.currentPage.drawRectangle({
      x,
      y,
      width,
      height,
      color,
    })
  }

  /** Move y position down */
  moveDown(points: number): void {
    this.yPos -= points
  }

  /** Word-wrap text and draw lines, returning number of lines drawn */
  drawWrappedText(
    text: string,
    opts: {
      font?: PDFFont
      size?: number
      color?: ReturnType<typeof rgb>
      x?: number
      maxWidth?: number
      lineHeight?: number
    } = {},
  ): number {
    const f = opts.font ?? this.font
    const size = opts.size ?? FONT_BODY
    const maxWidth = opts.maxWidth ?? CONTENT_WIDTH
    const lh = opts.lineHeight ?? LINE_HEIGHT

    const lines = sanitize(text).split('\n')
    let linesDrawn = 0

    for (const line of lines) {
      const words = line.split(' ')
      let currentLine = ''

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        if (f.widthOfTextAtSize(testLine, size) > maxWidth) {
          if (currentLine) {
            this.ensureSpace(lh)
            this.drawText(currentLine, { font: f, size, color: opts.color, x: opts.x })
            this.moveDown(lh)
            linesDrawn++
          }
          currentLine = word
        } else {
          currentLine = testLine
        }
      }

      if (currentLine) {
        this.ensureSpace(lh)
        this.drawText(currentLine, { font: f, size, color: opts.color, x: opts.x })
        this.moveDown(lh)
        linesDrawn++
      }
    }

    return linesDrawn
  }

  /** Finalize — draw page number on the last page */
  finalize(): void {
    this.drawPageNumber()
  }

  getFont(): PDFFont {
    return this.font
  }

  getBoldFont(): PDFFont {
    return this.fontBold
  }
}

// ── Main Generator ───────────────────────────────────────────────────────────

export async function generateRetainerPdf(data: RetainerPdfData): Promise<Uint8Array> {
  const currency = data.currency ?? 'CAD'
  const fmtCents = (cents: number) => formatCurrency(cents, currency)
  const fmtDollars = (dollars: number) => formatDollars(dollars, currency)

  // Create document
  const doc = await PDFDocument.create()
  doc.setTitle(`Retainer Agreement — ${sanitize(data.clientName)}`)
  doc.setSubject(`Retainer Agreement for ${sanitize(data.clientName)}`)
  doc.setCreator('NorvaOS')
  doc.setProducer('NorvaOS Retainer Agreement Generator')

  // Register fontkit for custom font embedding
  doc.registerFontkit(fontkit)

  // Embed Inter fonts (full Unicode support)
  const font = await doc.embedFont(getRegularFontBytes())
  const fontBold = await doc.embedFont(getBoldFontBytes())

  // Create first page
  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const pm = new PdfPageManager(doc, firstPage, font, fontBold)

  // ── 1. Firm Header ─────────────────────────────────────────

  pm.drawText(sanitize(data.firmName), {
    font: fontBold,
    size: FONT_TITLE,
    color: COLOR_PRIMARY,
  })
  pm.moveDown(22)

  if (data.firmAddress) {
    const addressLines = sanitize(data.firmAddress).split('\n')
    for (const line of addressLines) {
      pm.drawText(line, { size: FONT_BODY, color: COLOR_MID })
      pm.moveDown(LINE_HEIGHT)
    }
  }

  pm.moveDown(10)
  pm.drawLine()
  pm.moveDown(20)

  // ── 2. "RETAINER AGREEMENT" Title ──────────────────────────

  pm.drawTextCentered('RETAINER AGREEMENT', {
    font: fontBold,
    size: 20,
    color: COLOR_PRIMARY,
  })
  pm.moveDown(30)

  // ── 3. Client Info Section ─────────────────────────────────

  pm.drawText('PREPARED FOR', {
    font: fontBold,
    size: FONT_SMALL,
    color: COLOR_MID,
  })
  pm.moveDown(LINE_HEIGHT + 2)

  pm.drawText(sanitize(data.clientName), {
    font: fontBold,
    size: FONT_HEADING,
    color: COLOR_BLACK,
  })
  pm.moveDown(LINE_HEIGHT + 2)

  if (data.clientEmail) {
    pm.drawText(sanitize(data.clientEmail), { size: FONT_BODY, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT)
  }

  if (data.matterType) {
    pm.moveDown(4)
    pm.drawText('Matter Type', {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
      x: MARGIN_LEFT,
    })
    pm.drawText(sanitize(data.matterType), {
      size: FONT_BODY,
      color: COLOR_DARK,
      x: MARGIN_LEFT + 70,
    })
    pm.moveDown(LINE_HEIGHT)
  }

  pm.moveDown(6)

  // ── 4. Billing Type ────────────────────────────────────────

  pm.drawText('Billing Type', {
    font: fontBold,
    size: FONT_SMALL,
    color: COLOR_MID,
    x: MARGIN_LEFT,
  })
  pm.drawText(capitalize(sanitize(data.billingType).replace(/_/g, ' ')), {
    size: FONT_BODY,
    color: COLOR_DARK,
    x: MARGIN_LEFT + 70,
  })
  pm.moveDown(LINE_HEIGHT + 10)

  pm.drawLine()
  pm.moveDown(15)

  // ── 5. Professional Fees Table ─────────────────────────────

  if (data.lineItems.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('PROFESSIONAL FEES', {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
    })
    pm.moveDown(LINE_HEIGHT + 4)

    const colDesc = MARGIN_LEFT
    const colQty = MARGIN_LEFT + CONTENT_WIDTH - 200
    const colUnit = MARGIN_LEFT + CONTENT_WIDTH - 130
    const colAmt = PAGE_WIDTH - MARGIN_RIGHT

    // Table header background
    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    pm.drawText('Qty', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colQty })
    pm.drawText('Unit Price', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colUnit })
    const amtHeaderWidth = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHeaderWidth })

    pm.moveDown(LINE_HEIGHT + 10)

    // Table rows
    for (const item of data.lineItems) {
      pm.ensureSpace(LINE_HEIGHT + 8)

      const descText = truncateText(sanitize(item.description), font, FONT_BODY, colQty - colDesc - 15)
      pm.drawText(descText, { size: FONT_BODY, x: colDesc + 4 })
      pm.drawText(String(item.quantity), { size: FONT_BODY, x: colQty })
      pm.drawText(fmtDollars(item.unitPrice), { size: FONT_BODY, x: colUnit })

      // Right-align amount
      const lineAmount = item.quantity * item.unitPrice
      const amtText = fmtDollars(lineAmount)
      const amtWidth = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtWidth })

      pm.moveDown(LINE_HEIGHT + 4)

      // Light separator
      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }

    pm.moveDown(8)
  }

  // ── 6. Government Fees Table ───────────────────────────────

  if (data.governmentFees.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('GOVERNMENT FEES', {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
    })
    pm.moveDown(LINE_HEIGHT + 4)

    const colDesc = MARGIN_LEFT
    const colAmt = PAGE_WIDTH - MARGIN_RIGHT

    // Table header background
    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    const amtHeaderWidth = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHeaderWidth })

    pm.moveDown(LINE_HEIGHT + 10)

    for (const fee of data.governmentFees) {
      pm.ensureSpace(LINE_HEIGHT + 8)

      const descText = truncateText(sanitize(fee.description), font, FONT_BODY, CONTENT_WIDTH - 100)
      pm.drawText(descText, { size: FONT_BODY, x: colDesc + 4 })

      const amtText = fmtDollars(fee.amount)
      const amtWidth = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtWidth })

      pm.moveDown(LINE_HEIGHT + 4)

      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }

    pm.moveDown(8)
  }

  // ── 7. Disbursements Table ─────────────────────────────────

  if (data.disbursements.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('DISBURSEMENTS', {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
    })
    pm.moveDown(LINE_HEIGHT + 4)

    const colDesc = MARGIN_LEFT
    const colAmt = PAGE_WIDTH - MARGIN_RIGHT

    // Table header background
    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    const amtHeaderWidth = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHeaderWidth })

    pm.moveDown(LINE_HEIGHT + 10)

    for (const item of data.disbursements) {
      pm.ensureSpace(LINE_HEIGHT + 8)

      const descText = truncateText(sanitize(item.description), font, FONT_BODY, CONTENT_WIDTH - 100)
      pm.drawText(descText, { size: FONT_BODY, x: colDesc + 4 })

      const amtText = fmtDollars(item.amount)
      const amtWidth = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtWidth })

      pm.moveDown(LINE_HEIGHT + 4)

      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }

    pm.moveDown(8)
  }

  // ── 8. Totals Section ──────────────────────────────────────

  pm.ensureSpace(80)

  const totalLabelX = PAGE_WIDTH - MARGIN_RIGHT - 180
  const totalValueX = PAGE_WIDTH - MARGIN_RIGHT

  const drawTotalRow = (label: string, value: string, bold = false) => {
    pm.ensureSpace(LINE_HEIGHT + 4)
    const f = bold ? fontBold : font
    const size = bold ? FONT_HEADING : FONT_BODY
    pm.drawText(label, { font: f, size, color: COLOR_DARK, x: totalLabelX })
    const valWidth = f.widthOfTextAtSize(value, size)
    pm.drawText(value, { font: f, size, color: COLOR_DARK, x: totalValueX - valWidth })
    pm.moveDown(LINE_HEIGHT + 4)
  }

  drawTotalRow('Subtotal', fmtCents(data.subtotalCents))

  if (data.hstApplicable) {
    drawTotalRow('HST (13%)', fmtCents(data.taxAmountCents))
  } else {
    drawTotalRow('Tax', fmtCents(data.taxAmountCents))
  }

  pm.drawLine({
    y: pm.y + 2,
    color: COLOR_DARK,
    thickness: 1,
  })
  pm.moveDown(6)

  // Total highlight box
  pm.drawRect(totalLabelX - 5, pm.y - 4, 185, LINE_HEIGHT + 10, COLOR_PRIMARY)
  const totalLabel = 'TOTAL'
  const totalValue = fmtCents(data.totalAmountCents)
  pm.drawText(totalLabel, { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalLabelX })
  const totalValWidth = fontBold.widthOfTextAtSize(totalValue, FONT_HEADING)
  pm.drawText(totalValue, { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalValueX - totalValWidth })
  pm.moveDown(LINE_HEIGHT + 20)

  // ── 9. Payment Terms ───────────────────────────────────────

  if (data.paymentTerms) {
    pm.ensureSpace(40)
    pm.drawText('PAYMENT TERMS', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 2)

    pm.drawWrappedText(data.paymentTerms, {
      size: FONT_BODY,
      color: COLOR_DARK,
      maxWidth: CONTENT_WIDTH,
    })
    pm.moveDown(10)
  }

  // ── 10. Payment Plan Schedule ──────────────────────────────

  if (data.paymentPlan && data.paymentPlan.length > 0) {
    pm.ensureSpace(60)
    pm.drawText('PAYMENT SCHEDULE', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 4)

    const planColNum = MARGIN_LEFT
    const planColAmount = MARGIN_LEFT + 30
    const planColDue = MARGIN_LEFT + 150
    const planColMilestone = MARGIN_LEFT + 280

    // Table header background
    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

    pm.drawText('#', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: planColNum + 4 })
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: planColAmount })
    pm.drawText('Due Date', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: planColDue })
    pm.drawText('Milestone', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: planColMilestone })

    pm.moveDown(LINE_HEIGHT + 10)

    for (let i = 0; i < data.paymentPlan.length; i++) {
      const installment = data.paymentPlan[i]
      pm.ensureSpace(LINE_HEIGHT + 8)

      pm.drawText(String(i + 1), { size: FONT_BODY, x: planColNum + 4 })
      pm.drawText(fmtDollars(installment.amount), { size: FONT_BODY, x: planColAmount })

      if (installment.dueDate) {
        pm.drawText(formatDate(installment.dueDate, data.dateFormat), { size: FONT_BODY, x: planColDue })
      } else {
        pm.drawText('\u2014', { size: FONT_BODY, color: COLOR_LIGHT, x: planColDue })
      }

      if (installment.milestone) {
        const milestoneText = truncateText(sanitize(installment.milestone), font, FONT_BODY, PAGE_WIDTH - MARGIN_RIGHT - planColMilestone - 5)
        pm.drawText(milestoneText, { size: FONT_BODY, x: planColMilestone })
      } else {
        pm.drawText('\u2014', { size: FONT_BODY, color: COLOR_LIGHT, x: planColMilestone })
      }

      pm.moveDown(LINE_HEIGHT + 4)

      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }

    pm.moveDown(10)
  }

  // ── 11. Consent Text ───────────────────────────────────────

  pm.ensureSpace(60)
  pm.drawLine()
  pm.moveDown(15)

  const consentText = `By signing below, I acknowledge that I have read and agree to the terms of this Retainer Agreement. I authorize ${sanitize(data.firmName)} to represent me in the matter described above.`

  pm.drawWrappedText(consentText, {
    size: FONT_SMALL,
    color: COLOR_MID,
    maxWidth: CONTENT_WIDTH,
  })
  pm.moveDown(10)

  // ── 12. Signature Section ──────────────────────────────────
  // Positioned for e-sign overlay compatibility:
  // Client signature at x=50, Lawyer signature at x=330, y=120 from bottom of last page

  const signatureBlockHeight = 80
  pm.ensureSpace(signatureBlockHeight + 30)

  // Client signature block (left side, x=50)
  const clientSigX = MARGIN_LEFT
  const clientSigLineY = pm.y - 40

  pm.drawText('Client Signature', {
    font: fontBold,
    size: FONT_SMALL,
    color: COLOR_MID,
    x: clientSigX,
  })

  // Signature line
  pm.drawLine({
    y: clientSigLineY,
    startX: clientSigX,
    endX: clientSigX + 220,
    color: COLOR_DARK,
    thickness: 0.5,
  })

  // Name below line
  pm.page.drawText(sanitize(data.clientName), {
    x: clientSigX,
    y: clientSigLineY - 14,
    size: FONT_BODY,
    font,
    color: COLOR_DARK,
  })

  // Date label below name
  pm.page.drawText('Date: ____________________', {
    x: clientSigX,
    y: clientSigLineY - 28,
    size: FONT_BODY,
    font,
    color: COLOR_MID,
  })

  // Lawyer signature block (right side, x=330)
  const lawyerSigX = 330

  pm.page.drawText('Lawyer Signature', {
    x: lawyerSigX,
    y: pm.y,
    size: FONT_SMALL,
    font: fontBold,
    color: COLOR_MID,
  })

  // Signature line
  pm.drawLine({
    y: clientSigLineY,
    startX: lawyerSigX,
    endX: lawyerSigX + 220,
    color: COLOR_DARK,
    thickness: 0.5,
  })

  // Firm name below line
  pm.page.drawText(sanitize(data.firmName), {
    x: lawyerSigX,
    y: clientSigLineY - 14,
    size: FONT_BODY,
    font,
    color: COLOR_DARK,
  })

  // Date label below name
  pm.page.drawText('Date: ____________________', {
    x: lawyerSigX,
    y: clientSigLineY - 28,
    size: FONT_BODY,
    font,
    color: COLOR_MID,
  })

  // Move y past the signature blocks
  pm.y = clientSigLineY - 45

  // ── 13. Footer + Verification Code ─────────────────────────

  pm.ensureSpace(data.verificationCode ? 55 : 30)
  pm.drawLine({ color: COLOR_LIGHT })
  pm.moveDown(12)

  // Verification code (for paper-sign authentication)
  if (data.verificationCode) {
    // Prominent verification code box
    const codeBoxWidth = 260
    const codeBoxHeight = 24
    const codeBoxX = (PAGE_WIDTH - codeBoxWidth) / 2

    pm.drawRect(codeBoxX, pm.y - 4, codeBoxWidth, codeBoxHeight, COLOR_BG)

    const codeLabel = 'VERIFICATION CODE: '
    const codeValue = data.verificationCode
    const labelWidth = fontBold.widthOfTextAtSize(codeLabel, FONT_SMALL)
    const valueWidth = fontBold.widthOfTextAtSize(codeValue, FONT_HEADING)
    const totalCodeWidth = labelWidth + valueWidth
    const codeStartX = (PAGE_WIDTH - totalCodeWidth) / 2

    pm.drawText(codeLabel, {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
      x: codeStartX,
    })
    pm.drawText(codeValue, {
      font: fontBold,
      size: FONT_HEADING,
      color: COLOR_PRIMARY,
      x: codeStartX + labelWidth,
    })
    pm.moveDown(codeBoxHeight + 4)

    pm.drawTextCentered('Enter this code when uploading the signed copy for verification', {
      size: 6.5,
      color: COLOR_LIGHT,
    })
    pm.moveDown(10)
  }

  const footerText = `Generated by NorvaOS \u2014 ${sanitize(data.firmName)}`
  const footerWidth = font.widthOfTextAtSize(footerText, FONT_SMALL)
  pm.drawText(footerText, {
    size: FONT_SMALL,
    color: COLOR_LIGHT,
    x: (PAGE_WIDTH - footerWidth) / 2,
  })

  // Finalize (page numbers)
  pm.finalize()

  // Serialize
  return doc.save()
}
