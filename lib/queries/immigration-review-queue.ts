/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Review Queue — TanStack Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Server-side filtered query for the immigration review queue.
 * Joins matters + matter_intake + document slot counts to provide
 * a cross-matter view of all immigration work needing attention.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewQueueFilter =
  | 'pending_review'         // docs awaiting staff review
  | 'deficiency'             // status = deficiency_outstanding
  | 'blocked_from_drafting'  // status = intake_complete (rules not met for drafting)
  | 'ready_for_generation'   // status = drafting_enabled
  | 'lawyer_review'          // lawyer_review_status = pending
  | 'all'

export interface ReviewQueueParams {
  tenantId: string
  filter?: ReviewQueueFilter
  responsibleLawyerId?: string
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export interface ReviewQueueItem {
  matterId: string
  matterNumber: string
  matterTitle: string
  matterType: string
  programCategory: string | null
  immigrationIntakeStatus: string
  lawyerReviewStatus: string
  completionPct: number
  responsibleLawyerId: string | null
  pendingReviewCount: number
  deficientCount: number
  contradictionCount: number
  stalePacks: number
  lastActivityAt: string | null
  createdAt: string
}

export interface ReviewQueueResult {
  items: ReviewQueueItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const reviewQueueKeys = {
  all: ['immigration-review-queue'] as const,
  list: (params: ReviewQueueParams) =>
    ['immigration-review-queue', params] as const,
}

// ── Main Hook ────────────────────────────────────────────────────────────────

export function useImmigrationReviewQueue(params: ReviewQueueParams) {
  const {
    tenantId,
    filter = 'all',
    responsibleLawyerId,
    search,
    page = 1,
    pageSize = 25,
    sortBy = 'created_at',
    sortDirection = 'desc',
  } = params

  return useQuery({
    queryKey: reviewQueueKeys.list(params),
    queryFn: async (): Promise<ReviewQueueResult> => {
      const supabase = createClient()

      // ── 1. Fetch matters with intake data ─────────────────────────────

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      // Base query: immigration matters with intake records
      let query = supabase
        .from('matters')
        .select(
          `
          id,
          tenant_id,
          title,
          matter_number,
          matter_type,
          responsible_lawyer_id,
          created_at,
          updated_at,
          matter_intake!inner (
            program_category,
            immigration_intake_status,
            lawyer_review_status,
            completion_pct,
            contradiction_flags,
            imm_status_changed_at
          )
        `,
          { count: 'exact' }
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .not('matter_intake.program_category', 'is', null)

      // Apply queue filter
      if (filter === 'pending_review') {
        query = query.eq(
          'matter_intake.immigration_intake_status',
          'review_required'
        )
      } else if (filter === 'deficiency') {
        query = query.eq(
          'matter_intake.immigration_intake_status',
          'deficiency_outstanding'
        )
      } else if (filter === 'blocked_from_drafting') {
        query = query.eq(
          'matter_intake.immigration_intake_status',
          'intake_complete'
        )
      } else if (filter === 'ready_for_generation') {
        query = query.eq(
          'matter_intake.immigration_intake_status',
          'drafting_enabled'
        )
      } else if (filter === 'lawyer_review') {
        query = query.eq('matter_intake.lawyer_review_status', 'pending')
      }
      // 'all' = no filter on status

      // Filter by lawyer
      if (responsibleLawyerId) {
        query = query.eq('responsible_lawyer_id', responsibleLawyerId)
      }

      // Text search
      if (search?.trim()) {
        query = query.or(
          `title.ilike.%${search.trim()}%,matter_number.ilike.%${search.trim()}%`
        )
      }

      // Sort and paginate
      query = query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to)

      const { data: matters, error, count } = await query

      if (error) throw error
      if (!matters || matters.length === 0) {
        return {
          items: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 0,
        }
      }

      // ── 2. Batch fetch document slot counts ───────────────────────────

      const matterIds = matters.map((m) => m.id)

      const { data: slotCounts } = await supabase
        .from('document_slots')
        .select('matter_id, status')
        .in('matter_id', matterIds)
        .eq('is_active', true)

      // Group slot counts by matter
      const slotsByMatter: Record<
        string,
        { pendingReview: number; deficient: number }
      > = {}
      for (const slot of slotCounts ?? []) {
        if (!slotsByMatter[slot.matter_id]) {
          slotsByMatter[slot.matter_id] = { pendingReview: 0, deficient: 0 }
        }
        if (slot.status === 'pending_review') {
          slotsByMatter[slot.matter_id].pendingReview++
        } else if (
          slot.status === 'needs_re_upload' ||
          slot.status === 'rejected'
        ) {
          slotsByMatter[slot.matter_id].deficient++
        }
      }

      // ── 3. Batch fetch stale pack counts ──────────────────────────────

      const { data: stalePacks } = await supabase
        .from('form_pack_versions')
        .select('matter_id')
        .in('matter_id', matterIds)
        .eq('is_stale', true)
        .not('status', 'eq', 'superseded')

      const staleByMatter: Record<string, number> = {}
      for (const pack of stalePacks ?? []) {
        staleByMatter[pack.matter_id] =
          (staleByMatter[pack.matter_id] ?? 0) + 1
      }

      // ── 4. Map to ReviewQueueItem ─────────────────────────────────────

      const items: ReviewQueueItem[] = matters.map((m) => {
        // matter_intake is returned as an array from the join; take first
        const intake = Array.isArray(m.matter_intake)
          ? m.matter_intake[0]
          : m.matter_intake

        const contradictionFlags = Array.isArray(intake?.contradiction_flags)
          ? intake.contradiction_flags
          : []
        const blockingCount = contradictionFlags.filter(
          (f: unknown) =>
            typeof f === 'object' &&
            f !== null &&
            (f as Record<string, unknown>).severity === 'blocking'
        ).length

        const slotData = slotsByMatter[m.id] ?? {
          pendingReview: 0,
          deficient: 0,
        }

        return {
          matterId: m.id,
          matterNumber: m.matter_number ?? '',
          matterTitle: m.title ?? '',
          matterType: m.matter_type ?? '',
          programCategory: intake?.program_category ?? null,
          immigrationIntakeStatus:
            intake?.immigration_intake_status ?? 'not_issued',
          lawyerReviewStatus:
            intake?.lawyer_review_status ?? 'not_required',
          completionPct: intake?.completion_pct ?? 0,
          responsibleLawyerId: m.responsible_lawyer_id,
          pendingReviewCount: slotData.pendingReview,
          deficientCount: slotData.deficient,
          contradictionCount: blockingCount,
          stalePacks: staleByMatter[m.id] ?? 0,
          lastActivityAt: intake?.imm_status_changed_at ?? m.updated_at,
          createdAt: m.created_at,
        }
      })

      return {
        items,
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}
