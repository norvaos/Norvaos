/**
 * GET /api/matters/[id]/health-report
 *
 * Generates a client-ready Matter Health Report PDF.
 * - Authenticates via Supabase session
 * - Fetches lean data (< 20 columns per query)
 * - Applies PII Guard: sensitive fields masked
 * - Replaces internal risk badges with client-facing "Status" labels
 * - Returns application/pdf response
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { generateHealthReportPdf, type HealthReportData } from '@/lib/utils/health-report-pdf'

// ── Column Fragments (100/20 compliant) ──────────────────────────────────────

const MATTER_COLS = 'id, title, matter_number, status, readiness_score, risk_level, intake_status, stage_id, stage_entered_at, pipeline_id, billing_type, fee_snapshot' as const
const CONTACT_COLS = 'id, first_name, last_name, email_primary, phone_primary, nationality, immigration_data, custom_fields' as const
const STAGE_COLS = 'id, name, sort_order, color, sla_days, is_terminal' as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ') || 'Unnamed'
}

function formatDuration(enteredAt: string): string {
  const start = new Date(enteredAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (diffDays === 0) {
    if (diffHours === 0) return '< 1h'
    return `${diffHours}h`
  }
  if (diffDays === 1) return `1d ${diffHours}h`
  return `${diffDays}d`
}

// ── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const { id: matterId } = await params
    const { tenantId, supabase } = auth

    // ── 1. Fetch matter (13 columns) ──────────────────────────────────────
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select(MATTER_COLS)
      .eq('id', matterId)
      .eq('tenant_id', tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found' },
        { status: 404 },
      )
    }

    // ── 2. Fetch tenant name ──────────────────────────────────────────────
    const { data: tenant } = await supabase
      .from('tenants')
      .select('firm_name')
      .eq('id', tenantId)
      .single()

    const firmName = (tenant as { firm_name?: string } | null)?.firm_name ?? 'Law Office'

    // ── 3. Fetch primary contact (8 columns) ──────────────────────────────
    let primaryContact: HealthReportData['relationships'] = null

    const { data: mc } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    if (mc?.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select(CONTACT_COLS)
        .eq('id', mc.contact_id)
        .single()

      if (contact) {
        // PII Guard: passport fields are NEVER included in PDF
        const immData = (() => {
          if (contact.immigration_data && typeof contact.immigration_data === 'object') {
            const d = contact.immigration_data as Record<string, string | undefined>
            return { passportExpiry: d.passport_expiry }
          }
          if (contact.custom_fields && typeof contact.custom_fields === 'object') {
            const cf = contact.custom_fields as Record<string, unknown>
            return { passportExpiry: cf.passport_expiry as string | undefined }
          }
          return {}
        })()

        const daysUntilExpiry = immData.passportExpiry
          ? Math.ceil((new Date(immData.passportExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null

        primaryContact = {
          primaryContact: {
            fullName: formatFullName(contact.first_name, contact.last_name),
            role: 'Principal Applicant',
            email: contact.email_primary,
            phone: contact.phone_primary,
            nationality: contact.nationality ?? null,
            // PII Guard: only the expiry WARNING is shown, never the actual number
            passportExpiring: daysUntilExpiry !== null && daysUntilExpiry <= 90,
          },
          teamMembers: [],
        }
      }
    }

    // ── 4. Fetch stages (6 columns) ───────────────────────────────────────
    const matterRow = matter as unknown as Record<string, unknown>
    let stagesData: HealthReportData['stages'] = null
    const pipelineId = matterRow.pipeline_id as string | null

    if (pipelineId) {
      const { data: stages } = await supabase
        .from('matter_stages')
        .select(STAGE_COLS)
        .eq('pipeline_id', pipelineId)
        .order('sort_order', { ascending: true })

      const sortedStages = stages ?? []
      const currentStageId = matterRow.stage_id as string | null
      const stageEnteredAt = matterRow.stage_entered_at as string | null
      const currentIdx = sortedStages.findIndex(s => s.id === currentStageId)
      const pipelineProgress = sortedStages.length > 0 && currentIdx >= 0
        ? Math.round(((currentIdx + 1) / sortedStages.length) * 100)
        : 0

      stagesData = {
        currentStageName: currentIdx >= 0 ? sortedStages[currentIdx]?.name ?? null : null,
        timeInStage: stageEnteredAt ? formatDuration(stageEnteredAt) : ' - ',
        pipelineProgress,
        stages: sortedStages.map((s, idx) => ({
          name: s.name,
          isCurrent: s.id === currentStageId,
          isCompleted: currentIdx >= 0 && idx < currentIdx,
        })),
      }
    }

    // ── 5. Fetch trust balance (1 column) ─────────────────────────────────
    const { data: trustRow } = await supabase
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const trustBalanceCents = (trustRow as { running_balance_cents?: number } | null)?.running_balance_cents ?? 0

    // ── 6. Fetch document slots (3 columns) ───────────────────────────────
    const { data: allSlots } = await supabase
      .from('document_slots')
      .select('id, is_required, status')
      .eq('matter_id', matterId)
      .eq('is_active', true)

    const slots = allSlots ?? []
    const totalSlots = slots.length
    const emptySlots = slots.filter(s => !s.status || s.status === 'pending')
    const uploadedSlots = slots.filter(s => s.status === 'uploaded')
    const acceptedSlots = slots.filter(s => s.status === 'accepted')
    const pendingReviewSlots = slots.filter(s => s.status === 'pending_review')
    const filledCount = totalSlots - emptySlots.length
    const completionPct = totalSlots > 0 ? Math.round((filledCount / totalSlots) * 100) : 0

    // ── 7. Build financials ───────────────────────────────────────────────
    const feeSnap = (() => {
      const raw = matterRow.fee_snapshot as Record<string, unknown> | null
      if (raw && typeof raw === 'object') {
        return {
          totalCents: (raw.total_amount_cents as number) ?? 0,
        }
      }
      return { totalCents: 0 }
    })()

    const outstandingCents = Math.max(0, feeSnap.totalCents - Math.max(0, trustBalanceCents))

    // ── 8. Build readiness data ───────────────────────────────────────────
    const readinessScore = (matterRow.readiness_score as number) ?? 0

    // ── 9. Assemble report data ───────────────────────────────────────────
    const reportData: HealthReportData = {
      matterTitle: (matterRow.title as string) ?? 'Untitled Matter',
      matterNumber: (matterRow.matter_number as string) ?? null,
      firmName,
      generatedAt: new Date().toISOString(),

      readiness: {
        overallScore: readinessScore,
        completionPct: readinessScore,
        intakeStatus: (matterRow.intake_status as string) ?? null,
        domains: [], // Readiness domains require a separate API call  -  omitted for lean PDF
      },

      relationships: primaryContact,

      stages: stagesData,

      financials: {
        trustBalanceCents,
        totalBilledCents: feeSnap.totalCents,
        totalPaidCents: Math.max(0, trustBalanceCents),
        outstandingCents,
        financialHealth:
          trustBalanceCents < 0 ? 'critical' : trustBalanceCents === 0 ? 'warning' : 'healthy',
      },

      documents: {
        totalSlots,
        completionPct,
        uploaded: uploadedSlots.length,
        accepted: acceptedSlots.length,
        pendingReview: pendingReviewSlots.length,
        empty: emptySlots.length,
        mandatorySlots: slots.filter(s => s.is_required).length,
      },
    }

    // ── 10. Generate PDF ──────────────────────────────────────────────────
    const pdfBytes = await generateHealthReportPdf(reportData)

    const filename = `health-report-${(matterRow.matter_number as string) ?? matterId}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: (error as AuthError & { status?: number }).status ?? 401 },
      )
    }
    console.error('[health-report] PDF generation failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate report' },
      { status: 500 },
    )
  }
}
