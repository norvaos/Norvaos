/**
 * POST /api/matters/[id]/success-reverb
 *
 * Success-Reverb  -  Reverse-engineer an approved matter into a
 * Gold Standard Template for future reference.
 *
 * GET /api/matters/[id]/success-reverb
 *
 * Find matching Gold Standard Templates for a matter's case type.
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import {
  extractGoldStandardTemplate,
  findMatchingTemplates,
} from '@/lib/services/success-reverb/template-extractor'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, userId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    // Extract Gold Standard Template
    const template = await extractGoldStandardTemplate(supabase, matterId, tenantId)

    // Persist to gold_standard_templates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: saved, error: insertError } = await (supabase as any)
      .from('gold_standard_templates')
      .insert({
        tenant_id: tenantId,
        source_matter_id: matterId,
        case_type: template.caseType,
        matter_type_name: template.matterTypeName,
        readability_score: template.readabilityScore,
        grade: template.grade,
        keyword_density: template.keywordDensity,
        document_structure: template.documentStructure,
        zone_coverage: template.zoneCoverage,
        days_to_approval: template.daysToApproval,
        playbook_id: template.playbookId,
        playbook_title: template.playbookTitle,
        applicant_redacted: template.applicantRedacted,
        approved_at: template.approvedAt,
        extracted_by: userId,
      })
      .select('id, created_at')
      .single()

    if (insertError) {
      console.error('[Success-Reverb] Failed to persist template:', insertError)
      // Non-fatal  -  still return the template data
    }

    return NextResponse.json({
      success: true,
      templateId: saved?.id ?? null,
      template,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Success-Reverb] Extract error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract template' },
      { status: 500 },
    )
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    // Get matter's case type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matter } = await (supabase as any)
      .from('matters')
      .select('case_type_id')
      .eq('id', matterId)
      .single()

    if (!matter?.case_type_id) {
      return NextResponse.json({ suggestions: [] })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: caseType } = await (supabase as any)
      .from('case_types')
      .select('slug')
      .eq('id', matter.case_type_id)
      .single()

    const slug = (caseType as { slug?: string } | null)?.slug ?? 'general'
    const suggestions = await findMatchingTemplates(supabase, tenantId, slug)

    return NextResponse.json({ suggestions })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Success-Reverb] Suggestions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
