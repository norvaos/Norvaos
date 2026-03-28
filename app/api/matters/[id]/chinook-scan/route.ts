/**
 * POST /api/matters/[id]/chinook-scan  (legacy route — use /audit-scan instead)
 *
 * Regulator-Mirror 3.0 Audit-Optimizer — Pre-submission IRCC AI-readability audit.
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
// Audit-Optimizer scanner (legacy path retained for import compatibility)
import { scanDocument } from '@/lib/services/chinook-optimizer/scanner'

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

    // Run the IRCC readability scanner
    const result = scanDocument(documentText, caseType)

    // Persist to audit_optimizer_scans (DB table: chinook_scans — retained for schema compatibility)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scan, error: insertError } = await (supabase as any)
      .from('chinook_scans')
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
      console.error('[Regulator-Mirror] Failed to persist scan:', insertError)
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
    console.error('[Regulator-Mirror] Scan error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to run IRCC readability scan' },
      { status: 500 },
    )
  }
}
