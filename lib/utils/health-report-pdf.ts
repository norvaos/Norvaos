/**
 * Matter Health Report PDF Generator
 *
 * Generates a client-ready PDF summary of all 5 Vitality Header zones.
 *
 * Guardrails:
 * - All free-text fields sanitized: control chars stripped, full Unicode via Inter font
 * - PII Guard: sensitive fields (UCI, passport) are masked with bullet characters
 * - Risk badges hidden: client sees "Status" and "Next Steps" instead
 * - Readiness Ring drawn as SVG arc via pdf-lib
 * - Pagination: auto-adds new pages when content overflows
 * - A4 page format (595x842pt), Inter Regular / Inter Bold fonts
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

export interface HealthReportData {
  // Matter metadata
  matterTitle: string
  matterNumber: string | null
  firmName: string
  generatedAt: string // ISO timestamp

  // Readiness zone
  readiness: {
    overallScore: number
    completionPct: number
    intakeStatus: string | null
    domains: { label: string; pct: number }[]
  } | null

  // Relationships zone (PII-masked)
  relationships: {
    primaryContact: {
      fullName: string
      role: string
      email: string | null
      phone: string | null
      nationality: string | null
      passportExpiring: boolean
    } | null
    teamMembers: { name: string }[]
  } | null

  // Stages zone
  stages: {
    currentStageName: string | null
    timeInStage: string
    pipelineProgress: number
    stages: { name: string; isCurrent: boolean; isCompleted: boolean }[]
  } | null

  // Financials zone
  financials: {
    trustBalanceCents: number
    totalBilledCents: number
    totalPaidCents: number
    outstandingCents: number
    financialHealth: 'healthy' | 'warning' | 'critical'
  } | null

  // Documents zone
  documents: {
    totalSlots: number
    completionPct: number
    uploaded: number
    accepted: number
    pendingReview: number
    empty: number
    mandatorySlots: number
  } | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 60
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

// Colours
const COLOR_BLACK = rgb(0, 0, 0)
const COLOR_DARK = rgb(0.2, 0.2, 0.2)
const COLOR_MID = rgb(0.45, 0.45, 0.45)
const COLOR_LIGHT = rgb(0.7, 0.7, 0.7)
const COLOR_BG = rgb(0.96, 0.96, 0.96)
const COLOR_PRIMARY = rgb(0.15, 0.35, 0.65)
const COLOR_GREEN = rgb(0.13, 0.77, 0.37)
const COLOR_AMBER = rgb(0.96, 0.62, 0.04)
const COLOR_RED = rgb(0.94, 0.27, 0.27)

// Font sizes
const FONT_TITLE = 18
const FONT_HEADING = 12
const FONT_SUBHEADING = 10
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

function sanitize(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
}

/** Map internal risk/health to client-facing status label */
function statusLabel(health: string): string {
  switch (health) {
    case 'healthy':
    case 'low':
      return 'On Track'
    case 'warning':
    case 'medium':
      return 'Needs Attention'
    case 'critical':
    case 'high':
      return 'Action Required'
    default:
      return 'Under Review'
  }
}

function statusColour(health: string) {
  switch (health) {
    case 'healthy':
    case 'low':
      return COLOR_GREEN
    case 'warning':
    case 'medium':
      return COLOR_AMBER
    case 'critical':
    case 'high':
      return COLOR_RED
    default:
      return COLOR_MID
  }
}

function formatReportDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Page Manager ─────────────────────────────────────────────────────────────

class PdfPageManager {
  private doc: PDFDocument
  private currentPage: PDFPage
  private yPos: number
  private font: PDFFont
  private fontBold: PDFFont
  private pageCount = 1

  constructor(doc: PDFDocument, page: PDFPage, font: PDFFont, fontBold: PDFFont) {
    this.doc = doc
    this.currentPage = page
    this.font = font
    this.fontBold = fontBold
    this.yPos = PAGE_HEIGHT - MARGIN_TOP
  }

  get y(): number { return this.yPos }
  set y(val: number) { this.yPos = val }
  get page(): PDFPage { return this.currentPage }

  ensureSpace(neededPoints: number): void {
    if (this.yPos - neededPoints < MARGIN_BOTTOM) {
      this.addPage()
    }
  }

  addPage(): void {
    this.drawPageNumber()
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

  /** Finalize: draw page number on last page */
  finalize(): void {
    this.drawPageNumber()
  }
}

// ── Readiness Ring Drawing ───────────────────────────────────────────────────

function drawReadinessRing(
  page: PDFPage,
  cx: number,
  cy: number,
  radius: number,
  score: number,
  font: PDFFont,
  fontBold: PDFFont,
) {
  const ringWidth = 4

  // Background ring (light grey)
  page.drawCircle({
    x: cx,
    y: cy,
    size: radius,
    borderWidth: ringWidth,
    borderColor: rgb(0.9, 0.9, 0.9),
    color: rgb(1, 1, 1),
  })

  // Score arc  -  draw as a thick arc using small line segments
  const arcColour = score >= 85 ? COLOR_GREEN : score >= 60 ? COLOR_AMBER : COLOR_RED
  const sweepAngle = (score / 100) * 360
  const steps = Math.max(2, Math.ceil(sweepAngle / 3))
  const startAngle = 90 // Start from top (12 o'clock)

  for (let i = 0; i < steps; i++) {
    const a1 = startAngle - (i / steps) * sweepAngle
    const a2 = startAngle - ((i + 1) / steps) * sweepAngle
    const r1 = (a1 * Math.PI) / 180
    const r2 = (a2 * Math.PI) / 180
    const x1 = cx + radius * Math.cos(r1)
    const y1 = cy + radius * Math.sin(r1)
    const x2 = cx + radius * Math.cos(r2)
    const y2 = cy + radius * Math.sin(r2)

    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: ringWidth + 1,
      color: arcColour,
    })
  }

  // Score text in centre
  const scoreText = `${score}`
  const scoreWidth = fontBold.widthOfTextAtSize(scoreText, 14)
  page.drawText(scoreText, {
    x: cx - scoreWidth / 2,
    y: cy - 5,
    size: 14,
    font: fontBold,
    color: COLOR_DARK,
  })

  // "/ 100" below
  const subText = '/ 100'
  const subWidth = font.widthOfTextAtSize(subText, 7)
  page.drawText(subText, {
    x: cx - subWidth / 2,
    y: cy - 16,
    size: 7,
    font,
    color: COLOR_MID,
  })
}

// ── Section Drawing Helpers ─────────────────────────────────────────────────

function drawSectionHeader(pm: PdfPageManager, title: string, fontBold: PDFFont): void {
  pm.ensureSpace(30)

  // Blue accent line
  pm.page.drawRectangle({
    x: MARGIN_LEFT,
    y: pm.y - 2,
    width: 3,
    height: 14,
    color: COLOR_PRIMARY,
  })

  pm.drawText(title, { font: fontBold, size: FONT_HEADING, color: COLOR_PRIMARY, x: MARGIN_LEFT + 10 })
  pm.y -= 20
}

function drawKeyValue(
  pm: PdfPageManager,
  label: string,
  value: string,
  font: PDFFont,
  fontBold: PDFFont,
  opts: { labelWidth?: number } = {},
): void {
  const labelWidth = opts.labelWidth ?? 140
  pm.ensureSpace(LINE_HEIGHT + 2)
  pm.drawText(label, { font: fontBold, size: FONT_BODY, color: COLOR_MID })
  pm.drawText(value, { font, size: FONT_BODY, color: COLOR_DARK, x: MARGIN_LEFT + labelWidth })
  pm.y -= LINE_HEIGHT
}

function drawHorizontalRule(pm: PdfPageManager): void {
  pm.ensureSpace(10)
  pm.page.drawLine({
    start: { x: MARGIN_LEFT, y: pm.y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: pm.y },
    thickness: 0.5,
    color: COLOR_LIGHT,
  })
  pm.y -= 10
}

function drawProgressBar(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  pct: number,
  color: ReturnType<typeof rgb>,
): void {
  // Background
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLOR_BG,
  })
  // Fill
  if (pct > 0) {
    page.drawRectangle({
      x,
      y,
      width: Math.min(width, (pct / 100) * width),
      height,
      color,
    })
  }
}

// ── Main Generator ──────────────────────────────────────────────────────────

export async function generateHealthReportPdf(data: HealthReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const font = await doc.embedFont(getRegularFontBytes())
  const fontBold = await doc.embedFont(getBoldFontBytes())

  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const pm = new PdfPageManager(doc, firstPage, font, fontBold)

  // ── Header ──────────────────────────────────────────────────────────────
  pm.drawText(sanitize(data.firmName), { font: fontBold, size: FONT_TITLE, color: COLOR_PRIMARY })
  pm.y -= 24

  pm.drawText('Matter Health Report', { font: fontBold, size: 14, color: COLOR_DARK })
  pm.y -= 18

  // Matter title & number
  const titleLine = sanitize(data.matterTitle) +
    (data.matterNumber ? `  (${sanitize(data.matterNumber)})` : '')
  pm.drawText(titleLine, { font: fontBold, size: FONT_SUBHEADING, color: COLOR_DARK })
  pm.y -= LINE_HEIGHT

  pm.drawText(`Generated: ${formatReportDate(data.generatedAt)}`, {
    font,
    size: FONT_SMALL,
    color: COLOR_MID,
  })
  pm.y -= 20

  drawHorizontalRule(pm)

  // ── 1. Readiness Zone ─────────────────────────────────────────────────
  if (data.readiness) {
    drawSectionHeader(pm, 'Status Overview', fontBold)

    // Readiness ring  -  draw to the left, text to the right
    const ringCx = MARGIN_LEFT + 30
    const ringCy = pm.y - 30
    drawReadinessRing(pm.page, ringCx, ringCy, 25, data.readiness.overallScore, font, fontBold)

    // Status label (instead of risk level)
    const scoreStatus = data.readiness.overallScore >= 85
      ? 'On Track'
      : data.readiness.overallScore >= 60
        ? 'Needs Attention'
        : 'Action Required'

    const statusX = MARGIN_LEFT + 80
    pm.drawText('Status:', { font: fontBold, size: FONT_BODY, color: COLOR_MID, x: statusX })
    pm.drawText(scoreStatus, {
      font: fontBold,
      size: FONT_BODY,
      color: statusColour(data.readiness.overallScore >= 85 ? 'healthy' : data.readiness.overallScore >= 60 ? 'warning' : 'critical'),
      x: statusX + 45,
    })
    pm.y -= LINE_HEIGHT

    pm.drawText('Completion:', { font: fontBold, size: FONT_BODY, color: COLOR_MID, x: statusX })
    pm.drawText(`${data.readiness.completionPct}%`, { font, size: FONT_BODY, color: COLOR_DARK, x: statusX + 65 })
    pm.y -= LINE_HEIGHT

    if (data.readiness.intakeStatus) {
      pm.drawText('Intake:', { font: fontBold, size: FONT_BODY, color: COLOR_MID, x: statusX })
      pm.drawText(sanitize(data.readiness.intakeStatus), { font, size: FONT_BODY, color: COLOR_DARK, x: statusX + 45 })
      pm.y -= LINE_HEIGHT
    }

    // Move past the ring area
    pm.y = Math.min(pm.y, ringCy - 35)

    // Domain breakdown
    if (data.readiness.domains.length > 0) {
      pm.y -= 6
      pm.drawText('Domain Breakdown:', { font: fontBold, size: FONT_BODY, color: COLOR_MID })
      pm.y -= LINE_HEIGHT + 2

      for (const domain of data.readiness.domains) {
        pm.ensureSpace(LINE_HEIGHT + 4)
        const label = truncateText(sanitize(domain.label), font, FONT_BODY, 120)
        pm.drawText(label, { font, size: FONT_BODY, color: COLOR_DARK })

        // Progress bar
        const barX = MARGIN_LEFT + 130
        const barWidth = 200
        const barColour = domain.pct >= 85 ? COLOR_GREEN : domain.pct >= 60 ? COLOR_AMBER : COLOR_RED
        drawProgressBar(pm.page, barX, pm.y - 1, barWidth, 8, domain.pct, barColour)

        // Percentage text
        pm.drawText(`${domain.pct}%`, {
          font,
          size: FONT_SMALL,
          color: COLOR_MID,
          x: barX + barWidth + 8,
        })

        pm.y -= LINE_HEIGHT
      }
    }

    pm.y -= 8
    drawHorizontalRule(pm)
  }

  // ── 2. Relationships Zone ─────────────────────────────────────────────
  if (data.relationships) {
    drawSectionHeader(pm, 'Key Contacts', fontBold)

    if (data.relationships.primaryContact) {
      const pc = data.relationships.primaryContact
      drawKeyValue(pm, 'Primary Contact:', sanitize(pc.fullName), font, fontBold)
      drawKeyValue(pm, 'Role:', sanitize(pc.role), font, fontBold)
      if (pc.email) drawKeyValue(pm, 'Email:', sanitize(pc.email), font, fontBold)
      if (pc.phone) drawKeyValue(pm, 'Phone:', sanitize(pc.phone), font, fontBold)
      if (pc.nationality) drawKeyValue(pm, 'Nationality:', sanitize(pc.nationality), font, fontBold)

      if (pc.passportExpiring) {
        pm.ensureSpace(LINE_HEIGHT + 2)
        pm.drawText('Note: Travel document expiring within 90 days  -  renewal recommended', {
          font: fontBold,
          size: FONT_BODY,
          color: COLOR_AMBER,
        })
        pm.y -= LINE_HEIGHT
      }
    } else {
      pm.drawText('No primary contact assigned.', { font, size: FONT_BODY, color: COLOR_MID })
      pm.y -= LINE_HEIGHT
    }

    if (data.relationships.teamMembers.length > 0) {
      pm.y -= 4
      drawKeyValue(
        pm,
        'Team:',
        data.relationships.teamMembers.map(t => sanitize(t.name)).join(', '),
        font,
        fontBold,
      )
    }

    pm.y -= 8
    drawHorizontalRule(pm)
  }

  // ── 3. Stages Zone ────────────────────────────────────────────────────
  if (data.stages) {
    drawSectionHeader(pm, 'Pipeline Progress', fontBold)

    drawKeyValue(pm, 'Current Stage:', sanitize(data.stages.currentStageName ?? 'None'), font, fontBold)
    drawKeyValue(pm, 'Time in Stage:', data.stages.timeInStage, font, fontBold)
    drawKeyValue(pm, 'Overall Progress:', `${data.stages.pipelineProgress}%`, font, fontBold)

    // Progress bar for pipeline
    pm.ensureSpace(16)
    const barY = pm.y
    drawProgressBar(pm.page, MARGIN_LEFT, barY, CONTENT_WIDTH, 8, data.stages.pipelineProgress, COLOR_PRIMARY)
    pm.y -= 16

    // Stage list
    if (data.stages.stages.length > 0) {
      pm.y -= 4
      pm.drawText('Stages:', { font: fontBold, size: FONT_BODY, color: COLOR_MID })
      pm.y -= LINE_HEIGHT

      for (const stage of data.stages.stages) {
        pm.ensureSpace(LINE_HEIGHT)
        const marker = stage.isCompleted ? '[Done]' : stage.isCurrent ? '[Current]' : '[ ]'
        const stageColour = stage.isCompleted ? COLOR_GREEN : stage.isCurrent ? COLOR_PRIMARY : COLOR_MID
        pm.drawText(`${marker}  ${sanitize(stage.name)}`, {
          font: stage.isCurrent ? fontBold : font,
          size: FONT_BODY,
          color: stageColour,
        })
        pm.y -= LINE_HEIGHT
      }
    }

    pm.y -= 8
    drawHorizontalRule(pm)
  }

  // ── 4. Financials Zone ────────────────────────────────────────────────
  if (data.financials) {
    drawSectionHeader(pm, 'Financial Summary', fontBold)

    // Status label instead of financialHealth
    const finStatus = statusLabel(data.financials.financialHealth)
    const finColour = statusColour(data.financials.financialHealth)

    drawKeyValue(pm, 'Status:', finStatus, font, fontBold)
    pm.page.drawRectangle({
      x: MARGIN_LEFT + 140 + font.widthOfTextAtSize(finStatus, FONT_BODY) + 6,
      y: pm.y + LINE_HEIGHT - 1,
      width: 6,
      height: 6,
      color: finColour,
    })

    drawKeyValue(pm, 'Trust Balance:', formatCurrency(data.financials.trustBalanceCents), font, fontBold)
    drawKeyValue(pm, 'Total Billed:', formatCurrency(data.financials.totalBilledCents), font, fontBold)
    drawKeyValue(pm, 'Total Paid:', formatCurrency(data.financials.totalPaidCents), font, fontBold)
    drawKeyValue(pm, 'Outstanding:', formatCurrency(data.financials.outstandingCents), font, fontBold)

    pm.y -= 8
    drawHorizontalRule(pm)
  }

  // ── 5. Documents Zone ─────────────────────────────────────────────────
  if (data.documents) {
    drawSectionHeader(pm, 'Document Status', fontBold)

    drawKeyValue(pm, 'Completion:', `${data.documents.completionPct}%`, font, fontBold)

    // Progress bar
    pm.ensureSpace(16)
    const docBarColour = data.documents.completionPct >= 80 ? COLOR_GREEN
      : data.documents.completionPct >= 50 ? COLOR_AMBER : COLOR_RED
    drawProgressBar(pm.page, MARGIN_LEFT + 140, pm.y + LINE_HEIGHT - 2, 200, 8, data.documents.completionPct, docBarColour)

    drawKeyValue(pm, 'Total Slots:', `${data.documents.totalSlots}`, font, fontBold)
    drawKeyValue(pm, 'Mandatory:', `${data.documents.mandatorySlots}`, font, fontBold)
    drawKeyValue(pm, 'Uploaded:', `${data.documents.uploaded}`, font, fontBold)
    drawKeyValue(pm, 'Accepted:', `${data.documents.accepted}`, font, fontBold)
    drawKeyValue(pm, 'Pending Review:', `${data.documents.pendingReview}`, font, fontBold)
    drawKeyValue(pm, 'Missing:', `${data.documents.empty}`, font, fontBold)

    // Next Steps for documents
    if (data.documents.empty > 0) {
      pm.y -= 4
      pm.ensureSpace(LINE_HEIGHT + 4)
      pm.drawText(`Next Steps: ${data.documents.empty} document(s) still required for submission.`, {
        font: fontBold,
        size: FONT_BODY,
        color: COLOR_AMBER,
      })
      pm.y -= LINE_HEIGHT
    }

    pm.y -= 8
  }

  // ── Footer ────────────────────────────────────────────────────────────
  pm.ensureSpace(40)
  drawHorizontalRule(pm)
  pm.drawText(
    'This report is a summary of matter status at the time of generation. It does not constitute legal advice.',
    { font, size: FONT_SMALL, color: COLOR_LIGHT },
  )
  pm.y -= 10
  pm.drawText(
    `Confidential  -  ${sanitize(data.firmName)}`,
    { font: fontBold, size: FONT_SMALL, color: COLOR_LIGHT },
  )

  pm.finalize()

  return doc.save()
}
