/**
 * Tests for the Document Engine  -  Render Engine (DOCX Generation)
 *
 * Covers:
 *   - renderDocument(): full pipeline (fields → conditions → DOCX)
 *   - All element types: paragraph, table, signature_block, clause_placeholder, page_break
 *   - Heading styles, bullet/numbered lists
 *   - Conditional sections and elements
 *   - Header/footer rendering
 *   - Built-in fields (current_date, current_date_short)
 *   - Output structure: buffer, checksum, fileName, resolvedFields, conditionEvaluations
 */

import { describe, it, expect } from 'vitest'
import { renderDocument } from '../render-engine'
import type { RenderDocumentParams } from '../render-engine'
import type { DocumentTemplateMappingRow, DocumentTemplateConditionRow } from '@/lib/types/database'
import type {
  TemplateBody,
  FieldResolutionContext,
  ClauseAssignmentWithBody,
} from '@/lib/types/document-engine'

// ── Test Fixtures ────────────────────────────────────────────────────────────

function makeTemplateBody(overrides?: Partial<TemplateBody>): TemplateBody {
  return {
    sections: [
      {
        id: 'sec-1',
        title: 'SCOPE OF SERVICES',
        title_style: 'heading1',
        condition_key: null,
        order: 0,
        elements: [
          {
            id: 'el-1',
            type: 'paragraph',
            content: 'This agreement is between {{client_name}} and {{firm_name}}.',
            style: 'body',
            order: 0,
          },
        ],
      },
    ],
    header: {
      content: '{{firm_name}}',
      show_logo: false,
      alignment: 'center',
    },
    footer: {
      content: 'Confidential',
      show_page_numbers: true,
    },
    metadata: {
      page_size: 'letter',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      font_family: 'Times New Roman',
      font_size: 24,
      line_spacing: 276,
    },
    ...overrides,
  }
}

function makeContext(): FieldResolutionContext {
  return {
    matter: { title: 'Smith Immigration' },
    contact: { full_name: 'John Smith' },
    billing: { billing_type: 'flat_fee', total_amount: 5000 },
    tenant: { name: 'ABC Law Firm' },
    lawyer: { full_name: 'Jane Lawyer' },
    customValues: {},
  }
}

function makeMappings(): DocumentTemplateMappingRow[] {
  return [
    {
      id: 'm-1', tenant_id: 't-1', template_version_id: 'v-1',
      field_key: 'client_name', display_name: 'Client Name',
      source_entity: 'contact', source_path: 'full_name',
      field_type: 'text', is_required: true, default_value: null,
      format_rule: null, fallback_rule: null, sort_order: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'm-2', tenant_id: 't-1', template_version_id: 'v-1',
      field_key: 'firm_name', display_name: 'Firm Name',
      source_entity: 'tenant', source_path: 'name',
      field_type: 'text', is_required: true, default_value: null,
      format_rule: null, fallback_rule: null, sort_order: 1,
      created_at: new Date().toISOString(),
    },
  ] as DocumentTemplateMappingRow[]
}

function makeParams(overrides?: Partial<RenderDocumentParams>): RenderDocumentParams {
  return {
    templateBody: makeTemplateBody(),
    mappings: makeMappings(),
    conditions: [],
    clauseAssignments: [],
    fieldContext: makeContext(),
    documentTitle: 'Test Retainer Agreement',
    ...overrides,
  }
}

// ── Full Pipeline ────────────────────────────────────────────────────────────

describe('renderDocument  -  full pipeline', () => {
  it('produces a valid DOCX buffer with correct structure', async () => {
    const result = await renderDocument(makeParams())

    expect(result.buffer).toBeInstanceOf(Buffer)
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(result.fileType).toBe('docx')
    expect(result.fileSize).toBe(result.buffer.length)
    expect(result.fileName).toBe('Test_Retainer_Agreement.docx')
  })

  it('produces a SHA-256 checksum', async () => {
    const result = await renderDocument(makeParams())

    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns resolved fields', async () => {
    const result = await renderDocument(makeParams())

    expect(result.resolvedFields.length).toBeGreaterThanOrEqual(2)
    const clientField = result.resolvedFields.find((f) => f.field_key === 'client_name')
    expect(clientField?.resolved_value).toBe('John Smith')
  })

  it('produces different checksums for different inputs', async () => {
    const result1 = await renderDocument(makeParams({ documentTitle: 'Doc A' }))
    const result2 = await renderDocument(makeParams({
      documentTitle: 'Doc B',
      templateBody: makeTemplateBody({
        sections: [{
          id: 'sec-1', title: 'Different', condition_key: null, order: 0,
          elements: [
            { id: 'el-1', type: 'paragraph', content: 'Different content entirely.', style: 'body', order: 0 },
          ],
        }],
      }),
    }))

    expect(result1.checksum).not.toBe(result2.checksum)
  })

  it('includes built-in date fields', async () => {
    const result = await renderDocument(makeParams())

    // Built-in fields are added to the field map but not to resolvedFields array
    // They appear in the rendered output  -  we verify the pipeline doesn't throw
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

// ── Element Types ────────────────────────────────────────────────────────────

describe('renderDocument  -  element types', () => {
  it('renders paragraph elements', async () => {
    const result = await renderDocument(makeParams())
    // The paragraph contains "This agreement is between John Smith and ABC Law Firm."
    // We verify the document renders without error and produces output
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders heading paragraphs', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: 'Main Title', title_style: 'heading1',
        condition_key: null, order: 0,
        elements: [
          { id: 'el-1', type: 'paragraph', content: 'Heading content', style: 'heading2', order: 0 },
        ],
      }],
    })
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders bullet list elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: '', condition_key: null, order: 0,
        elements: [
          { id: 'el-1', type: 'paragraph', content: 'Bullet item 1', style: 'bullet', indent_level: 0, order: 0 },
          { id: 'el-2', type: 'paragraph', content: 'Bullet item 2', style: 'bullet', indent_level: 0, order: 1 },
        ],
      }],
    })
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders numbered list elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: '', condition_key: null, order: 0,
        elements: [
          { id: 'el-1', type: 'paragraph', content: 'Item one', style: 'numbered', numbering: { type: 'decimal', level: 0 }, order: 0 },
          { id: 'el-2', type: 'paragraph', content: 'Item two', style: 'numbered', numbering: { type: 'decimal', level: 0 }, order: 1 },
        ],
      }],
    })
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders table elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: 'Fee Schedule', condition_key: null, order: 0,
        elements: [
          {
            id: 'el-1', type: 'table',
            columns: ['Description', 'Amount'],
            rows: [
              ['Professional Fees', '{{total_amount}}'],
              ['HST (13%)', '$650.00'],
            ],
            style: 'bordered',
            order: 0,
          },
        ],
      }],
    })
    const params = makeParams({
      templateBody: body,
      mappings: [
        ...makeMappings(),
        {
          id: 'm-3', tenant_id: 't-1', template_version_id: 'v-1',
          field_key: 'total_amount', display_name: 'Total',
          source_entity: 'billing', source_path: 'total_amount',
          field_type: 'currency', is_required: false, default_value: null,
          format_rule: null, fallback_rule: null, sort_order: 2,
          created_at: new Date().toISOString(),
        } as DocumentTemplateMappingRow,
      ],
    })
    const result = await renderDocument(params)
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders signature block elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: '', condition_key: null, order: 0,
        elements: [
          {
            id: 'el-1', type: 'signature_block',
            signers: [
              { role: 'client', label: 'Client', include_date_line: true },
              { role: 'lawyer', label: 'Lawyer', include_date_line: true, include_lso_number: true },
            ],
            layout: 'stacked',
            order: 0,
          },
        ],
      }],
    })
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders page break elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: '', condition_key: null, order: 0,
        elements: [
          { id: 'el-1', type: 'paragraph', content: 'Page 1 content', style: 'body', order: 0 },
          { id: 'el-2', type: 'page_break', order: 1 },
          { id: 'el-3', type: 'paragraph', content: 'Page 2 content', style: 'body', order: 2 },
        ],
      }],
    })
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders clause placeholder elements', async () => {
    const body = makeTemplateBody({
      sections: [{
        id: 'sec-1', title: 'Terms', condition_key: null, order: 0,
        elements: [
          { id: 'el-1', type: 'clause_placeholder', clause_placement_key: 'termination_clause', order: 0 },
        ],
      }],
    })
    const clauses: ClauseAssignmentWithBody[] = [
      {
        placement_key: 'termination_clause',
        clause_key: 'termination-30-day',
        clause_name: '30-Day Termination',
        content: 'Either party may terminate this agreement with 30 days written notice to {{firm_name}}.',
        sort_order: 0,
        is_required: true,
        condition_id: null,
      },
    ]
    const result = await renderDocument(makeParams({ templateBody: body, clauseAssignments: clauses }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

// ── Conditions ───────────────────────────────────────────────────────────────

describe('renderDocument  -  conditions', () => {
  it('excludes sections where condition evaluates false', async () => {
    const body = makeTemplateBody({
      sections: [
        {
          id: 'sec-always', title: 'Always Shown', condition_key: null, order: 0,
          elements: [
            { id: 'el-1', type: 'paragraph', content: 'Visible content', style: 'body', order: 0 },
          ],
        },
        {
          id: 'sec-conditional', title: 'Conditional Section', condition_key: 'show_hourly', order: 1,
          elements: [
            { id: 'el-2', type: 'paragraph', content: 'Hourly billing details', style: 'body', order: 0 },
          ],
        },
      ],
    })
    const conditions: DocumentTemplateConditionRow[] = [
      {
        id: 'c-1', tenant_id: 't-1', template_version_id: 'v-1',
        condition_key: 'show_hourly', label: 'Show for hourly',
        rules: { rules: [{ field_key: 'billing_type', operator: 'equals', value: 'hourly' }] },
        logic_operator: 'AND', evaluation_order: 0,
        created_at: new Date().toISOString(),
      } as DocumentTemplateConditionRow,
    ]
    // billing_type is 'flat_fee' in context, so show_hourly should be false
    const result = await renderDocument(makeParams({ templateBody: body, conditions }))

    // Verify condition was evaluated
    expect(result.conditionEvaluations).toHaveLength(1)
    expect(result.conditionEvaluations[0].condition_key).toBe('show_hourly')
    expect(result.conditionEvaluations[0].result).toBe(false)
    // Document still renders (with the conditional section excluded)
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('includes sections where condition evaluates true', async () => {
    const body = makeTemplateBody({
      sections: [
        {
          id: 'sec-conditional', title: 'Flat Fee Section', condition_key: 'show_flat_fee', order: 0,
          elements: [
            { id: 'el-1', type: 'paragraph', content: 'Flat fee: $5,000', style: 'body', order: 0 },
          ],
        },
      ],
    })
    const conditions: DocumentTemplateConditionRow[] = [
      {
        id: 'c-1', tenant_id: 't-1', template_version_id: 'v-1',
        condition_key: 'show_flat_fee', label: 'Show for flat fee',
        rules: { rules: [{ field_key: 'billing_type', operator: 'equals', value: 'flat_fee' }] },
        logic_operator: 'AND', evaluation_order: 0,
        created_at: new Date().toISOString(),
      } as DocumentTemplateConditionRow,
    ]
    // billing_type resolves to 'flat_fee'  -  condition passes
    const mappings = [
      ...makeMappings(),
      {
        id: 'm-bt', tenant_id: 't-1', template_version_id: 'v-1',
        field_key: 'billing_type', display_name: 'Billing Type',
        source_entity: 'billing', source_path: 'billing_type',
        field_type: 'text', is_required: false, default_value: null,
        format_rule: null, fallback_rule: null, sort_order: 2,
        created_at: new Date().toISOString(),
      } as DocumentTemplateMappingRow,
    ]
    const result = await renderDocument(makeParams({ templateBody: body, conditions, mappings }))

    expect(result.conditionEvaluations[0].result).toBe(true)
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

// ── Page Formatting ──────────────────────────────────────────────────────────

describe('renderDocument  -  page formatting', () => {
  it('supports A4 page size', async () => {
    const body = makeTemplateBody()
    body.metadata.page_size = 'a4'
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders without header and footer', async () => {
    const body = makeTemplateBody()
    // @ts-expect-error  -  testing null header/footer
    body.header = undefined
    // @ts-expect-error  -  testing null footer
    body.footer = undefined
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('renders footer without page numbers', async () => {
    const body = makeTemplateBody()
    body.footer.show_page_numbers = false
    const result = await renderDocument(makeParams({ templateBody: body }))
    expect(result.buffer.length).toBeGreaterThan(0)
  })
})

// ── File Name Sanitization ───────────────────────────────────────────────────

describe('renderDocument  -  file name', () => {
  it('sanitizes special characters from document title', async () => {
    const result = await renderDocument(makeParams({ documentTitle: 'Smith & Jones  -  Retainer (2024)' }))
    // &  -  ( ) are stripped, spaces collapsed to single underscore
    expect(result.fileName).toBe('Smith_Jones_Retainer_2024.docx')
  })

  it('replaces spaces with underscores', async () => {
    const result = await renderDocument(makeParams({ documentTitle: 'My Document Title' }))
    expect(result.fileName).toBe('My_Document_Title.docx')
  })

  it('truncates long file names', async () => {
    const longTitle = 'A'.repeat(200)
    const result = await renderDocument(makeParams({ documentTitle: longTitle }))
    // 100 chars max + .docx
    expect(result.fileName.length).toBeLessThanOrEqual(105)
  })
})
