/**
 * Invoice PDF Generator
 *
 * Server-side utility for generating professional invoice PDFs using pdf-lib.
 *
 * Guardrails:
 * - All free-text fields sanitized: control chars (U+0000-U+001F except \n)
 *   and zero-width chars stripped. NO transliteration — full Unicode via
 *   embedded Inter font.
 * - Pagination: auto-adds new pages when content overflows
 * - A4 page format (595x842pt)
 * - Inter Regular / Inter Bold fonts (embedded TTF with fontkit)
 * - All monetary values stored in cents, formatted via Intl.NumberFormat
 * - Required sections: firm header, bill-to, invoice metadata, line items,
 *   subtotal, taxes (even if $0), total, payments, amount due, notes, footer
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoicePdfLineItem {
  description: string
  quantity: number
  unit_price: number // cents
  amount: number     // cents
}

export interface InvoicePdfPayment {
  payment_date: string
  payment_method: string
  amount: number // cents
  reference: string | null
}

export interface InvoicePdfData {
  // Firm / tenant info
  firmName: string
  firmAddress?: string | null

  // Invoice metadata
  invoiceNumber: string
  issueDate: string
  dueDate: string
  status: string

  // Bill-to
  billTo: {
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
  }

  // Matter reference
  matterTitle: string
  matterNumber?: string | null

  // Financial data (all in cents)
  lineItems: InvoicePdfLineItem[]
  subtotal: number
  taxAmount: number
  totalAmount: number
  amountPaid: number

  // Payments
  payments: InvoicePdfPayment[]

  // Notes
  notes?: string | null

  // Currency
  currency?: string // default: 'CAD'
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595   // A4 width in points
const PAGE_HEIGHT = 842  // A4 height in points
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 60
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

// Colours (greyscale-friendly)
const COLOR_BLACK = rgb(0, 0, 0)
const COLOR_DARK = rgb(0.2, 0.2, 0.2)
const COLOR_MID = rgb(0.45, 0.45, 0.45)
const COLOR_LIGHT = rgb(0.7, 0.7, 0.7)
const COLOR_BG = rgb(0.96, 0.96, 0.96)
const COLOR_PRIMARY = rgb(0.15, 0.35, 0.65) // Blue accent

// Font sizes
const FONT_TITLE = 18
const FONT_HEADING = 11
const FONT_BODY = 9
const FONT_SMALL = 7.5
const LINE_HEIGHT = 14

// ── Font Loading ─────────────────────────────────────────────────────────────

let cachedRegular: Buffer | null = null
let cachedBold: Buffer | null = null

function loadFontBytes(filename: string): Buffer {
  return readFileSync(join(process.cwd(), 'lib', 'fonts', filename))
}

function getRegularFontBytes(): Buffer {
  if (!cachedRegular) cachedRegular = loadFontBytes('Inter-Regular.ttf')
  return cachedRegular
}

function getBoldFontBytes(): Buffer {
  if (!cachedBold) cachedBold = loadFontBytes('Inter-Bold.ttf')
  return cachedBold
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize free-text for PDF rendering.
 * Only strips control chars and zero-width chars.
 * NO transliteration — the embedded Inter font handles full Unicode.
 */
function sanitize(text: string | null | undefined): string {
  if (!text) return ''
  return text
    // Strip control characters except newline
     
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
    // Strip zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

/** Format cents to currency string */
function formatCurrency(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Format ISO date string (YYYY-MM-DD) to readable string.
 * Parses date parts manually to avoid UTC/local timezone shift
 * that causes off-by-one errors with `new Date('2026-03-01')`.
 */
function formatDate(isoDate: string): string {
  try {
    const parts = isoDate.split('T')[0].split('-')
    if (parts.length < 3) return isoDate
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1 // 0-indexed
    const day = parseInt(parts[2], 10)
    const d = new Date(year, month, day) // local date, no timezone shift
    return d.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return isoDate
  }
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Payment method label */
function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    credit_card: 'Credit Card',
    cheque: 'Cheque',
    cash: 'Cash',
    trust_account: 'Trust Account',
    other: 'Other',
  }
  return labels[method] || capitalize(method.replace(/_/g, ' '))
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

class PdfPageManager {
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

  /** Draw a horizontal line */
  drawLine(
    opts: {
      y?: number
      color?: ReturnType<typeof rgb>
      thickness?: number
    } = {},
  ): void {
    const y = opts.y ?? this.yPos
    this.currentPage.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
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

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const currency = data.currency ?? 'CAD'
  const fmt = (cents: number) => formatCurrency(cents, currency)

  // Create document
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${sanitize(data.invoiceNumber)}`)
  doc.setSubject(`Invoice for ${sanitize(data.matterTitle)}`)
  doc.setCreator('NorvaOS')
  doc.setProducer('NorvaOS Invoice Generator')

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

  // "INVOICE" label right-aligned
  pm.y = PAGE_HEIGHT - MARGIN_TOP
  pm.drawTextRight('INVOICE', {
    font: fontBold,
    size: 24,
    color: COLOR_PRIMARY,
  })

  pm.y = PAGE_HEIGHT - MARGIN_TOP - 28
  pm.drawTextRight(`#${sanitize(data.invoiceNumber)}`, {
    font: fontBold,
    size: FONT_HEADING,
    color: COLOR_DARK,
  })

  // Reset y to below header
  pm.y = PAGE_HEIGHT - MARGIN_TOP - (data.firmAddress ? 22 + sanitize(data.firmAddress).split('\n').length * LINE_HEIGHT : 22) - 15
  pm.drawLine()
  pm.moveDown(20)

  // ── 2. Invoice Metadata + Bill-To ──────────────────────────

  const metaStartY = pm.y

  // Left column: Bill To
  pm.drawText('BILL TO', {
    font: fontBold,
    size: FONT_SMALL,
    color: COLOR_MID,
  })
  pm.moveDown(LINE_HEIGHT + 2)

  pm.drawText(sanitize(data.billTo.name), {
    font: fontBold,
    size: FONT_BODY,
    color: COLOR_BLACK,
  })
  pm.moveDown(LINE_HEIGHT)

  if (data.billTo.address) {
    const billLines = sanitize(data.billTo.address).split('\n')
    for (const line of billLines) {
      pm.drawText(line, { size: FONT_BODY, color: COLOR_DARK })
      pm.moveDown(LINE_HEIGHT)
    }
  }

  if (data.billTo.email) {
    pm.drawText(sanitize(data.billTo.email), { size: FONT_BODY, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT)
  }

  if (data.billTo.phone) {
    pm.drawText(sanitize(data.billTo.phone), { size: FONT_BODY, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT)
  }

  const leftEndY = pm.y

  // Right column: Metadata
  const rightX = PAGE_WIDTH - MARGIN_RIGHT - 180
  pm.y = metaStartY

  const metaRows: [string, string][] = [
    ['Issue Date', formatDate(data.issueDate)],
    ['Due Date', formatDate(data.dueDate)],
    ['Status', capitalize(sanitize(data.status))],
    ['Matter', sanitize(data.matterTitle)],
  ]
  if (data.matterNumber) {
    metaRows.push(['File #', sanitize(data.matterNumber)])
  }

  for (const [label, value] of metaRows) {
    pm.drawText(label, {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
      x: rightX,
    })
    pm.drawText(value, {
      size: FONT_BODY,
      color: COLOR_DARK,
      x: rightX + 65,
      maxWidth: 115,
    })
    pm.moveDown(LINE_HEIGHT + 2)
  }

  // Position below whichever column is longer
  pm.y = Math.min(leftEndY, pm.y) - 15
  pm.drawLine()
  pm.moveDown(15)

  // ── 3. Line Items Table ────────────────────────────────────

  const colDesc = MARGIN_LEFT
  const colQty = MARGIN_LEFT + CONTENT_WIDTH - 200
  const colUnit = MARGIN_LEFT + CONTENT_WIDTH - 130
  const colAmt = MARGIN_LEFT + CONTENT_WIDTH - 50

  // Table header background
  pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

  pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
  pm.drawText('Qty', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colQty })
  pm.drawText('Unit Price', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colUnit })
  // Right-align "Amount" header
  const amtHeaderWidth = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
  pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: PAGE_WIDTH - MARGIN_RIGHT - amtHeaderWidth })

  pm.moveDown(LINE_HEIGHT + 10)

  // Table rows
  for (const item of data.lineItems) {
    pm.ensureSpace(LINE_HEIGHT + 8)

    const descText = truncateText(sanitize(item.description), font, FONT_BODY, colQty - colDesc - 15)
    pm.drawText(descText, { size: FONT_BODY, x: colDesc + 4 })
    pm.drawText(String(item.quantity), { size: FONT_BODY, x: colQty })
    pm.drawText(fmt(item.unit_price), { size: FONT_BODY, x: colUnit })

    // Right-align amount
    const amtText = fmt(item.amount)
    const amtWidth = font.widthOfTextAtSize(amtText, FONT_BODY)
    pm.drawText(amtText, { size: FONT_BODY, x: PAGE_WIDTH - MARGIN_RIGHT - amtWidth })

    pm.moveDown(LINE_HEIGHT + 4)

    // Light separator
    pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
    pm.moveDown(4)
  }

  pm.moveDown(8)

  // ── 4. Totals Section ──────────────────────────────────────

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

  drawTotalRow('Subtotal', fmt(data.subtotal))
  drawTotalRow('Tax', fmt(data.taxAmount))

  pm.drawLine({
    y: pm.y + 2,
    color: COLOR_DARK,
    thickness: 1,
  })
  pm.moveDown(6)

  drawTotalRow('Total', fmt(data.totalAmount), true)

  if (data.amountPaid > 0) {
    drawTotalRow('Amount Paid', `(${fmt(data.amountPaid)})`)
  }

  const amountDue = data.totalAmount - data.amountPaid
  pm.moveDown(4)
  pm.drawRect(totalLabelX - 5, pm.y - 4, 185, LINE_HEIGHT + 10, COLOR_PRIMARY)
  const dueLabel = 'AMOUNT DUE'
  const dueValue = fmt(Math.max(amountDue, 0))
  pm.drawText(dueLabel, { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalLabelX })
  const dueValWidth = fontBold.widthOfTextAtSize(dueValue, FONT_HEADING)
  pm.drawText(dueValue, { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalValueX - dueValWidth })
  pm.moveDown(LINE_HEIGHT + 15)

  // ── 5. Payments Section ────────────────────────────────────

  if (data.payments.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('PAYMENTS RECEIVED', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 4)

    for (const pmt of data.payments) {
      pm.ensureSpace(LINE_HEIGHT + 6)
      const dateStr = formatDate(pmt.payment_date)
      const methodStr = paymentMethodLabel(pmt.payment_method)
      const refStr = pmt.reference ? ` (Ref: ${sanitize(pmt.reference)})` : ''
      pm.drawText(`${dateStr} \u2014 ${methodStr}${refStr}`, {
        size: FONT_BODY,
        color: COLOR_DARK,
      })
      pm.drawTextRight(fmt(pmt.amount), { size: FONT_BODY, color: COLOR_DARK })
      pm.moveDown(LINE_HEIGHT + 2)
    }
    pm.moveDown(10)
  }

  // ── 6. Notes ───────────────────────────────────────────────

  if (data.notes) {
    pm.ensureSpace(40)
    pm.drawText('NOTES', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 2)

    const noteLines = sanitize(data.notes).split('\n')
    for (const line of noteLines) {
      pm.ensureSpace(LINE_HEIGHT + 2)
      // Word-wrap long lines
      const words = line.split(' ')
      let currentLine = ''
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        if (font.widthOfTextAtSize(testLine, FONT_BODY) > CONTENT_WIDTH - 10) {
          pm.drawText(currentLine, { size: FONT_BODY, color: COLOR_DARK })
          pm.moveDown(LINE_HEIGHT)
          pm.ensureSpace(LINE_HEIGHT)
          currentLine = word
        } else {
          currentLine = testLine
        }
      }
      if (currentLine) {
        pm.drawText(currentLine, { size: FONT_BODY, color: COLOR_DARK })
        pm.moveDown(LINE_HEIGHT)
      }
    }
    pm.moveDown(10)
  }

  // ── 7. Footer ──────────────────────────────────────────────

  pm.ensureSpace(30)
  pm.drawLine({ color: COLOR_LIGHT })
  pm.moveDown(12)

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
