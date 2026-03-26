/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NorvaOS Document Generation Engine  -  Domain Types
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Types for the template body schema, field resolution, condition evaluation,
 * render pipeline, and state transitions.
 *
 * These types describe the JSONB structures and engine interfaces  -  NOT database
 * row types (those live in database.ts).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE BODY SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/** Root template body stored in document_template_versions.template_body */
export interface TemplateBody {
  sections: TemplateSection[]
  header: TemplateHeader
  footer: TemplateFooter
  metadata: TemplateMetadata
}

export interface TemplateSection {
  id: string
  title: string
  title_style?: 'heading1' | 'heading2' | 'heading3'
  numbering?: TemplateNumbering | null
  condition_key: string | null
  order: number
  elements: TemplateElement[]
}

/** Union type for all element types within a section */
export type TemplateElement =
  | ParagraphElement
  | TableElement
  | SignatureBlockElement
  | ClausePlaceholderElement
  | PageBreakElement

export interface ParagraphElement {
  id: string
  type: 'paragraph'
  content: string  // may contain {{field_key}} placeholders
  style: ParagraphStyle
  numbering?: TemplateNumbering | null
  indent_level?: number
  condition_key?: string | null
  order: number
}

export interface TableElement {
  id: string
  type: 'table'
  columns: string[]
  rows: string[][]  // cells may contain {{field_key}} placeholders
  style?: 'bordered' | 'plain' | 'striped'
  condition_key?: string | null
  order: number
}

export interface SignatureBlockElement {
  id: string
  type: 'signature_block'
  signers: SignatureBlockSigner[]
  layout: 'side_by_side' | 'stacked'
  order: number
}

export interface SignatureBlockSigner {
  role: string
  label: string
  include_date_line: boolean
  include_lso_number?: boolean
}

export interface ClausePlaceholderElement {
  id: string
  type: 'clause_placeholder'
  clause_placement_key: string
  order: number
}

export interface PageBreakElement {
  id: string
  type: 'page_break'
  order: number
}

export type ParagraphStyle = 'body' | 'bold' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered'

export interface TemplateNumbering {
  type: 'decimal' | 'alpha_lower' | 'alpha_upper' | 'roman_lower' | 'roman_upper'
  level: number     // 0 = top level, 1 = sub, 2 = sub-sub
  start?: number    // starting number (default 1)
}

export interface TemplateHeader {
  content: string
  logo_path?: string | null
  show_logo: boolean
  alignment?: 'left' | 'center' | 'right'
}

export interface TemplateFooter {
  content: string
  show_page_numbers: boolean
  page_number_format?: string  // e.g. 'Page {PAGE} of {NUMPAGES}'
}

export interface TemplateMetadata {
  page_size: 'letter' | 'a4'
  margins: {
    top: number     // in twips (1440 = 1 inch)
    bottom: number
    left: number
    right: number
  }
  font_family: string
  font_size: number     // in half-points (24 = 12pt)
  line_spacing?: number // in 240ths of a line (276 = 1.15x)
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONDITION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/** Operators supported for condition evaluation */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'in_list'
  | 'truthy'
  | 'falsy'

/** A single rule within a condition */
export interface ConditionRule {
  field_key: string
  operator: ConditionOperator
  value?: string | string[] | number | boolean | null
}

/** The structured rules JSONB stored in document_template_conditions.rules */
export interface ConditionRulesJson {
  rules: ConditionRule[]
}

/** Result of evaluating a single condition */
export interface ConditionEvaluation {
  condition_key: string
  label: string
  result: boolean
  logic_operator: string
  rule_results: {
    field_key: string
    operator: ConditionOperator
    expected_value: unknown
    actual_value: string | null
    passed: boolean
  }[]
}


// ═══════════════════════════════════════════════════════════════════════════════
// FIELD RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Data context passed to the field resolver  -  pre-fetched, no DB access */
export interface FieldResolutionContext {
  matter: Record<string, unknown>
  contact: Record<string, unknown>
  billing: Record<string, unknown>
  tenant: Record<string, unknown>
  lawyer: Record<string, unknown>
  customValues: Record<string, string>
}

/** Result of resolving a single merge field */
export interface ResolvedField {
  field_key: string
  display_name: string
  resolved_value: string
  source_entity: string
  source_path: string
  was_empty: boolean
  used_default: boolean
  used_fallback: boolean
}


// ═══════════════════════════════════════════════════════════════════════════════
// RENDER ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/** Input context for the render engine */
export interface RenderContext {
  templateBody: TemplateBody
  resolvedFields: Record<string, string>
  conditionResults: Map<string, boolean>
  clauseAssignments: ClauseAssignmentWithBody[]
  metadata: TemplateMetadata
  header: TemplateHeader
  footer: TemplateFooter
}

/** Clause assignment enriched with the actual clause body text */
export interface ClauseAssignmentWithBody {
  placement_key: string
  clause_key: string
  clause_name: string
  content: string     // clause body text (may contain {{merge_fields}})
  sort_order: number
  is_required: boolean
  condition_id: string | null
}

/** Output from the render engine */
export interface RenderResult {
  buffer: Buffer
  fileName: string
  fileSize: number
  fileType: 'docx'
  checksum: string
  resolvedFields: ResolvedField[]
  conditionEvaluations: ConditionEvaluation[]
}


// ═══════════════════════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid status transitions for document instances */
export const VALID_INSTANCE_TRANSITIONS: Record<string, string[]> = {
  draft:             ['pending_review', 'approved', 'voided', 'superseded'],
  pending_review:    ['approved', 'draft', 'voided', 'superseded'],
  approved:          ['sent', 'voided', 'superseded'],
  sent:              ['partially_signed', 'signed', 'declined', 'voided', 'expired', 'superseded'],
  partially_signed:  ['signed', 'declined', 'voided', 'superseded'],
  // Terminal states  -  no transitions out
  signed:            ['superseded'],
  declined:          [],
  voided:            [],
  expired:           [],
  superseded:        [],
}

/** Valid status transitions for template versions */
export const VALID_TEMPLATE_VERSION_TRANSITIONS: Record<string, string[]> = {
  draft:       ['published', 'archived'],
  published:   ['superseded'],
  archived:    [],
  superseded:  [],
}

/** Valid status transitions for signature requests */
export const VALID_SIGNATURE_REQUEST_TRANSITIONS: Record<string, string[]> = {
  pending:          ['sent', 'cancelled'],
  sent:             ['opened', 'partially_signed', 'declined', 'expired', 'cancelled'],
  opened:           ['partially_signed', 'declined', 'expired', 'cancelled'],
  partially_signed: ['completed', 'declined', 'expired'],
  // Terminal states
  completed:        [],
  declined:         [],
  expired:          [],
  cancelled:        [],
}

/** Valid status transitions for individual signers */
export const VALID_SIGNER_TRANSITIONS: Record<string, string[]> = {
  pending:  ['sent'],
  sent:     ['viewed', 'signed', 'declined', 'expired'],
  viewed:   ['signed', 'declined', 'expired'],
  // Terminal states
  signed:   [],
  declined: [],
  expired:  [],
}


// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/** Parameters for generating a document instance */
export interface GenerateInstanceParams {
  tenantId: string
  templateId: string
  matterId: string
  contactId?: string
  customValues?: Record<string, string>
  generationMode?: string
  generatedBy: string
}

/** Parameters for creating a signature request */
export interface CreateSignatureRequestParams {
  tenantId: string
  instanceId: string
  provider?: string
  signers: SignerInput[]
  createdBy: string
}

export interface SignerInput {
  contactId?: string
  roleKey: string
  name: string
  email: string
  signingOrder?: number
}

/** Template with its current published version and related data */
export interface TemplateWithVersion {
  template: import('@/lib/types/database').DocumentTemplateRow
  version: import('@/lib/types/database').DocumentTemplateVersionRow | null
  mappings: import('@/lib/types/database').DocumentTemplateMappingRow[]
  conditions: import('@/lib/types/database').DocumentTemplateConditionRow[]
  clauseAssignments: (import('@/lib/types/database').DocumentClauseAssignmentRow & {
    clause: import('@/lib/types/database').DocumentClauseRow
  })[]
}

/** Instance with all related data for detail view */
export interface InstanceWithDetails {
  instance: import('@/lib/types/database').DocumentInstanceRow
  artifacts: import('@/lib/types/database').DocumentArtifactRow[]
  fields: import('@/lib/types/database').DocumentInstanceFieldRow[]
  events: import('@/lib/types/database').DocumentStatusEventRow[]
  signatureRequest: import('@/lib/types/database').DocumentSignatureRequestRow | null
  signers: import('@/lib/types/database').DocumentSignerRow[]
  supersededBy: import('@/lib/types/database').DocumentInstanceRow | null
  supersedes: import('@/lib/types/database').DocumentInstanceRow | null
}
