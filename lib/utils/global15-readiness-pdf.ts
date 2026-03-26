/**
 * Global 15 Readiness Report PDF  -  Directive 29.1
 *
 * Generates a 1-page PDF for Managing Partners showing:
 *   - Firm migration summary (matter counts, document counts)
 *   - Sentinel Security Score (4-layer security posture)
 *   - Global 15 language availability grid
 *
 * Uses pdf-lib with Inter font (same pattern as health-report-pdf.ts).
 * A4 format, Norva Signature brand colours.
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

export interface Global15ReadinessData {
  /** Firm name */
  firmName: string
  /** Managing Partner name */
  partnerName: string
  /** Generated timestamp */
  generatedAt: string

  /** Migration stats */
  migration: {
    totalMatters: number
    activeMatters: number
    closedMatters: number
    totalContacts: number
    totalDocuments: number
    migratedFrom: string | null
  }

  /** Sentinel Security Score */
  sentinel: {
    overallScore: number // 0-100
    layers: {
      authentication: number
      authorisation: number
      tenantIsolation: number
      dataIntegrity: number
    }
    recentEvents: number
    criticalEvents: number
  }

  /** User / seat stats */
  seats: {
    totalUsers: number
    activeUsers: number
    planName: string
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_LEFT = 45
const MARGIN_RIGHT = 45
const MARGIN_TOP = 45
const MARGIN_BOTTOM = 45
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

// Norva Signature colours
const COLOR_PRIMARY = rgb(0.29, 0.176, 0.541)   // #4a2d8a
const COLOR_ACCENT = rgb(0.831, 0.659, 0.263)    // #d4a843
const COLOR_DARK = rgb(0.102, 0.063, 0.208)      // #1a1035
const COLOR_WHITE = rgb(1, 1, 1)
const COLOR_BLACK = rgb(0, 0, 0)
const COLOR_MID = rgb(0.4, 0.4, 0.4)
const COLOR_LIGHT_BG = rgb(0.965, 0.961, 0.976)  // light indigo bg
const COLOR_GREEN = rgb(0.13, 0.77, 0.37)
const COLOR_AMBER = rgb(0.96, 0.62, 0.04)
const COLOR_RED = rgb(0.94, 0.27, 0.27)

// Font sizes
const FONT_TITLE = 20
const FONT_HEADING = 12
const FONT_SUBHEADING = 10
const FONT_BODY = 9
const FONT_SMALL = 7.5
const LINE_HEIGHT = 14

// Global 15 language grid
const GLOBAL_15 = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'zh', name: 'Mandarin', native: '中文' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
  { code: 'fa', name: 'Farsi', native: 'فارسی' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
]

// ── Font Loading ─────────────────────────────────────────────────────────────

let cachedRegular: Buffer | null = null
let cachedBold: Buffer | null = null

function loadFontBytes(filename: string): Buffer {
  return readFileSync(join(process.cwd(), 'lib', 'fonts', filename))
}

function getRegularFont(): Buffer {
  if (!cachedRegular) cachedRegular = loadFontBytes('Inter-Regular.ttf')
  return cachedRegular
}

function getBoldFont(): Buffer {
  if (!cachedBold) cachedBold = loadFontBytes('Inter-Bold.ttf')
  return cachedBold
}

function sanitize(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return COLOR_GREEN
  if (score >= 60) return COLOR_AMBER
  return COLOR_RED
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color: typeof COLOR_PRIMARY) {
  page.drawRectangle({ x, y, width: w, height: h, color })
}

// ── PDF Generator ────────────────────────────────────────────────────────────

export async function generateGlobal15ReadinessPdf(data: Global15ReadinessData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const fontRegular = await doc.embedFont(getRegularFont())
  const fontBold = await doc.embedFont(getBoldFont())

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_TOP

  // ── Header Banner ─────────────────────────────────────────────────────
  drawRect(page, 0, y - 10, PAGE_WIDTH, 60, COLOR_PRIMARY)

  page.drawText('NorvaOS', {
    x: MARGIN_LEFT,
    y: y + 12,
    size: 22,
    font: fontBold,
    color: COLOR_WHITE,
  })

  page.drawText('Global 15 Readiness Report', {
    x: MARGIN_LEFT,
    y: y - 2,
    size: 11,
    font: fontRegular,
    color: COLOR_ACCENT,
  })

  // Right-aligned firm name
  const firmNameWidth = fontBold.widthOfTextAtSize(sanitize(data.firmName), 11)
  page.drawText(sanitize(data.firmName), {
    x: PAGE_WIDTH - MARGIN_RIGHT - firmNameWidth,
    y: y + 12,
    size: 11,
    font: fontBold,
    color: COLOR_WHITE,
  })

  const dateStr = new Date(data.generatedAt).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const dateWidth = fontRegular.widthOfTextAtSize(dateStr, 8)
  page.drawText(dateStr, {
    x: PAGE_WIDTH - MARGIN_RIGHT - dateWidth,
    y: y - 2,
    size: 8,
    font: fontRegular,
    color: rgb(0.8, 0.8, 0.9),
  })

  y -= 80

  // ── Section 1: Migration Summary ──────────────────────────────────────
  page.drawText('MIGRATION SUMMARY', {
    x: MARGIN_LEFT,
    y,
    size: FONT_HEADING,
    font: fontBold,
    color: COLOR_PRIMARY,
  })
  y -= 5

  // Divider line
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 1,
    color: COLOR_ACCENT,
  })
  y -= 18

  const preparedFor = `Prepared for ${sanitize(data.partnerName)}, Managing Partner`
  page.drawText(preparedFor, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fontRegular, color: COLOR_MID })
  y -= 20

  // Stats grid  -  3 columns
  const colW = CONTENT_WIDTH / 3
  const statsRow = [
    { label: 'Total Matters', value: String(data.migration.totalMatters) },
    { label: 'Active Matters', value: String(data.migration.activeMatters) },
    { label: 'Total Contacts', value: String(data.migration.totalContacts) },
  ]

  for (let i = 0; i < statsRow.length; i++) {
    const x = MARGIN_LEFT + i * colW
    drawRect(page, x + 2, y - 28, colW - 8, 38, COLOR_LIGHT_BG)
    page.drawText(statsRow[i].value, { x: x + 10, y: y - 6, size: 16, font: fontBold, color: COLOR_DARK })
    page.drawText(statsRow[i].label, { x: x + 10, y: y - 22, size: FONT_SMALL, font: fontRegular, color: COLOR_MID })
  }
  y -= 50

  const statsRow2 = [
    { label: 'Documents Migrated', value: String(data.migration.totalDocuments) },
    { label: 'Closed Matters', value: String(data.migration.closedMatters) },
    { label: 'Migrated From', value: sanitize(data.migration.migratedFrom) || 'Manual Entry' },
  ]

  for (let i = 0; i < statsRow2.length; i++) {
    const x = MARGIN_LEFT + i * colW
    drawRect(page, x + 2, y - 28, colW - 8, 38, COLOR_LIGHT_BG)
    page.drawText(statsRow2[i].value, { x: x + 10, y: y - 6, size: 16, font: fontBold, color: COLOR_DARK })
    page.drawText(statsRow2[i].label, { x: x + 10, y: y - 22, size: FONT_SMALL, font: fontRegular, color: COLOR_MID })
  }
  y -= 60

  // ── Section 2: Sentinel Security Score ────────────────────────────────
  page.drawText('SENTINEL SECURITY SCORE', {
    x: MARGIN_LEFT,
    y,
    size: FONT_HEADING,
    font: fontBold,
    color: COLOR_PRIMARY,
  })
  y -= 5
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 1,
    color: COLOR_ACCENT,
  })
  y -= 20

  // Overall score badge
  const overallLabel = `${data.sentinel.overallScore}/100`
  const overallColor = scoreColor(data.sentinel.overallScore)
  drawRect(page, MARGIN_LEFT, y - 22, 80, 30, overallColor)
  page.drawText(overallLabel, {
    x: MARGIN_LEFT + 12,
    y: y - 12,
    size: 16,
    font: fontBold,
    color: COLOR_WHITE,
  })

  const gradeLabel = data.sentinel.overallScore >= 90 ? 'EXCELLENT'
    : data.sentinel.overallScore >= 75 ? 'GOOD'
    : data.sentinel.overallScore >= 60 ? 'FAIR'
    : 'NEEDS ATTENTION'
  page.drawText(gradeLabel, {
    x: MARGIN_LEFT + 90,
    y: y - 8,
    size: FONT_SUBHEADING,
    font: fontBold,
    color: overallColor,
  })

  page.drawText('4-Layer Security Posture', {
    x: MARGIN_LEFT + 90,
    y: y - 20,
    size: FONT_SMALL,
    font: fontRegular,
    color: COLOR_MID,
  })
  y -= 40

  // 4 security layers as progress bars
  const layers = [
    { label: 'Authentication', score: data.sentinel.layers.authentication },
    { label: 'Authorisation', score: data.sentinel.layers.authorisation },
    { label: 'Tenant Isolation', score: data.sentinel.layers.tenantIsolation },
    { label: 'Data Integrity', score: data.sentinel.layers.dataIntegrity },
  ]

  for (const layer of layers) {
    page.drawText(layer.label, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fontRegular, color: COLOR_DARK })
    page.drawText(`${layer.score}%`, { x: MARGIN_LEFT + 120, y, size: FONT_BODY, font: fontBold, color: scoreColor(layer.score) })

    // Progress bar
    const barX = MARGIN_LEFT + 150
    const barW = CONTENT_WIDTH - 150
    drawRect(page, barX, y - 1, barW, 8, COLOR_LIGHT_BG)
    drawRect(page, barX, y - 1, barW * (layer.score / 100), 8, scoreColor(layer.score))

    y -= 16
  }
  y -= 15

  // ── Section 3: Global 15 Language Availability ────────────────────────
  page.drawText('GLOBAL 15 LANGUAGE AVAILABILITY', {
    x: MARGIN_LEFT,
    y,
    size: FONT_HEADING,
    font: fontBold,
    color: COLOR_PRIMARY,
  })
  y -= 5
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 1,
    color: COLOR_ACCENT,
  })
  y -= 16

  page.drawText(
    'Your clients can now access intake forms, retainer agreements, and portal communications in all 15 languages.',
    { x: MARGIN_LEFT, y, size: FONT_BODY, font: fontRegular, color: COLOR_MID }
  )
  y -= 18

  // Language grid: 5 columns x 3 rows
  const langColW = CONTENT_WIDTH / 5
  const langRowH = 30

  for (let i = 0; i < GLOBAL_15.length; i++) {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = MARGIN_LEFT + col * langColW
    const cellY = y - row * langRowH

    // Background cell
    drawRect(page, x + 1, cellY - 18, langColW - 4, langRowH - 4, COLOR_LIGHT_BG)

    // Checkmark
    page.drawText('✓', { x: x + 5, y: cellY - 6, size: 8, font: fontBold, color: COLOR_GREEN })

    // Language name
    page.drawText(GLOBAL_15[i].name, { x: x + 16, y: cellY - 6, size: FONT_BODY, font: fontBold, color: COLOR_DARK })

    // Code badge
    page.drawText(`[${GLOBAL_15[i].code}]`, { x: x + 16, y: cellY - 15, size: FONT_SMALL, font: fontRegular, color: COLOR_MID })
  }

  y -= 3 * langRowH + 20

  // ── Footer ────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN_LEFT, y: MARGIN_BOTTOM + 15 },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: MARGIN_BOTTOM + 15 },
    thickness: 0.5,
    color: COLOR_MID,
  })

  page.drawText(
    `Generated by NorvaOS  -  ${data.seats.activeUsers} active users on ${data.seats.planName} plan`,
    { x: MARGIN_LEFT, y: MARGIN_BOTTOM + 4, size: FONT_SMALL, font: fontRegular, color: COLOR_MID }
  )

  const confText = 'CONFIDENTIAL  -  For Managing Partner Use Only'
  const confW = fontBold.widthOfTextAtSize(confText, FONT_SMALL)
  page.drawText(confText, {
    x: PAGE_WIDTH - MARGIN_RIGHT - confW,
    y: MARGIN_BOTTOM + 4,
    size: FONT_SMALL,
    font: fontBold,
    color: COLOR_PRIMARY,
  })

  return doc.save()
}
