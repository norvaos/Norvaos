/**
 * GET /api/client/progress/[token]
 *
 * Client-facing progress API — returns stage pipeline + missing documents.
 *
 * Security (Sentinel):
 * - Token lookup via portal_links (admin client, no RLS bypass exposed)
 * - Hard-locked to contact_id from portal_links row
 * - No user-supplied matter_id or tenant_id accepted
 * - All queries scoped to link.matter_id derived from token lookup
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Column Fragments (100/20 compliant) ──────────────────────────────────────

const MATTER_COLS = 'id, title, matter_number, status, pipeline_id, stage_id, stage_entered_at' as const
const STAGE_COLS = 'id, name, sort_order, color, sla_days, is_terminal' as const
const SLOT_COLS = 'id, slot_name, category, is_required, status, description' as const

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const admin = createAdminClient()

    // ── 1. Sentinel: Token lookup ─────────────────────────────────────────
    const { data: link, error: linkErr } = await admin
      .from('portal_links')
      .select('id, matter_id, contact_id, tenant_id, expires_at, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (linkErr || !link) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired link' },
        { status: 403 },
      )
    }

    // ── 2. Sentinel: Expiry check ─────────────────────────────────────────
    if (link.expires_at !== null && new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This link has expired' },
        { status: 403 },
      )
    }

    // ── 3. Sentinel: contact_id hard-lock ─────────────────────────────────
    // The portal link MUST have a contact_id to use this endpoint.
    // This ensures data is scoped to the specific client.
    if (!link.contact_id) {
      return NextResponse.json(
        { success: false, error: 'Access denied — no contact association' },
        { status: 403 },
      )
    }

    const matterId = link.matter_id
    if (!matterId) {
      return NextResponse.json(
        { success: false, error: 'No matter linked' },
        { status: 404 },
      )
    }

    // ── 4. Fetch matter (7 columns) ───────────────────────────────────────
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select(MATTER_COLS)
      .eq('id', matterId)
      .eq('tenant_id', link.tenant_id)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found' },
        { status: 404 },
      )
    }

    // ── 5. Sentinel: Verify contact is linked to this matter ──────────────
    const { count: contactLinkCount } = await admin
      .from('matter_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('matter_id', matterId)
      .eq('contact_id', link.contact_id)

    if (!contactLinkCount || contactLinkCount === 0) {
      // Fallback: check matter_people table
      const { count: peopleCount } = await admin
        .from('matter_people')
        .select('id', { count: 'exact', head: true })
        .eq('matter_id', matterId)
        .eq('contact_id', link.contact_id)
        .eq('is_active', true)

      if (!peopleCount || peopleCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Access denied — contact not linked to this matter' },
          { status: 403 },
        )
      }
    }

    // ── 6. Fetch stages (6 columns) ───────────────────────────────────────
    const matterRow = matter as unknown as Record<string, unknown>
    const pipelineId = matterRow.pipeline_id as string | null
    let stagesPayload: {
      currentStageName: string | null
      timeInStage: string
      pipelineProgress: number
      stages: {
        name: string
        color: string
        isCurrent: boolean
        isCompleted: boolean
      }[]
    } | null = null

    if (pipelineId) {
      const { data: stages } = await admin
        .from('matter_stages')
        .select(STAGE_COLS)
        .eq('pipeline_id', pipelineId)
        .order('sort_order', { ascending: true })

      const sorted = stages ?? []
      const currentStageId = matterRow.stage_id as string | null
      const stageEnteredAt = matterRow.stage_entered_at as string | null
      const currentIdx = sorted.findIndex(s => s.id === currentStageId)
      const progress = sorted.length > 0 && currentIdx >= 0
        ? Math.round(((currentIdx + 1) / sorted.length) * 100)
        : 0

      stagesPayload = {
        currentStageName: currentIdx >= 0 ? sorted[currentIdx]?.name ?? null : null,
        timeInStage: stageEnteredAt ? formatDuration(stageEnteredAt) : '—',
        pipelineProgress: progress,
        stages: sorted.map((s, idx) => ({
          name: s.name,
          color: s.color ?? '#6366f1',
          isCurrent: s.id === currentStageId,
          isCompleted: currentIdx >= 0 && idx < currentIdx,
        })),
      }
    }

    // ── 7. Fetch document slots (6 columns) ───────────────────────────────
    const { data: allSlots } = await admin
      .from('document_slots')
      .select(SLOT_COLS)
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const slots = allSlots ?? []
    const totalSlots = slots.length
    const accepted = slots.filter(s => s.status === 'accepted').length
    const pendingReview = slots.filter(s => s.status === 'pending_review').length
    const needsReUpload = slots.filter(s => s.status === 'needs_re_upload').length
    const empty = slots.filter(s => !s.status || s.status === 'pending' || s.status === 'empty').length
    const filled = totalSlots - empty
    const completionPct = totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0

    // Missing = empty + needs_re_upload (action required by client)
    const missingDocs = slots
      .filter(s => !s.status || s.status === 'pending' || s.status === 'empty' || s.status === 'needs_re_upload')
      .map(s => ({
        id: s.id,
        name: s.slot_name ?? 'Unnamed',
        category: s.category ?? '',
        isRequired: s.is_required ?? false,
        needsReUpload: s.status === 'needs_re_upload',
        description: s.description ?? null,
      }))

    // ── 8. Build response ─────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        matterTitle: (matterRow.title as string) ?? 'Your Case',
        matterNumber: (matterRow.matter_number as string) ?? null,
        matterStatus: (matterRow.status as string) ?? 'active',

        stages: stagesPayload,

        documents: {
          totalSlots,
          accepted,
          pendingReview,
          needsReUpload,
          empty,
          completionPct,
          missingDocs,
        },
      },
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('[client-progress] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load progress data' },
      { status: 500 },
    )
  }
}
