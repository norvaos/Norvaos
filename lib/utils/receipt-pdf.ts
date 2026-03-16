/**
 * Payment Receipt PDF Generator
 * Generates a professional receipt PDF for payments received against an invoice.
 * Reuses font loading and helpers from invoice-pdf.ts.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// Types
export interface ReceiptPdfPayment {
  payment_date: string
  payment_method: string
  amount: number // cents
  reference: string | null
}

export interface ReceiptPdfData {
  firmName: string
  firmAddress?: string | null
  invoiceNumber: string
  billToName: string
  payments: ReceiptPdfPayment[]
  totalPaid: number // cents
  invoiceTotal: number // cents
  currency?: string
}

// Constants
const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const COLOR_PRIMARY = rgb(0.15, 0.35, 0.65)
const COLOR_DARK = rgb(0.2, 0.2, 0.2)
const COLOR_MID = rgb(0.45, 0.45, 0.45)
const COLOR_LIGHT = rgb(0.7, 0.7, 0.7)
const COLOR_BG = rgb(0.96, 0.96, 0.96)

// Font loading (shared cache with invoice-pdf)
let cachedRegular: Buffer | null = null
let cachedBold: Buffer | null = null

function loadFont(filename: string): Buffer {
  return readFileSync(join(process.cwd(), 'lib', 'fonts', filename))
}

function getRegular(): Buffer {
  if (!cachedRegular) cachedRegular = loadFont('Inter-Regular.ttf')
  return cachedRegular
}

function getBold(): Buffer {
  if (!cachedBold) cachedBold = loadFont('Inter-Bold.ttf')
  return cachedBold
}

function sanitize(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

function formatCurrency(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100)
}

function formatDate(isoDate: string): string {
  try {
    const parts = isoDate.split('T')[0].split('-')
    if (parts.length < 3) return isoDate
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return isoDate
  }
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', credit_card: 'Credit Card', cheque: 'Cheque',
    cash: 'Cash', trust_account: 'Trust Account', other: 'Other',
  }
  return labels[method] || method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ')
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  const currency = data.currency ?? 'CAD'
  const fmt = (cents: number) => formatCurrency(cents, currency)

  const doc = await PDFDocument.create()
  doc.setTitle(`Receipt for Invoice ${sanitize(data.invoiceNumber)}`)
  doc.setCreator('NorvaOS')
  doc.registerFontkit(fontkit)

  const font = await doc.embedFont(getRegular())
  const fontBold = await doc.embedFont(getBold())
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  let y = PAGE_HEIGHT - 50

  // Firm header
  page.drawText(sanitize(data.firmName), { x: MARGIN_LEFT, y, size: 18, font: fontBold, color: COLOR_PRIMARY })
  y -= 22

  if (data.firmAddress) {
    for (const line of sanitize(data.firmAddress).split('\n')) {
      page.drawText(line, { x: MARGIN_LEFT, y, size: 9, font, color: COLOR_MID })
      y -= 14
    }
  }

  // "PAYMENT RECEIPT" right-aligned
  const receiptLabel = 'PAYMENT RECEIPT'
  const labelWidth = fontBold.widthOfTextAtSize(receiptLabel, 24)
  page.drawText(receiptLabel, { x: PAGE_WIDTH - MARGIN_RIGHT - labelWidth, y: PAGE_HEIGHT - 50, size: 24, font: fontBold, color: COLOR_PRIMARY })

  y -= 15
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.5, color: COLOR_LIGHT })
  y -= 25

  // Receipt details
  const details: [string, string][] = [
    ['Invoice Number', sanitize(data.invoiceNumber)],
    ['Client', sanitize(data.billToName)],
    ['Date', formatDate(new Date().toISOString().split('T')[0])],
  ]

  for (const [label, value] of details) {
    page.drawText(label, { x: MARGIN_LEFT, y, size: 7.5, font: fontBold, color: COLOR_MID })
    page.drawText(value, { x: MARGIN_LEFT + 110, y, size: 9, font, color: COLOR_DARK })
    y -= 18
  }

  y -= 15

  // Payments table header
  const contentWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
  page.drawRectangle({ x: MARGIN_LEFT, y: y - 3, width: contentWidth, height: 20, color: COLOR_BG })
  page.drawText('Date', { x: MARGIN_LEFT + 4, y, size: 7.5, font: fontBold, color: COLOR_MID })
  page.drawText('Method', { x: MARGIN_LEFT + 130, y, size: 7.5, font: fontBold, color: COLOR_MID })
  page.drawText('Reference', { x: MARGIN_LEFT + 260, y, size: 7.5, font: fontBold, color: COLOR_MID })
  const amtHeader = 'Amount'
  const amtHW = fontBold.widthOfTextAtSize(amtHeader, 7.5)
  page.drawText(amtHeader, { x: PAGE_WIDTH - MARGIN_RIGHT - amtHW, y, size: 7.5, font: fontBold, color: COLOR_MID })
  y -= 24

  // Payment rows
  for (const pmt of data.payments) {
    page.drawText(formatDate(pmt.payment_date), { x: MARGIN_LEFT + 4, y, size: 9, font, color: COLOR_DARK })
    page.drawText(paymentMethodLabel(pmt.payment_method), { x: MARGIN_LEFT + 130, y, size: 9, font, color: COLOR_DARK })
    page.drawText(sanitize(pmt.reference) || '—', { x: MARGIN_LEFT + 260, y, size: 9, font, color: COLOR_DARK })
    const amtStr = fmt(pmt.amount)
    const amtW = font.widthOfTextAtSize(amtStr, 9)
    page.drawText(amtStr, { x: PAGE_WIDTH - MARGIN_RIGHT - amtW, y, size: 9, font, color: COLOR_DARK })
    y -= 18
  }

  y -= 10
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 1, color: COLOR_DARK })
  y -= 20

  // Totals
  const totalX = PAGE_WIDTH - MARGIN_RIGHT - 180
  const valueX = PAGE_WIDTH - MARGIN_RIGHT

  const drawRow = (label: string, value: string, bold = false) => {
    const f = bold ? fontBold : font
    const size = bold ? 11 : 9
    page.drawText(label, { x: totalX, y, size, font: f, color: COLOR_DARK })
    const vw = f.widthOfTextAtSize(value, size)
    page.drawText(value, { x: valueX - vw, y, size, font: f, color: COLOR_DARK })
    y -= 18
  }

  drawRow('Invoice Total', fmt(data.invoiceTotal))
  drawRow('Total Paid', fmt(data.totalPaid), true)

  const remaining = data.invoiceTotal - data.totalPaid
  if (remaining > 0) {
    drawRow('Remaining Balance', fmt(remaining))
  } else {
    y -= 5
    page.drawRectangle({ x: totalX - 5, y: y - 4, width: 185, height: 24, color: COLOR_PRIMARY })
    const paidLabel = 'PAID IN FULL'
    const plw = fontBold.widthOfTextAtSize(paidLabel, 11)
    page.drawText(paidLabel, { x: totalX + (175 - plw) / 2, y, size: 11, font: fontBold, color: rgb(1, 1, 1) })
    y -= 30
  }

  // Footer
  y -= 20
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.5, color: COLOR_LIGHT })
  y -= 15
  const footer = `Generated by NorvaOS — ${sanitize(data.firmName)}`
  const fw = font.widthOfTextAtSize(footer, 7.5)
  page.drawText(footer, { x: (PAGE_WIDTH - fw) / 2, y, size: 7.5, font, color: COLOR_LIGHT })

  // Page number
  const pn = 'Page 1'
  const pnw = font.widthOfTextAtSize(pn, 7.5)
  page.drawText(pn, { x: PAGE_WIDTH - MARGIN_RIGHT - pnw, y: 35, size: 7.5, font, color: COLOR_LIGHT })

  return doc.save()
}
