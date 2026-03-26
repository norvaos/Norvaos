/**
 * @deprecated  -  LEGACY PDF Filler.
 *
 * Replaced by xfa-filler-db-server.ts which reads field mappings from the DB
 * (ircc_form_fields) instead of the hardcoded form-field-registry.
 *
 * This file still imports from the deprecated form-field-registry.ts.
 * Do not add new call-sites  -  migrate existing consumers to the DB path.
 *
 * Original description:
 * IRCC PDF Filler  -  fills IRCC form PDFs with client profile data.
 * Two modes: Template mode (fillable PDF) and Summary mode (data-summary PDF).
 * Uses `pdf-lib` for all PDF operations.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { profilePathGet } from './questionnaire-engine'
import { FORM_REGISTRY } from './form-field-registry'
import type { IRCCFieldMapping, IRCCFormSection } from '@/lib/types/ircc-profile'

// ── Public Types ──────────────────────────────────────────────────────────────

export interface PDFFieldMapping {
  profilePath: string
  pdfFieldName: string
  label: string
  fieldType: string
  transform?: (value: unknown) => string
}

// ── Form Titles ───────────────────────────────────────────────────────────────

const FORM_TITLES: Record<string, string> = {
  IMM5257: 'IMM 5257  -  Application for Temporary Resident Visa (Visitor Visa)',
  IMM5406: 'IMM 5406  -  Additional Family Information',
}

// ── Transform Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a value-transform function appropriate for the given field type.
 */
function getTransformForFieldType(
  fieldType: string,
): ((value: unknown) => string) | undefined {
  switch (fieldType) {
    case 'date':
      return (value: unknown) => {
        if (typeof value !== 'string' || !value) return ''
        // Already in YYYY-MM-DD format from the profile
        return value
      }

    case 'boolean':
      return (value: unknown) => {
        if (value === true) return 'Yes'
        if (value === false) return 'No'
        return ''
      }

    case 'number':
      return (value: unknown) => {
        if (typeof value === 'number' && !isNaN(value)) return String(value)
        if (typeof value === 'string') return value
        return ''
      }

    case 'repeater':
      return (value: unknown) => {
        if (!Array.isArray(value)) return ''
        return value
          .map((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              const entries = Object.entries(item as Record<string, unknown>)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `${formatFieldKey(k)}: ${v}`)
                .join(', ')
              return `${idx + 1}. ${entries}`
            }
            return `${idx + 1}. ${String(item)}`
          })
          .join('\n')
      }

    default:
      // text, textarea, select, country, email, phone, multi_select  -  as-is
      return undefined
  }
}

/**
 * Format a snake_case key into Title Case for display.
 */
function formatFieldKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ── Field Mappings ────────────────────────────────────────────────────────────

/**
 * Get the field mappings for a specific IRCC form.
 * Extracts all fields from the form's sections and maps profile paths
 * to PDF form field names with appropriate transforms.
 */
export function getFormFieldMappings(formCode: string): PDFFieldMapping[] {
  const sections: IRCCFormSection[] | undefined = FORM_REGISTRY[formCode]
  if (!sections) return []

  const mappings: PDFFieldMapping[] = []

  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.ircc_field_name) continue

      mappings.push({
        profilePath: field.profile_path,
        pdfFieldName: field.ircc_field_name,
        label: field.label,
        fieldType: field.field_type,
        transform: getTransformForFieldType(field.field_type),
      })
    }
  }

  return mappings
}

// ── Template PDF Filling ──────────────────────────────────────────────────────

/**
 * Fill a blank IRCC PDF form with client profile data.
 * Returns the filled PDF as Uint8Array.
 *
 * Works with ANY fillable PDF  -  maps fields by name and skips any that
 * don't exist in the template. Gracefully handles missing fields.
 */
export async function fillIRCCForm(
  blankPdfBytes: Uint8Array,
  profile: Record<string, unknown>,
  formCode: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(blankPdfBytes)
  const form = pdfDoc.getForm()

  const mappings = getFormFieldMappings(formCode)

  for (const mapping of mappings) {
    const value = profilePathGet(profile, mapping.profilePath)
    if (value == null) continue

    const stringValue = mapping.transform
      ? mapping.transform(value)
      : String(value)

    if (!stringValue) continue

    try {
      // Try text field first
      const field = form.getTextField(mapping.pdfFieldName)
      field.setText(stringValue)
    } catch {
      try {
        // Try checkbox
        const checkbox = form.getCheckBox(mapping.pdfFieldName)
        if (
          stringValue === 'true' ||
          stringValue === 'yes' ||
          stringValue === 'Yes'
        ) {
          checkbox.check()
        }
      } catch {
        try {
          // Try dropdown
          const dropdown = form.getDropdown(mapping.pdfFieldName)
          dropdown.select(stringValue)
        } catch {
          // Field not found in PDF  -  skip silently
          console.warn(
            `[pdf-filler] Field not found in PDF: ${mapping.pdfFieldName}`,
          )
        }
      }
    }
  }

  // Flatten the form (makes it non-editable but universally viewable)
  form.flatten()

  return pdfDoc.save()
}

// ── Summary PDF Generation ────────────────────────────────────────────────────

/** Layout constants for the summary PDF */
const PAGE_WIDTH = 612 // US Letter
const PAGE_HEIGHT = 792
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const MARGIN_TOP = 60
const MARGIN_BOTTOM = 60
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const LINE_HEIGHT = 14
const SECTION_GAP = 24
const FIELD_GAP = 4

/**
 * Generate a data-summary PDF when no official IRCC template is available.
 *
 * Creates a clean, readable document with:
 * - Title and date generated
 * - Sections matching the questionnaire structure
 * - Each field with label and value
 * - Array fields displayed as numbered entries
 */
export async function generateSummaryPdf(
  profile: Record<string, unknown>,
  formCode: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const sections: IRCCFormSection[] | undefined = FORM_REGISTRY[formCode]
  if (!sections) {
    // No sections found  -  return a minimal PDF with an error message
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawText(`No field definitions found for form: ${formCode}`, {
      x: MARGIN_LEFT,
      y: PAGE_HEIGHT - MARGIN_TOP,
      size: 12,
      font,
      color: rgb(0.5, 0, 0),
    })
    return pdfDoc.save()
  }

  // Cursor tracking
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_TOP

  // ── Helper: ensure space or add a new page ────────────────────────────
  function ensureSpace(needed: number) {
    if (y - needed < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN_TOP
    }
  }

  // ── Helper: draw text with word wrapping ──────────────────────────────
  function drawWrappedText(
    text: string,
    x: number,
    maxWidth: number,
    fontSize: number,
    usedFont: typeof font,
    colour = rgb(0.2, 0.2, 0.2),
  ) {
    const words = text.split(' ')
    let line = ''
    const lines: string[] = []

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      const testWidth = usedFont.widthOfTextAtSize(testLine, fontSize)
      if (testWidth > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = testLine
      }
    }
    if (line) lines.push(line)

    for (const l of lines) {
      ensureSpace(LINE_HEIGHT)
      page.drawText(l, { x, y, size: fontSize, font: usedFont, color: colour })
      y -= LINE_HEIGHT
    }
  }

  // ── Title ─────────────────────────────────────────────────────────────
  const title = FORM_TITLES[formCode] ?? `IRCC Form ${formCode}`
  page.drawText(title, {
    x: MARGIN_LEFT,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  })
  y -= 22

  // Subtitle: "Data Summary"
  page.drawText('Data Summary', {
    x: MARGIN_LEFT,
    y,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
  y -= LINE_HEIGHT

  // Date generated
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  page.drawText(`Generated: ${dateStr}`, {
    x: MARGIN_LEFT,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= LINE_HEIGHT

  // Divider line
  y -= 6
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  })
  y -= SECTION_GAP

  // ── Sections ──────────────────────────────────────────────────────────
  for (const section of sections) {
    // Section header
    ensureSpace(LINE_HEIGHT * 3)

    page.drawText(section.title, {
      x: MARGIN_LEFT,
      y,
      size: 13,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.3),
    })
    y -= LINE_HEIGHT + 2

    if (section.description) {
      drawWrappedText(
        section.description,
        MARGIN_LEFT,
        CONTENT_WIDTH,
        8,
        font,
        rgb(0.5, 0.5, 0.5),
      )
      y -= FIELD_GAP
    }

    // Underline for section
    page.drawLine({
      start: { x: MARGIN_LEFT, y: y + 2 },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y + 2 },
      thickness: 0.3,
      color: rgb(0.85, 0.85, 0.85),
    })
    y -= 8

    // Fields
    for (const field of section.fields) {
      const rawValue = profilePathGet(profile, field.profile_path)
      const displayValue = formatDisplayValue(rawValue, field)

      // Label
      ensureSpace(LINE_HEIGHT * 2)
      page.drawText(field.label, {
        x: MARGIN_LEFT + 4,
        y,
        size: 9,
        font: boldFont,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= LINE_HEIGHT

      // Value
      if (displayValue) {
        // For multi-line values (repeaters), handle line breaks
        const valueLines = displayValue.split('\n')
        for (const valueLine of valueLines) {
          drawWrappedText(
            valueLine,
            MARGIN_LEFT + 12,
            CONTENT_WIDTH - 12,
            9,
            font,
            rgb(0.15, 0.15, 0.15),
          )
        }
      } else {
        page.drawText(' - ', {
          x: MARGIN_LEFT + 12,
          y,
          size: 9,
          font,
          color: rgb(0.7, 0.7, 0.7),
        })
        y -= LINE_HEIGHT
      }

      y -= FIELD_GAP
    }

    y -= SECTION_GAP - FIELD_GAP
  }

  // ── Footer on last page ───────────────────────────────────────────────
  page.drawText(
    'This document is a data summary generated by NorvaOS. It is not an official IRCC form.',
    {
      x: MARGIN_LEFT,
      y: MARGIN_BOTTOM - 20,
      size: 7,
      font,
      color: rgb(0.6, 0.6, 0.6),
    },
  )

  return pdfDoc.save()
}

// ── Display Formatting ────────────────────────────────────────────────────────

/**
 * Format a profile value for display in the summary PDF.
 */
function formatDisplayValue(
  value: unknown,
  field: IRCCFieldMapping,
): string {
  if (value == null) return ''

  switch (field.field_type) {
    case 'boolean':
      if (value === true) return 'Yes'
      if (value === false) return 'No'
      return ''

    case 'select': {
      // Try to find the human-readable label from field options
      if (field.options && typeof value === 'string') {
        const option = field.options.find((o) => o.value === value)
        if (option) return option.label
      }
      return String(value)
    }

    case 'number':
      if (typeof value === 'number' && !isNaN(value)) return String(value)
      return ''

    case 'repeater':
      if (!Array.isArray(value) || value.length === 0) return ''
      return value
        .map((item, idx) => {
          if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>)
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => `${formatFieldKey(k)}: ${v}`)
              .join(', ')
            return `${idx + 1}. ${entries}`
          }
          return `${idx + 1}. ${String(item)}`
        })
        .join('\n')

    case 'date':
      if (typeof value === 'string' && value) return value
      return ''

    default:
      if (typeof value === 'string') return value
      if (typeof value === 'object') {
        // Address objects, etc.
        const entries = Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => `${formatFieldKey(k)}: ${v}`)
          .join(', ')
        return entries || ''
      }
      return String(value)
  }
}
