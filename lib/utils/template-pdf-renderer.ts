/**
 * Template-Driven PDF Renderer
 *
 * Walks a TemplateBody (from docgen_templates) and renders it to a professional PDF
 * using pdf-lib. Reuses PdfPageManager from retainer-pdf.ts for pagination,
 * text wrapping, and consistent styling.
 *
 * Features:
 * - Merge field resolution: {{field_key}} → actual values
 * - Conditional sections: skip sections where condition_key evaluates false
 * - Section numbering: auto-numbered headings (1. 2. 3. …)
 * - Element types: paragraph, table, signature_block, page_break
 * - Paragraph styles: body, bold, bullet, numbered, heading1-3
 * - Fee table rendering: uses actual retainer line items for template tables
 * - Signature block: side-by-side or stacked layout with date lines
 * - Verification code in footer
 */

import {
  PDFDocument,
  rgb,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type {
  TemplateBody,
  TemplateSection,
  TemplateElement,
  ParagraphElement,
  TableElement,
  SignatureBlockElement,
} from '@/lib/types/document-engine'
import {
  PdfPageManager,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARGIN_BOTTOM,
  CONTENT_WIDTH,
  COLOR_BLACK,
  COLOR_DARK,
  COLOR_MID,
  COLOR_LIGHT,
  COLOR_BG,
  COLOR_PRIMARY,
  FONT_TITLE,
  FONT_HEADING,
  FONT_BODY,
  FONT_SMALL,
  LINE_HEIGHT,
  getRegularFontBytes,
  getBoldFontBytes,
  sanitize,
  type RetainerPdfData,
} from './retainer-pdf'

// ── Public API ───────────────────────────────────────────────────────────────

export interface TemplatePdfParams {
  templateBody: TemplateBody
  fields: Record<string, string>          // resolved merge field values
  conditions: Record<string, boolean>     // evaluated condition flags
  retainerData: RetainerPdfData           // fee data for tables and verification code
}

/**
 * Render a TemplateBody to a professional PDF.
 * Returns the raw PDF bytes (Uint8Array).
 */
export async function renderTemplateToPdf(params: TemplatePdfParams): Promise<Uint8Array> {
  const { templateBody, fields, conditions, retainerData } = params
  const currency = retainerData.currency ?? 'CAD'

  // Create document
  const doc = await PDFDocument.create()
  doc.setTitle(`Retainer Agreement — ${sanitize(fields.client_name || retainerData.clientName)}`)
  doc.setCreator('NorvaOS')
  doc.setProducer('NorvaOS Document Engine')

  // Register fontkit + embed Inter fonts
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(getRegularFontBytes())
  const fontBold = await doc.embedFont(getBoldFontBytes())

  // Create first page + page manager
  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const pm = new PdfPageManager(doc, firstPage, font, fontBold)

  // ── Render Header ──────────────────────────────────────────────────────
  const firmName = fields.firm_name || retainerData.firmName || ''
  if (firmName) {
    pm.drawText(firmName, { font: fontBold, size: FONT_TITLE, color: COLOR_PRIMARY })
    pm.moveDown(22)
  }

  const firmAddress = fields.firm_address || retainerData.firmAddress || ''
  if (firmAddress) {
    const addressLines = sanitize(firmAddress).split('\n')
    for (const line of addressLines) {
      pm.drawText(line, { size: FONT_BODY, color: COLOR_MID })
      pm.moveDown(LINE_HEIGHT)
    }
  }

  if (firmName || firmAddress) {
    pm.moveDown(10)
    pm.drawLine()
    pm.moveDown(20)
  }

  // ── Walk Sections ──────────────────────────────────────────────────────
  const sortedSections = [...templateBody.sections].sort((a, b) => a.order - b.order)
  let sectionNumber = 0

  for (const section of sortedSections) {
    // Skip conditional sections where condition is false
    if (section.condition_key && conditions[section.condition_key] === false) {
      continue
    }

    // Skip sections with unresolved conditions (not in map = skip)
    if (section.condition_key && !(section.condition_key in conditions)) {
      continue
    }

    renderSection(pm, section, fields, conditions, retainerData, currency, ++sectionNumber)
  }

  // ── Verification Code Footer ───────────────────────────────────────────
  if (retainerData.verificationCode) {
    pm.ensureSpace(55)
    pm.drawLine({ color: COLOR_LIGHT })
    pm.moveDown(12)

    const codeBoxWidth = 260
    const codeBoxHeight = 24
    const codeBoxX = (PAGE_WIDTH - codeBoxWidth) / 2

    pm.drawRect(codeBoxX, pm.y - 4, codeBoxWidth, codeBoxHeight, COLOR_BG)

    const codeLabel = 'VERIFICATION CODE: '
    const codeValue = retainerData.verificationCode
    const labelWidth = fontBold.widthOfTextAtSize(codeLabel, FONT_SMALL)
    const valueWidth = fontBold.widthOfTextAtSize(codeValue, FONT_HEADING)
    const totalCodeWidth = labelWidth + valueWidth
    const codeStartX = (PAGE_WIDTH - totalCodeWidth) / 2

    pm.drawText(codeLabel, { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: codeStartX })
    pm.drawText(codeValue, { font: fontBold, size: FONT_HEADING, color: COLOR_PRIMARY, x: codeStartX + labelWidth })
    pm.moveDown(codeBoxHeight + 4)

    pm.drawTextCentered('Enter this code when uploading the signed copy for verification', {
      size: 6.5,
      color: COLOR_LIGHT,
    })
    pm.moveDown(10)
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  pm.ensureSpace(20)
  const footerText = `Generated by NorvaOS — ${sanitize(firmName)}`
  pm.drawTextCentered(footerText, { size: FONT_SMALL, color: COLOR_LIGHT })

  // Finalize (page numbers)
  pm.finalize()

  return doc.save()
}

// ── Section Renderer ─────────────────────────────────────────────────────────

function renderSection(
  pm: PdfPageManager,
  section: TemplateSection,
  fields: Record<string, string>,
  conditions: Record<string, boolean>,
  retainerData: RetainerPdfData,
  currency: string,
  sectionNumber: number,
): void {
  const font = pm.getFont()
  const fontBold = pm.getBoldFont()

  // Render section title
  if (section.title) {
    pm.ensureSpace(30)

    if (section.title_style === 'heading1') {
      // Centered large title
      pm.drawTextCentered(resolveFields(section.title, fields), {
        font: fontBold,
        size: 16,
        color: COLOR_PRIMARY,
      })
      pm.moveDown(24)
    } else {
      // Numbered heading2/heading3
      const prefix = section.numbering ? `${sectionNumber}. ` : ''
      const titleSize = section.title_style === 'heading3' ? FONT_BODY + 1 : 12
      pm.drawText(`${prefix}${resolveFields(section.title, fields)}`, {
        font: fontBold,
        size: titleSize,
        color: COLOR_DARK,
      })
      pm.moveDown(titleSize + 6)
    }
  }

  // Sort and render elements
  const sortedElements = [...section.elements].sort((a, b) => a.order - b.order)
  let subNumber = 0

  for (const element of sortedElements) {
    // Check element-level condition
    if ('condition_key' in element && element.condition_key) {
      if (conditions[element.condition_key] === false) continue
      if (!(element.condition_key in conditions)) continue
    }

    switch (element.type) {
      case 'paragraph':
        renderParagraph(pm, element as ParagraphElement, fields, sectionNumber, ++subNumber)
        break
      case 'table':
        renderTable(pm, element as TableElement, fields, retainerData, currency)
        break
      case 'signature_block':
        renderSignatureBlock(pm, element as SignatureBlockElement, fields)
        break
      case 'page_break':
        pm.addPage()
        break
      default:
        // clause_placeholder or unknown — skip
        break
    }
  }

  pm.moveDown(8)
}

// ── Paragraph Renderer ───────────────────────────────────────────────────────

function renderParagraph(
  pm: PdfPageManager,
  el: ParagraphElement,
  fields: Record<string, string>,
  sectionNumber: number,
  subNumber: number,
): void {
  const font = pm.getFont()
  const fontBold = pm.getBoldFont()
  const indent = (el.indent_level ?? 0) * 20
  const x = MARGIN_LEFT + indent
  const maxWidth = CONTENT_WIDTH - indent

  const resolved = resolveFields(el.content, fields)

  // Skip empty paragraphs (unresolved fields that result in empty text)
  if (!resolved.trim()) return

  pm.ensureSpace(LINE_HEIGHT + 4)

  switch (el.style) {
    case 'heading1':
      pm.drawTextCentered(resolved, { font: fontBold, size: 16, color: COLOR_PRIMARY })
      pm.moveDown(24)
      break

    case 'heading2':
      pm.drawText(resolved, { font: fontBold, size: 12, color: COLOR_DARK, x })
      pm.moveDown(18)
      break

    case 'heading3':
      pm.drawText(resolved, { font: fontBold, size: FONT_HEADING, color: COLOR_DARK, x })
      pm.moveDown(16)
      break

    case 'bold':
      pm.drawWrappedText(resolved, { font: fontBold, size: FONT_BODY, color: COLOR_DARK, x, maxWidth })
      pm.moveDown(4)
      break

    case 'bullet': {
      // Draw bullet character then wrapped text
      pm.drawText('•', { size: FONT_BODY, color: COLOR_DARK, x })
      pm.drawWrappedText(resolved, {
        font,
        size: FONT_BODY,
        color: COLOR_DARK,
        x: x + 12,
        maxWidth: maxWidth - 12,
      })
      pm.moveDown(2)
      break
    }

    case 'numbered': {
      // Use section.sub numbering (e.g. "1.1", "1.2")
      const prefix = el.numbering
        ? `${sectionNumber}.${subNumber} `
        : `(${String.fromCharCode(96 + subNumber)}) `
      pm.drawText(prefix, { font: fontBold, size: FONT_BODY, color: COLOR_DARK, x })
      const prefixWidth = fontBold.widthOfTextAtSize(prefix, FONT_BODY)
      pm.drawWrappedText(resolved, {
        font,
        size: FONT_BODY,
        color: COLOR_DARK,
        x: x + prefixWidth,
        maxWidth: maxWidth - prefixWidth,
      })
      pm.moveDown(2)
      break
    }

    case 'body':
    default:
      pm.drawWrappedText(resolved, { font, size: FONT_BODY, color: COLOR_DARK, x, maxWidth })
      pm.moveDown(4)
      break
  }
}

// ── Table Renderer ───────────────────────────────────────────────────────────

function renderTable(
  pm: PdfPageManager,
  el: TableElement,
  fields: Record<string, string>,
  retainerData: RetainerPdfData,
  currency: string,
): void {
  const font = pm.getFont()
  const fontBold = pm.getBoldFont()

  // Check if this is a fee summary table (columns match "Description", "Amount")
  const isFeeTable = el.columns.length === 2
    && el.columns[0].toLowerCase().includes('description')
    && el.columns[1].toLowerCase().includes('amount')

  // Check if this is a payment schedule table
  const isPaymentTable = el.columns.length === 3
    && el.columns.some(c => c.toLowerCase().includes('installment'))
    && el.columns.some(c => c.toLowerCase().includes('amount'))

  if (isFeeTable) {
    renderFeeTable(pm, retainerData, currency)
    return
  }

  if (isPaymentTable) {
    renderPaymentScheduleTable(pm, retainerData, currency)
    return
  }

  // Generic table — resolve fields in each cell
  const resolvedRows = el.rows
    .map(row => row.map(cell => resolveFields(cell, fields)))
    .filter(row => row.some(cell => cell.trim())) // Skip empty rows

  if (resolvedRows.length === 0) return

  pm.ensureSpace(50)

  const colCount = el.columns.length
  const colWidth = CONTENT_WIDTH / colCount

  // Header row background
  pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)

  for (let i = 0; i < colCount; i++) {
    pm.drawText(el.columns[i], {
      font: fontBold,
      size: FONT_SMALL,
      color: COLOR_MID,
      x: MARGIN_LEFT + (i * colWidth) + 4,
    })
  }
  pm.moveDown(LINE_HEIGHT + 10)

  // Data rows
  for (const row of resolvedRows) {
    pm.ensureSpace(LINE_HEIGHT + 8)
    for (let i = 0; i < Math.min(row.length, colCount); i++) {
      pm.drawText(row[i], {
        size: FONT_BODY,
        color: COLOR_DARK,
        x: MARGIN_LEFT + (i * colWidth) + 4,
        maxWidth: colWidth - 8,
      })
    }
    pm.moveDown(LINE_HEIGHT + 4)
    pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
    pm.moveDown(4)
  }

  pm.moveDown(8)
}

// ── Fee Table (from retainer data) ───────────────────────────────────────────

function renderFeeTable(
  pm: PdfPageManager,
  data: RetainerPdfData,
  currency: string,
): void {
  const font = pm.getFont()
  const fontBold = pm.getBoldFont()

  const fmtDollars = (d: number) => new Intl.NumberFormat('en-CA', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(d)

  const fmtCents = (c: number) => new Intl.NumberFormat('en-CA', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(c / 100)

  const colDesc = MARGIN_LEFT
  const colQty = MARGIN_LEFT + CONTENT_WIDTH - 200
  const colUnit = MARGIN_LEFT + CONTENT_WIDTH - 130
  const colAmt = PAGE_WIDTH - MARGIN_RIGHT

  // ── Professional Fees ──
  if (data.lineItems.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('PROFESSIONAL FEES', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 4)

    // Table header
    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)
    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    pm.drawText('Qty', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colQty })
    pm.drawText('Unit Price', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colUnit })
    const amtHdrW = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHdrW })
    pm.moveDown(LINE_HEIGHT + 10)

    for (const item of data.lineItems) {
      pm.ensureSpace(LINE_HEIGHT + 8)
      pm.drawText(sanitize(item.description), { size: FONT_BODY, x: colDesc + 4, maxWidth: colQty - colDesc - 15 })
      pm.drawText(String(item.quantity), { size: FONT_BODY, x: colQty })
      pm.drawText(fmtDollars(item.unitPrice), { size: FONT_BODY, x: colUnit })
      const amtText = fmtDollars(item.quantity * item.unitPrice)
      const amtW = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtW })
      pm.moveDown(LINE_HEIGHT + 4)
      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }
    pm.moveDown(8)
  }

  // ── Government Fees ──
  if (data.governmentFees.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('GOVERNMENT FEES', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 4)

    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)
    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    const amtHdrW2 = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHdrW2 })
    pm.moveDown(LINE_HEIGHT + 10)

    for (const fee of data.governmentFees) {
      pm.ensureSpace(LINE_HEIGHT + 8)
      pm.drawText(sanitize(fee.description), { size: FONT_BODY, x: colDesc + 4, maxWidth: CONTENT_WIDTH - 100 })
      const amtText = fmtDollars(fee.amount)
      const amtW = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtW })
      pm.moveDown(LINE_HEIGHT + 4)
      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }
    pm.moveDown(8)
  }

  // ── Disbursements ──
  if (data.disbursements.length > 0) {
    pm.ensureSpace(50)
    pm.drawText('DISBURSEMENTS', { font: fontBold, size: FONT_SMALL, color: COLOR_MID })
    pm.moveDown(LINE_HEIGHT + 4)

    pm.drawRect(MARGIN_LEFT, pm.y - 3, CONTENT_WIDTH, LINE_HEIGHT + 6, COLOR_BG)
    pm.drawText('Description', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colDesc + 4 })
    const amtHdrW3 = fontBold.widthOfTextAtSize('Amount', FONT_SMALL)
    pm.drawText('Amount', { font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: colAmt - amtHdrW3 })
    pm.moveDown(LINE_HEIGHT + 10)

    for (const item of data.disbursements) {
      pm.ensureSpace(LINE_HEIGHT + 8)
      pm.drawText(sanitize(item.description), { size: FONT_BODY, x: colDesc + 4, maxWidth: CONTENT_WIDTH - 100 })
      const amtText = fmtDollars(item.amount)
      const amtW = font.widthOfTextAtSize(amtText, FONT_BODY)
      pm.drawText(amtText, { size: FONT_BODY, x: colAmt - amtW })
      pm.moveDown(LINE_HEIGHT + 4)
      pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
      pm.moveDown(4)
    }
    pm.moveDown(8)
  }

  // ── Totals ──
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

  pm.drawLine({ y: pm.y + 2, color: COLOR_DARK, thickness: 1 })
  pm.moveDown(6)

  // Total highlight box
  pm.drawRect(totalLabelX - 5, pm.y - 4, 185, LINE_HEIGHT + 10, COLOR_PRIMARY)
  pm.drawText('TOTAL', { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalLabelX })
  const totalValue = fmtCents(data.totalAmountCents)
  const totalValWidth = fontBold.widthOfTextAtSize(totalValue, FONT_HEADING)
  pm.drawText(totalValue, { font: fontBold, size: FONT_HEADING, color: rgb(1, 1, 1), x: totalValueX - totalValWidth })
  pm.moveDown(LINE_HEIGHT + 20)
}

// ── Payment Schedule Table ───────────────────────────────────────────────────

function renderPaymentScheduleTable(
  pm: PdfPageManager,
  data: RetainerPdfData,
  currency: string,
): void {
  if (!data.paymentPlan || data.paymentPlan.length === 0) return

  const font = pm.getFont()
  const fontBold = pm.getBoldFont()

  const fmtDollars = (d: number) => new Intl.NumberFormat('en-CA', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(d)

  pm.ensureSpace(60)

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
    const inst = data.paymentPlan[i]
    pm.ensureSpace(LINE_HEIGHT + 8)

    pm.drawText(String(i + 1), { size: FONT_BODY, x: planColNum + 4 })
    pm.drawText(fmtDollars(inst.amount), { size: FONT_BODY, x: planColAmount })

    if (inst.dueDate) {
      pm.drawText(formatDateSafe(inst.dueDate), { size: FONT_BODY, x: planColDue })
    } else {
      pm.drawText('\u2014', { size: FONT_BODY, color: COLOR_LIGHT, x: planColDue })
    }

    if (inst.milestone) {
      pm.drawText(sanitize(inst.milestone), { size: FONT_BODY, x: planColMilestone, maxWidth: PAGE_WIDTH - MARGIN_RIGHT - planColMilestone - 5 })
    } else {
      pm.drawText('\u2014', { size: FONT_BODY, color: COLOR_LIGHT, x: planColMilestone })
    }

    pm.moveDown(LINE_HEIGHT + 4)
    pm.drawLine({ color: rgb(0.92, 0.92, 0.92), thickness: 0.3 })
    pm.moveDown(4)
  }

  pm.moveDown(10)
}

// ── Signature Block Renderer ─────────────────────────────────────────────────

function renderSignatureBlock(
  pm: PdfPageManager,
  el: SignatureBlockElement,
  fields: Record<string, string>,
): void {
  const font = pm.getFont()
  const fontBold = pm.getBoldFont()

  pm.ensureSpace(100)
  pm.moveDown(10)

  if (el.layout === 'side_by_side' && el.signers.length >= 2) {
    // Side-by-side signature blocks (client left, lawyer right)
    const leftX = MARGIN_LEFT
    const rightX = 330
    const sigLineY = pm.y - 40

    // Left signer (client)
    const leftSigner = el.signers[0]
    pm.drawText(`${leftSigner.label} Signature`, {
      font: fontBold, size: FONT_SMALL, color: COLOR_MID, x: leftX,
    })
    pm.drawLine({ y: sigLineY, startX: leftX, endX: leftX + 220, color: COLOR_DARK, thickness: 0.5 })
    pm.page.drawText(sanitize(fields.client_name || ''), {
      x: leftX, y: sigLineY - 14, size: FONT_BODY, font, color: COLOR_DARK,
    })
    if (leftSigner.include_date_line) {
      pm.page.drawText('Date: ____________________', {
        x: leftX, y: sigLineY - 28, size: FONT_BODY, font, color: COLOR_MID,
      })
    }

    // Right signer (lawyer)
    const rightSigner = el.signers[1]
    pm.page.drawText(`${rightSigner.label} Signature`, {
      x: rightX, y: pm.y, size: FONT_SMALL, font: fontBold, color: COLOR_MID,
    })
    pm.drawLine({ y: sigLineY, startX: rightX, endX: rightX + 220, color: COLOR_DARK, thickness: 0.5 })
    pm.page.drawText(sanitize(fields.firm_name || fields.lawyer_name || ''), {
      x: rightX, y: sigLineY - 14, size: FONT_BODY, font, color: COLOR_DARK,
    })
    if (rightSigner.include_date_line) {
      pm.page.drawText('Date: ____________________', {
        x: rightX, y: sigLineY - 28, size: FONT_BODY, font, color: COLOR_MID,
      })
    }
    if (rightSigner.include_lso_number && fields.lawyer_lso_number) {
      pm.page.drawText(`LSO #${fields.lawyer_lso_number}`, {
        x: rightX, y: sigLineY - 42, size: FONT_SMALL, font, color: COLOR_LIGHT,
      })
    }

    pm.y = sigLineY - 55
  } else {
    // Stacked signature blocks
    for (const signer of el.signers) {
      pm.ensureSpace(60)
      pm.drawText(`${signer.label} Signature`, {
        font: fontBold, size: FONT_SMALL, color: COLOR_MID,
      })
      pm.moveDown(30)
      pm.drawLine({ startX: MARGIN_LEFT, endX: MARGIN_LEFT + 250, color: COLOR_DARK, thickness: 0.5 })
      pm.moveDown(14)

      const name = signer.role === 'client'
        ? (fields.client_name || '')
        : (fields.lawyer_name || fields.firm_name || '')
      pm.drawText(sanitize(name), { size: FONT_BODY, color: COLOR_DARK })
      pm.moveDown(LINE_HEIGHT)

      if (signer.include_date_line) {
        pm.drawText('Date: ____________________', { size: FONT_BODY, color: COLOR_MID })
        pm.moveDown(LINE_HEIGHT)
      }

      pm.moveDown(15)
    }
  }
}

// ── Merge Field Resolution ───────────────────────────────────────────────────

function resolveFields(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] ?? '')
}

// ── Date Helper ──────────────────────────────────────────────────────────────

function formatDateSafe(isoDate: string): string {
  try {
    const parts = isoDate.split('T')[0].split('-')
    if (parts.length < 3) return isoDate
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    const d = new Date(year, month, day)
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return isoDate
  }
}
