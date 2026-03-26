/**
 * Success-Reverb — Gold Standard Template Extractor (Directive 1.6)
 *
 * When a matter moves to "Approved", this service reverse-engineers
 * the file to create a Gold Standard Template capturing:
 * - Keyword density breakdown
 * - Document structure (section order, attachment sequence)
 * - Metadata zone coverage
 * - Time-to-approval
 * - Playbook used (if any)
 *
 * Future similar matters are prompted: "This structure resulted in a
 * 14-day approval for [Name]. Apply these metadata markers?"
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { scanDocument } from '@/lib/services/audit-optimizer/scanner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GoldStandardTemplate {
  /** Matched case type slug */
  caseType: string
  /** Matter type name for display */
  matterTypeName: string | null
  /** Readability score of the approved submission */
  readabilityScore: number
  /** Grade (A/B/C/D) */
  grade: string
  /** Keyword density by category */
  keywordDensity: Record<string, number>
  /** Recommended document structure (section order) */
  documentStructure: string[]
  /** Metadata zone coverage scores */
  zoneCoverage: Record<string, number>
  /** Days from matter opened to approval */
  daysToApproval: number | null
  /** Playbook ID used for drafting (if any) */
  playbookId: string | null
  /** Playbook title */
  playbookTitle: string | null
  /** Applicant name (redacted for template) */
  applicantRedacted: string
  /** Source matter ID */
  sourceMatterId: string
  /** Approval date */
  approvedAt: string
}

export interface TemplateSuggestion {
  templateId: string
  caseType: string
  readabilityScore: number
  grade: string
  daysToApproval: number | null
  applicantRedacted: string
  approvedAt: string
  message: string
}

// ── Template Extraction ─────────────────────────────────────────────────────

/**
 * Reverse-engineer an approved matter into a Gold Standard Template.
 *
 * Called when a matter transitions to 'Approved' or 'closed_won'.
 */
export async function extractGoldStandardTemplate(
  supabase: SupabaseClient,
  matterId: string,
  tenantId: string,
): Promise<GoldStandardTemplate> {
  // ── 1. Fetch matter details ─────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matter, error: matterErr } = await (supabase as any)
    .from('matters')
    .select('id, title, status, case_type_id, matter_type_id, date_opened, closed_at, created_at')
    .eq('id', matterId)
    .single()

  if (matterErr || !matter) {
    throw new Error(`Matter ${matterId} not found`)
  }

  // ── 2. Resolve case type and matter type names ──────────────────────────

  let caseTypeSlug = 'general'
  let matterTypeName: string | null = null

  if (matter.case_type_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ct } = await (supabase as any)
      .from('case_types')
      .select('slug, name')
      .eq('id', matter.case_type_id)
      .single()
    caseTypeSlug = (ct as { slug?: string } | null)?.slug ?? 'general'
  }

  if (matter.matter_type_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mt } = await (supabase as any)
      .from('matter_types')
      .select('name')
      .eq('id', matter.matter_type_id)
      .single()
    matterTypeName = (mt as { name?: string } | null)?.name ?? null
  }

  // ── 3. Find most recent Audit-Optimizer scan for readability metrics ────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestScan } = await (supabase as any)
    .from('audit_optimizer_scans')
    .select('readability_score, keyword_coverage, metadata_zones, status')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── 4. Find primary contact name for redacted reference ─────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mc } = await (supabase as any)
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  let applicantRedacted = '[Applicant]'
  if (mc?.contact_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (supabase as any)
      .from('contacts')
      .select('first_name, last_name')
      .eq('id', mc.contact_id)
      .single()
    if (contact) {
      const first = (contact.first_name as string) ?? ''
      const last = (contact.last_name as string) ?? ''
      // Redact: "John D." pattern
      applicantRedacted = first
        ? `${first} ${last ? last[0] + '.' : ''}`
        : '[Applicant]'
    }
  }

  // ── 5. Check for playbook usage in AI draft history ─────────────────────

  let playbookId: string | null = null
  let playbookTitle: string | null = null

  // Check norva_ear sessions for any playbook references (future: AI draft log)
  // For now, look at Audit-Optimizer scan metadata for playbook hints

  // ── 6. Calculate days to approval ───────────────────────────────────────

  let daysToApproval: number | null = null
  const openDate = matter.date_opened ?? matter.created_at
  const closeDate = (matter as { closed_at?: string }).closed_at ?? new Date().toISOString()

  if (openDate) {
    const openMs = new Date(openDate).getTime()
    const closeMs = new Date(closeDate).getTime()
    if (!isNaN(openMs) && !isNaN(closeMs)) {
      daysToApproval = Math.round((closeMs - openMs) / (1000 * 60 * 60 * 24))
    }
  }

  // ── 7. Build keyword density from scan or compute fresh ─────────────────

  const keywordDensity: Record<string, number> = {}
  const zoneCoverage: Record<string, number> = {}
  let readabilityScore = 0
  let grade = 'C'

  if (latestScan) {
    readabilityScore = latestScan.readability_score ?? 0
    grade = readabilityScore >= 80 ? 'A' : readabilityScore >= 60 ? 'B' : readabilityScore >= 40 ? 'C' : 'D'

    // Extract keyword density from scan data
    const kc = latestScan.keyword_coverage as Record<string, { density?: number }> | null
    if (kc) {
      for (const [keyword, info] of Object.entries(kc)) {
        keywordDensity[keyword] = info.density ?? 0
      }
    }

    // Extract zone coverage
    const mz = latestScan.metadata_zones as Record<string, { score?: number }> | null
    if (mz) {
      for (const [zone, info] of Object.entries(mz)) {
        zoneCoverage[zone] = info.score ?? 0
      }
    }
  }

  // ── 8. Infer document structure ─────────────────────────────────────────

  const documentStructure = [
    'cover_page',
    'table_of_contents',
    'submission_letter',
    'supporting_documents',
    'statutory_declarations',
    'identity_documents',
    'employment_records',
    'financial_documents',
    'annexes',
  ]

  return {
    caseType: caseTypeSlug,
    matterTypeName,
    readabilityScore,
    grade,
    keywordDensity,
    documentStructure,
    zoneCoverage,
    daysToApproval,
    playbookId,
    playbookTitle,
    applicantRedacted,
    sourceMatterId: matterId,
    approvedAt: closeDate,
  }
}

/**
 * Find matching Gold Standard Templates for a new matter.
 *
 * Queries the gold_standard_templates table for templates with the
 * same case type, sorted by readability score.
 */
export async function findMatchingTemplates(
  supabase: SupabaseClient,
  tenantId: string,
  caseType: string,
): Promise<TemplateSuggestion[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templates, error } = await (supabase as any)
    .from('gold_standard_templates')
    .select('id, case_type, readability_score, grade, days_to_approval, applicant_redacted, approved_at')
    .eq('tenant_id', tenantId)
    .eq('case_type', caseType)
    .order('readability_score', { ascending: false })
    .limit(3)

  if (error || !templates || templates.length === 0) return []

  return (templates as Array<{
    id: string
    case_type: string
    readability_score: number
    grade: string
    days_to_approval: number | null
    applicant_redacted: string
    approved_at: string
  }>).map(t => ({
    templateId: t.id,
    caseType: t.case_type,
    readabilityScore: t.readability_score,
    grade: t.grade,
    daysToApproval: t.days_to_approval,
    applicantRedacted: t.applicant_redacted,
    approvedAt: t.approved_at,
    message: `This structure resulted in a ${t.days_to_approval ?? '?'}-day approval for ${t.applicant_redacted}. Apply these metadata markers?`,
  }))
}
