import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/matters/[id]/chain-of-custody
 *
 * Chain of Custody Report — Directive 2.5
 *
 * Invokes sentinel_chain_of_custody() RPC which aggregates all security events
 * for a matter into a single JSONB report for Law Society audit compliance.
 *
 * Sections:
 *   - PII reveals (who accessed what, when, why)
 *   - Document hash verifications (tamper status)
 *   - Identity verifications (KYC records)
 *   - Form generation events
 *   - Tamper alerts
 *   - Emergency lockdowns
 *
 * Query params:
 *   ?format=json (default) — raw JSONB
 *   ?format=pdf — generates PDF via pdf-lib (future)
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const { id: matterId } = await params
    const url = new URL(request.url)
    const format = url.searchParams.get('format') ?? 'json'

    const supabase = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('sentinel_chain_of_custody', {
      p_matter_id: matterId,
      p_tenant_id: auth.tenantId,
    })

    if (error) {
      console.error('[SENTINEL] Chain of custody RPC error:', error)
      return NextResponse.json({ error: 'Failed to generate custody report' }, { status: 500 })
    }

    // Enrich with matter metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matter } = await (supabase as any)
      .from('matters')
      .select('title, file_number, status, created_at')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    const report = {
      ...data,
      matter_title: matter?.title ?? null,
      file_number: matter?.file_number ?? null,
      matter_status: matter?.status ?? null,
      matter_created_at: matter?.created_at ?? null,
      report_generated_by: auth.userId,
    }

    if (format === 'pdf') {
      // PDF generation — build a structured document from the report data
      const pdfBytes = await generateCustodyPdf(report)

      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="chain-of-custody-${matter?.file_number ?? matterId}.pdf"`,
        },
      })
    }

    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[SENTINEL] Chain of custody error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PDF Generation ──────────────────────────────────────────────────────────

interface CustodyReport {
  matter_id: string
  matter_title: string | null
  file_number: string | null
  matter_status: string | null
  generated_at: string
  pii_reveals: Array<{ timestamp: string; user_id: string; field_name: string; reason: string; severity: string }>
  document_verifications: Array<{ document_id: string; file_name: string; content_hash: string; tamper_status: string; verified_at: string }>
  identity_verifications: Array<{ contact_id: string; provider: string; method: string; status: string; confidence_score: number; document_type: string }>
  form_generations: Array<{ timestamp: string; user_id: string; form_code: string; version: string; status: string }>
  tamper_alerts: Array<{ timestamp: string; file_name: string; expected_hash: string; actual_hash: string; severity: string }>
  lockdowns: Array<{ locked_at: string; user_id: string; trigger: string; is_active: boolean; unlocked_at: string | null }>
  summary: Record<string, number>
}

async function generateCustodyPdf(report: CustodyReport): Promise<Uint8Array> {
  // Dynamic import to avoid bundling pdf-lib on every request
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN = 50
  const LINE_HEIGHT = 14
  const SECTION_GAP = 20

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  function addText(text: string, size: number, bold = false, colour = rgb(0, 0, 0)) {
    const f = bold ? boldFont : font
    if (y < MARGIN + 40) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    page.drawText(text, { x: MARGIN, y, size, font: f, color: colour })
    y -= size + 4
  }

  function addLine() {
    if (y < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })
    y -= 8
  }

  // ── Header ──
  addText('SENTINEL — Chain of Custody Report', 18, true)
  addText(`Generated: ${new Date(report.generated_at).toLocaleString('en-CA')}`, 10)
  addLine()

  // ── Matter Info ──
  addText('Matter Information', 14, true)
  addText(`Title: ${report.matter_title ?? 'N/A'}`, 10)
  addText(`File Number: ${report.file_number ?? 'N/A'}`, 10)
  addText(`Status: ${report.matter_status ?? 'N/A'}`, 10)
  addText(`Matter ID: ${report.matter_id}`, 9, false, rgb(0.5, 0.5, 0.5))
  y -= SECTION_GAP

  // ── Summary ──
  addText('Summary', 14, true)
  const s = report.summary
  for (const [key, val] of Object.entries(s)) {
    const label = key.replace(/^total_/, '').replace(/_/g, ' ')
    addText(`  ${label}: ${val}`, 10)
  }
  y -= SECTION_GAP

  // ── PII Reveals ──
  if (report.pii_reveals.length > 0) {
    addLine()
    addText(`PII Reveals (${report.pii_reveals.length})`, 12, true)
    for (const ev of report.pii_reveals) {
      addText(
        `  ${ev.timestamp ? new Date(ev.timestamp).toLocaleString('en-CA') : '—'}  |  Field: ${ev.field_name ?? '—'}  |  Reason: ${ev.reason ?? '—'}  |  Severity: ${ev.severity}`,
        9,
      )
    }
    y -= SECTION_GAP
  }

  // ── Document Verifications ──
  if (report.document_verifications.length > 0) {
    addLine()
    addText(`Document Integrity Checks (${report.document_verifications.length})`, 12, true)
    for (const d of report.document_verifications) {
      const status = d.tamper_status === 'tampered'
        ? 'TAMPERED'
        : d.tamper_status === 'verified' ? 'Verified' : d.tamper_status
      addText(
        `  ${d.file_name}  |  Hash: ${d.content_hash}  |  Status: ${status}`,
        9,
        false,
        d.tamper_status === 'tampered' ? rgb(0.8, 0, 0) : rgb(0, 0, 0),
      )
    }
    y -= SECTION_GAP
  }

  // ── Identity Verifications ──
  if (report.identity_verifications.length > 0) {
    addLine()
    addText(`Identity Verifications (${report.identity_verifications.length})`, 12, true)
    for (const iv of report.identity_verifications) {
      addText(
        `  Provider: ${iv.provider}  |  Method: ${iv.method}  |  Status: ${iv.status}  |  Confidence: ${iv.confidence_score ?? '—'}%`,
        9,
      )
    }
    y -= SECTION_GAP
  }

  // ── Form Generations ──
  if (report.form_generations.length > 0) {
    addLine()
    addText(`Form Generations (${report.form_generations.length})`, 12, true)
    for (const fg of report.form_generations) {
      addText(
        `  ${fg.timestamp ? new Date(fg.timestamp).toLocaleString('en-CA') : '—'}  |  Form: ${fg.form_code ?? '—'}  |  v${fg.version ?? '?'}  |  ${fg.status}`,
        9,
      )
    }
    y -= SECTION_GAP
  }

  // ── Tamper Alerts ──
  if (report.tamper_alerts.length > 0) {
    addLine()
    addText(`Tamper Alerts (${report.tamper_alerts.length})`, 12, true, rgb(0.8, 0, 0))
    for (const ta of report.tamper_alerts) {
      addText(
        `  ${ta.timestamp ? new Date(ta.timestamp).toLocaleString('en-CA') : '—'}  |  ${ta.file_name}  |  Expected: ${ta.expected_hash}  |  Actual: ${ta.actual_hash}`,
        9,
        false,
        rgb(0.8, 0, 0),
      )
    }
    y -= SECTION_GAP
  }

  // ── Lockdowns ──
  if (report.lockdowns.length > 0) {
    addLine()
    addText(`Emergency Lockdowns (${report.lockdowns.length})`, 12, true, rgb(0.6, 0, 0))
    for (const ld of report.lockdowns) {
      const status = ld.is_active ? 'ACTIVE' : `Resolved ${ld.unlocked_at ? new Date(ld.unlocked_at).toLocaleString('en-CA') : ''}`
      addText(
        `  ${new Date(ld.locked_at).toLocaleString('en-CA')}  |  Trigger: ${ld.trigger}  |  ${status}`,
        9,
        false,
        ld.is_active ? rgb(0.8, 0, 0) : rgb(0.3, 0.3, 0.3),
      )
    }
    y -= SECTION_GAP
  }

  // ── Footer ──
  addLine()
  addText('This report is generated from the immutable SENTINEL audit trail.', 8, false, rgb(0.5, 0.5, 0.5))
  addText('Any tampering with this report is detectable via hash verification.', 8, false, rgb(0.5, 0.5, 0.5))

  return doc.save()
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/chain-of-custody')
