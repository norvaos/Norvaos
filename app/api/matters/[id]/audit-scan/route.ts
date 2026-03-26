/**
 * POST /api/matters/[id]/audit-scan
 *
 * Audit-Optimizer 3.0 — Pre-submission IRCC AI-readability audit.
 *
 * Flow:
 * 1. Auth + tenant validation
 * 2. Accept document text (extracted from PDF client-side)
 * 3. Run scanner against IRCC keyword catalog
 * 4. Persist scan result to audit_optimizer_scans table
 * 5. Return readability score + recommendations
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { scanDocument } from '@/lib/services/audit-optimizer/scanner'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    const body = await request.json()
    const { documentText, caseType, documentId } = body as {
      documentText: string
      caseType?: string
      documentId?: string
    }

    if (!documentText || documentText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Document text is required (minimum 50 characters).' },
        { status: 422 },
      )
    }

    // Run the Audit-Optimizer scanner
    const result = scanDocument(documentText, caseType)

    // Persist to audit_optimizer_scans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scan, error: insertError } = await (supabase as any)
      .from('audit_optimizer_scans')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        document_id: documentId ?? null,
        scanned_by: auth.userId,
        readability_score: result.readabilityScore,
        keyword_coverage: result.keywordCoverage,
        structure_issues: result.structureIssues,
        recommendations: result.recommendations,
        metadata_zones: result.metadataZones,
        status: 'completed',
      })
      .select('id, created_at')
      .single()

    if (insertError) {
      console.error('[Audit-Optimizer] Failed to persist scan:', insertError)
      // Non-fatal — still return the scan results
    }

    return NextResponse.json({
      success: true,
      scanId: scan?.id ?? null,
      readabilityScore: result.readabilityScore,
      keywordCoverage: result.keywordCoverage,
      structureIssues: result.structureIssues,
      recommendations: result.recommendations,
      metadataZones: result.metadataZones,
      grade: result.readabilityScore >= 80 ? 'A' :
             result.readabilityScore >= 60 ? 'B' :
             result.readabilityScore >= 40 ? 'C' : 'D',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Audit-Optimizer] Scan error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to run audit scan' },
      { status: 500 },
    )
  }
}
