/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Render Engine (DOCX Generation)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Orchestrates the full render pipeline:
 *   1. Resolve fields
 *   2. Evaluate conditions
 *   3. Assemble document body (sections, elements, clauses)
 *   4. Generate DOCX using the `docx` npm library
 *
 * Input:  template body + mappings + conditions + clause assignments + data context
 * Output: DOCX buffer + checksum + resolved fields + condition evaluations
 */

import { createHash } from 'crypto'
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  NumberFormat,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
  Packer,
  LevelFormat,
  convertInchesToTwip,
  type IRunOptions,
  type INumberingOptions,
  type ISectionOptions,
  type IParagraphOptions,
  type ILevelsOptions,
} from 'docx'

import type { DocumentTemplateMappingRow, DocumentTemplateConditionRow } from '@/lib/types/database'
import type {
  TemplateBody,
  TemplateSection,
  TemplateElement,
  ParagraphElement,
  TableElement,
  SignatureBlockElement,
  ClausePlaceholderElement,
  TemplateMetadata,
  TemplateHeader,
  TemplateFooter,
  FieldResolutionContext,
  ClauseAssignmentWithBody,
  RenderResult,
  ConditionEvaluation,
  ResolvedField,
} from '@/lib/types/document-engine'

import { resolveFields, buildFieldMap, substituteFields } from './field-resolver'
import { evaluateAllConditions, evaluateConditionsDetailed, shouldInclude } from './condition-evaluator'

// ─── Main Render Function ───────────────────────────────────────────────────

export interface RenderDocumentParams {
  templateBody: TemplateBody
  mappings: DocumentTemplateMappingRow[]
  conditions: DocumentTemplateConditionRow[]
  clauseAssignments: ClauseAssignmentWithBody[]
  fieldContext: FieldResolutionContext
  documentTitle: string
}

/**
 * Full render pipeline: fields → conditions → DOCX generation
 */
export async function renderDocument(params: RenderDocumentParams): Promise<RenderResult> {
  const { templateBody, mappings, conditions, clauseAssignments, fieldContext, documentTitle } = params

  // 1. Resolve all merge fields
  const resolved = resolveFields(mappings, fieldContext)
  const fieldMap = buildFieldMap(resolved)

  // Add built-in fields
  fieldMap['current_date'] = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  fieldMap['current_date_short'] = new Date().toISOString().split('T')[0]

  // 2. Evaluate all conditions
  const conditionResults = evaluateAllConditions(conditions, fieldMap)
  const conditionEvaluations = evaluateConditionsDetailed(conditions, fieldMap)

  // 3. Build DOCX document
  const doc = buildDocument(templateBody, fieldMap, conditionResults, clauseAssignments, documentTitle)

  // 4. Generate buffer
  const buffer = Buffer.from(await Packer.toBuffer(doc))
  const checksum = createHash('sha256').update(buffer).digest('hex')

  return {
    buffer,
    fileName: `${sanitizeFileName(documentTitle)}.docx`,
    fileSize: buffer.length,
    fileType: 'docx',
    checksum,
    resolvedFields: resolved,
    conditionEvaluations,
  }
}

// ─── Document Builder ───────────────────────────────────────────────────────

function buildDocument(
  body: TemplateBody,
  fieldMap: Record<string, string>,
  conditionResults: Map<string, boolean>,
  clauseAssignments: ClauseAssignmentWithBody[],
  title: string
): Document {
  const meta = body.metadata
  const numbering = buildNumberingConfig()

  const children = buildSectionChildren(
    body.sections,
    fieldMap,
    conditionResults,
    clauseAssignments
  )

  const section: ISectionOptions = {
    properties: {
      page: {
        size: {
          width: meta.page_size === 'a4' ? 11906 : 12240,  // A4 vs Letter width in twips
          height: meta.page_size === 'a4' ? 16838 : 15840,
        },
        margin: {
          top: meta.margins.top,
          bottom: meta.margins.bottom,
          left: meta.margins.left,
          right: meta.margins.right,
        },
      },
    },
    headers: body.header ? { default: buildHeader(body.header, fieldMap) } : undefined,
    footers: body.footer ? { default: buildFooter(body.footer, fieldMap) } : undefined,
    children,
  }

  return new Document({
    title,
    numbering,
    sections: [section],
    styles: {
      default: {
        document: {
          run: {
            font: meta.font_family || 'Times New Roman',
            size: meta.font_size || 24, // 12pt
          },
          paragraph: {
            spacing: {
              line: meta.line_spacing || 276, // 1.15x
            },
          },
        },
      },
    },
  })
}

// ─── Section & Element Rendering ────────────────────────────────────────────

function buildSectionChildren(
  sections: TemplateSection[],
  fieldMap: Record<string, string>,
  conditionResults: Map<string, boolean>,
  clauseAssignments: ClauseAssignmentWithBody[]
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  for (const section of sections.sort((a, b) => a.order - b.order)) {
    if (!shouldInclude(section.condition_key, conditionResults)) continue

    // Section title
    if (section.title) {
      children.push(
        new Paragraph({
          text: substituteFields(section.title, fieldMap),
          heading: mapHeadingLevel(section.title_style),
          spacing: { before: 240, after: 120 },
        })
      )
    }

    // Elements within the section
    for (const element of section.elements.sort((a, b) => a.order - b.order)) {
      const condKey = 'condition_key' in element ? (element as ParagraphElement).condition_key : null
      if (!shouldInclude(condKey, conditionResults)) continue

      const rendered = renderElement(element, fieldMap, conditionResults, clauseAssignments, section)
      children.push(...rendered)
    }
  }

  return children
}

function renderElement(
  element: TemplateElement,
  fieldMap: Record<string, string>,
  conditionResults: Map<string, boolean>,
  clauseAssignments: ClauseAssignmentWithBody[],
  section: TemplateSection
): (Paragraph | Table)[] {
  switch (element.type) {
    case 'paragraph':
      return [renderParagraph(element as ParagraphElement, fieldMap)]

    case 'table':
      return [renderTable(element as TableElement, fieldMap)]

    case 'signature_block':
      return renderSignatureBlock(element as SignatureBlockElement, fieldMap)

    case 'clause_placeholder':
      return renderClausePlaceholder(element as ClausePlaceholderElement, fieldMap, conditionResults, clauseAssignments)

    case 'page_break':
      return [new Paragraph({ children: [new PageBreak()] })]

    default:
      return []
  }
}

// ─── Paragraph Rendering ────────────────────────────────────────────────────

function renderParagraph(
  element: ParagraphElement,
  fieldMap: Record<string, string>
): Paragraph {
  const text = substituteFields(element.content, fieldMap)

  // Build options  -  construct complete object since IParagraphOptions properties are read-only
  let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined
  let bullet: { level: number } | undefined
  let numbering: { reference: string; level: number } | undefined
  let indent: { left: number } | undefined

  switch (element.style) {
    case 'heading1':
      heading = HeadingLevel.HEADING_1
      break
    case 'heading2':
      heading = HeadingLevel.HEADING_2
      break
    case 'heading3':
      heading = HeadingLevel.HEADING_3
      break
    case 'bullet':
      bullet = { level: element.indent_level ?? 0 }
      break
    case 'numbered':
      numbering = {
        reference: 'default-numbering',
        level: element.numbering?.level ?? element.indent_level ?? 0,
      }
      break
  }

  if (element.indent_level && element.style !== 'bullet') {
    indent = { left: element.indent_level * 720 } // 0.5 inch per level
  }

  return new Paragraph({
    children: [new TextRun({ text })],
    spacing: { after: 120 },
    heading,
    bullet,
    numbering,
    indent,
  })
}

// ─── Table Rendering ────────────────────────────────────────────────────────

function renderTable(
  element: TableElement,
  fieldMap: Record<string, string>
): Table {
  const isBordered = element.style !== 'plain'
  const borderStyle = isBordered
    ? { style: BorderStyle.SINGLE, size: 1, color: '999999' }
    : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

  const borders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
    insideHorizontal: borderStyle,
    insideVertical: borderStyle,
  }

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: element.columns.map(
      (col) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: substituteFields(col, fieldMap), bold: true })],
          })],
          borders,
          width: { size: Math.floor(100 / element.columns.length), type: WidthType.PERCENTAGE },
        })
    ),
  })

  // Data rows
  const dataRows = element.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ text: substituteFields(cell, fieldMap) })],
              borders,
              width: { size: Math.floor(100 / element.columns.length), type: WidthType.PERCENTAGE },
            })
        ),
      })
  )

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

// ─── Signature Block Rendering ──────────────────────────────────────────────

function renderSignatureBlock(
  element: SignatureBlockElement,
  fieldMap: Record<string, string>
): Paragraph[] {
  const paragraphs: Paragraph[] = []

  // Spacing before signature block
  paragraphs.push(new Paragraph({ spacing: { before: 480 } }))

  for (const signer of element.signers) {
    // Signature line
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: '___________________________________' })],
        spacing: { before: 360 },
      })
    )

    // Signer label
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: signer.label })],
        spacing: { after: 40 },
      })
    )

    // Date line
    if (signer.include_date_line) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: 'Date: ___________________________________' })],
          spacing: { after: 120 },
        })
      )
    }

    // Regulatory licence number (e.g. LSO, LSBC, RCIC)
    if (signer.include_lso_number) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: 'Licence #: ___________________________________' })],
          spacing: { after: 120 },
        })
      )
    }
  }

  return paragraphs
}

// ─── Clause Placeholder Rendering ───────────────────────────────────────────

function renderClausePlaceholder(
  element: ClausePlaceholderElement,
  fieldMap: Record<string, string>,
  conditionResults: Map<string, boolean>,
  clauseAssignments: ClauseAssignmentWithBody[]
): Paragraph[] {
  const matchingClauses = clauseAssignments
    .filter((ca) => ca.placement_key === element.clause_placement_key)
    .filter((ca) => shouldInclude(ca.condition_id, conditionResults))
    .sort((a, b) => a.sort_order - b.sort_order)

  const paragraphs: Paragraph[] = []
  for (const clause of matchingClauses) {
    const text = substituteFields(clause.content, fieldMap)
    // Split clause content by newlines for proper paragraph separation
    const lines = text.split('\n').filter(Boolean)
    for (const line of lines) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line })],
          spacing: { after: 120 },
        })
      )
    }
  }

  return paragraphs
}

// ─── Header & Footer ────────────────────────────────────────────────────────

function buildHeader(header: TemplateHeader, fieldMap: Record<string, string>): Header {
  const text = substituteFields(header.content, fieldMap)
  const alignment = mapAlignment(header.alignment)

  return new Header({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 18, color: '666666' })], // 9pt, grey
        alignment,
      }),
    ],
  })
}

function buildFooter(footer: TemplateFooter, fieldMap: Record<string, string>): Footer {
  const children: TextRun[] = []

  if (footer.content) {
    children.push(new TextRun({
      text: substituteFields(footer.content, fieldMap),
      size: 16, // 8pt
      color: '999999',
    }))
  }

  if (footer.show_page_numbers) {
    if (footer.content) {
      children.push(new TextRun({ text: '  |  ', size: 16, color: '999999' }))
    }
    children.push(new TextRun({ text: 'Page ', size: 16, color: '999999' }))
    children.push(new TextRun({
      children: [PageNumber.CURRENT],
      size: 16,
      color: '999999',
    }))
    children.push(new TextRun({ text: ' of ', size: 16, color: '999999' }))
    children.push(new TextRun({
      children: [PageNumber.TOTAL_PAGES],
      size: 16,
      color: '999999',
    }))
  }

  return new Footer({
    children: [
      new Paragraph({
        children,
        alignment: AlignmentType.CENTER,
      }),
    ],
  })
}

// ─── Numbering Configuration ────────────────────────────────────────────────

function buildNumberingConfig(): INumberingOptions {
  return {
    config: [
      {
        reference: 'default-numbering',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          { level: 2, format: LevelFormat.DECIMAL, text: '%1.%2.%3.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
          { level: 3, format: LevelFormat.LOWER_LETTER, text: '(%4)', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 2880, hanging: 360 } } } },
          { level: 4, format: LevelFormat.LOWER_ROMAN, text: '(%5)', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 3600, hanging: 360 } } } },
        ] as ILevelsOptions[],
      },
    ],
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function mapHeadingLevel(style?: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (style) {
    case 'heading1': return HeadingLevel.HEADING_1
    case 'heading2': return HeadingLevel.HEADING_2
    case 'heading3': return HeadingLevel.HEADING_3
    default: return undefined
  }
}

function mapAlignment(alignment?: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (alignment) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    default: return AlignmentType.LEFT
  }
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+-\s+/g, ' ')       // collapse " - " (dash separators) to single space
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')            // collapse multiple underscores
    .substring(0, 100)
}
