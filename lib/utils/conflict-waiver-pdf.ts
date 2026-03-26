/**
 * Directive 067: Conflict Waiver PDF Generator
 *
 * Generates a professional conflict-of-interest waiver document using pdf-lib.
 * Follows the same architectural patterns as retainer-pdf.ts and invoice-pdf.ts.
 *
 * Filename Convention: CONF-WAIVER-[CLIENT_NAME]-[DATE].pdf
 *
 * Dynamic Fields:
 *   - [CASE NAME] from Matter Title input
 *   - [Client Name] from Contact selection
 *   - [Firm Name] from Global Settings
 *   - [Date] generated at creation time
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
import type { SovereignBranding } from '@/lib/utils/sovereign-header'
import { drawSovereignHeader, drawSovereignFooter } from '@/lib/utils/sovereign-header'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConflictWaiverPdfData {
  firmName: string
  firmAddress?: string | null
  clientName: string
  clientEmail?: string | null
  caseName: string
  matterNumber?: string | null
  conflictDescription: string
  lawyerName?: string | null
  date: string // ISO string or formatted date
  branding?: SovereignBranding | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const MARGIN_TOP = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const LINE_HEIGHT = 16
const PARA_SPACING = 12

// ── Sanitisation ─────────────────────────────────────────────────────────────

function sanitize(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B\u200C\u200D\uFEFF]/g, '')
}

// ── Font Loading ─────────────────────────────────────────────────────────────

let interRegularBytes: Uint8Array | null = null
let interBoldBytes: Uint8Array | null = null

function loadFonts() {
  if (!interRegularBytes) {
    try {
      interRegularBytes = readFileSync(join(process.cwd(), 'public/fonts/Inter-Regular.ttf'))
    } catch {
      interRegularBytes = null
    }
  }
  if (!interBoldBytes) {
    try {
      interBoldBytes = readFileSync(join(process.cwd(), 'public/fonts/Inter-Bold.ttf'))
    } catch {
      interBoldBytes = null
    }
  }
  return { interRegularBytes, interBoldBytes }
}

// ── Word Wrapping ────────────────────────────────────────────────────────────

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }

    const words = paragraph.split(' ')
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = font.widthOfTextAtSize(sanitize(testLine), fontSize)

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines
}

// ── Draw Multi-line Text ─────────────────────────────────────────────────────

function drawParagraph(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  colour = rgb(0.15, 0.15, 0.15),
): number {
  const lines = wrapText(text, font, fontSize, maxWidth)
  let y = startY

  for (const line of lines) {
    if (y < 80) {
      // Would overflow - caller should handle pagination
      break
    }
    page.drawText(sanitize(line), { x, y, size: fontSize, font, color: colour })
    y -= LINE_HEIGHT
  }

  return y
}

// ── Main Generator ───────────────────────────────────────────────────────────

export async function generateConflictWaiverPdf(data: ConflictWaiverPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)

  const { interRegularBytes: regularBytes, interBoldBytes: boldBytes } = loadFonts()

  let fontRegular: PDFFont
  let fontBold: PDFFont

  if (regularBytes && boldBytes) {
    fontRegular = await pdf.embedFont(regularBytes, { subset: true })
    fontBold = await pdf.embedFont(boldBytes, { subset: true })
  } else {
    fontRegular = await pdf.embedFont('Helvetica' as any)
    fontBold = await pdf.embedFont('Helvetica-Bold' as any)
  }

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_TOP

  // ── Sovereign Header ──
  if (data.branding) {
    y = await drawSovereignHeader(pdf, page, data.branding, { regular: fontRegular, bold: fontBold })
  } else {
    // Simple firm header
    page.drawText(sanitize(data.firmName), {
      x: MARGIN_LEFT,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    })
    y -= 18
    if (data.firmAddress) {
      page.drawText(sanitize(data.firmAddress), {
        x: MARGIN_LEFT,
        y,
        size: 8,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      })
      y -= 14
    }
    // Divider
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.75,
      color: rgb(0.85, 0.85, 0.85),
    })
    y -= 24
  }

  // ── Title ──
  const titleText = 'CONFLICT OF INTEREST WAIVER'
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 16)
  page.drawText(titleText, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.12, 0.12, 0.12),
  })
  y -= 10

  // Subtitle
  const subtitleText = 'Informed Consent to Proceed Despite Potential Conflict'
  const subtitleWidth = fontRegular.widthOfTextAtSize(subtitleText, 9)
  page.drawText(subtitleText, {
    x: (PAGE_WIDTH - subtitleWidth) / 2,
    y,
    size: 9,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 30

  // ── Matter Details Box ──
  const boxHeight = 70
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: y - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 0.5,
  })

  const detailY = y - 16
  const labelColour = rgb(0.45, 0.45, 0.45)
  const valueColour = rgb(0.15, 0.15, 0.15)

  page.drawText('Case:', { x: MARGIN_LEFT + 12, y: detailY, size: 8, font: fontBold, color: labelColour })
  page.drawText(sanitize(data.caseName), { x: MARGIN_LEFT + 60, y: detailY, size: 9, font: fontRegular, color: valueColour })

  page.drawText('Client:', { x: MARGIN_LEFT + 12, y: detailY - 16, size: 8, font: fontBold, color: labelColour })
  page.drawText(sanitize(data.clientName), { x: MARGIN_LEFT + 60, y: detailY - 16, size: 9, font: fontRegular, color: valueColour })

  page.drawText('Date:', { x: MARGIN_LEFT + 12, y: detailY - 32, size: 8, font: fontBold, color: labelColour })
  page.drawText(sanitize(data.date), { x: MARGIN_LEFT + 60, y: detailY - 32, size: 9, font: fontRegular, color: valueColour })

  if (data.matterNumber) {
    page.drawText('File #:', { x: MARGIN_LEFT + 300, y: detailY, size: 8, font: fontBold, color: labelColour })
    page.drawText(sanitize(data.matterNumber), { x: MARGIN_LEFT + 348, y: detailY, size: 9, font: fontRegular, color: valueColour })
  }

  y = y - boxHeight - 24

  // ── Body Text ──
  const bodyParagraphs = [
    `I, ${data.clientName}, acknowledge that ${data.firmName} has disclosed to me that a potential conflict of interest may exist in connection with the above-referenced matter.`,

    'Nature of the Potential Conflict:',

    data.conflictDescription || '[Description of the potential conflict to be completed by the firm]',

    'I understand that:',

    '1. Under the Law Society Rules of Professional Conduct (Rule 3.4-1 and related provisions), a lawyer or paralegal must not act or continue to act for a client where there is a conflict of interest, unless the affected clients provide informed consent.',

    '2. The potential conflict described above has been fully explained to me in plain language. I understand the nature of the conflict, how it could affect my interests, and the possible risks involved.',

    '3. I have been advised that I have the right to seek independent legal advice before signing this waiver, and I have either obtained such advice or have chosen to proceed without it.',

    '4. Despite the existence of this potential conflict, I voluntarily and with full knowledge consent to the continued representation by the firm in this matter.',

    '5. I understand that I may revoke this consent at any time by providing written notice to the firm. If I revoke consent, the firm may need to withdraw from representation.',

    'This waiver applies only to the specific conflict described above and does not constitute a general waiver of future conflicts.',
  ]

  for (const para of bodyParagraphs) {
    const isBold = para.startsWith('Nature of') || para.startsWith('I understand')
    const font = isBold ? fontBold : fontRegular
    const size = isBold ? 10 : 9.5
    y = drawParagraph(page, para, MARGIN_LEFT, y, font, size, CONTENT_WIDTH)
    y -= PARA_SPACING
  }

  // ── Signature Block ──
  y -= 16
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: MARGIN_LEFT + 200, y },
    thickness: 0.5,
    color: rgb(0.3, 0.3, 0.3),
  })
  y -= 14
  page.drawText('Client Signature', { x: MARGIN_LEFT, y, size: 8, font: fontRegular, color: labelColour })
  page.drawText(sanitize(data.clientName), { x: MARGIN_LEFT, y: y - 14, size: 9, font: fontBold, color: valueColour })

  // Lawyer signature block on the right
  page.drawLine({
    start: { x: MARGIN_LEFT + 300, y: y + 14 },
    end: { x: MARGIN_LEFT + 500, y: y + 14 },
    thickness: 0.5,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawText('Lawyer / Principal', { x: MARGIN_LEFT + 300, y, size: 8, font: fontRegular, color: labelColour })
  if (data.lawyerName) {
    page.drawText(sanitize(data.lawyerName), { x: MARGIN_LEFT + 300, y: y - 14, size: 9, font: fontBold, color: valueColour })
  }

  // Date lines
  y -= 36
  page.drawText('Date: ____________________', { x: MARGIN_LEFT, y, size: 9, font: fontRegular, color: valueColour })
  page.drawText('Date: ____________________', { x: MARGIN_LEFT + 300, y, size: 9, font: fontRegular, color: valueColour })

  // ── Sovereign Footer ──
  if (data.branding) {
    drawSovereignFooter(page, data.branding, { regular: fontRegular, bold: fontBold })
  } else {
    // Simple footer
    const footerText = `Generated by NorvaOS  -  ${data.firmName}  -  Confidential`
    const footerWidth = fontRegular.widthOfTextAtSize(footerText, 7)
    page.drawText(footerText, {
      x: (PAGE_WIDTH - footerWidth) / 2,
      y: 30,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    })
  }

  return pdf.save()
}

/**
 * Generate the canonical filename for a conflict waiver.
 * Convention: CONF-WAIVER-[CLIENT_NAME]-[DATE].pdf
 */
export function conflictWaiverFilename(clientName: string, date?: Date): string {
  const safeName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toUpperCase()
  const d = date ?? new Date()
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `CONF-WAIVER-${safeName}-${dateStr}.pdf`
}
