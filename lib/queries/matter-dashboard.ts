'use client'

import { useQueries, type QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/types/database'

// ─── Column Fragment ─────────────────────────────────────────────────────────

export const MATTER_DASHBOARD_COLUMNS =
  'id, title, matter_number, status, priority, readiness_score, risk_level, practice_area_id, matter_type_id, matter_type, responsible_lawyer_id, billing_type, date_opened, fee_snapshot, total_amount_cents, stage_id, stage_entered_at, pipeline_id, intake_status, created_at' as const

/** Shape returned by the selective matter query */
export interface DashboardMatter {
  id: string
  title: string | null
  matter_number: string | null
  status: string | null
  priority: string | null
  readiness_score: number | null
  risk_level: string | null
  practice_area_id: string | null
  matter_type_id: string | null
  matter_type: string | null
  responsible_lawyer_id: string | null
  billing_type: string | null
  date_opened: string | null
  fee_snapshot: Json | null
  total_amount_cents: number | null
  stage_id: string | null
  stage_entered_at: string | null
  pipeline_id: string | null
  intake_status: string | null
  created_at: string
}

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const dashboardKeys = {
  all: ['matter-dashboard'] as const,
  core: (matterId: string) => [...dashboardKeys.all, 'core', matterId] as const,
  contact: (matterId: string) => [...dashboardKeys.all, 'contact', matterId] as const,
  trust: (matterId: string) => [...dashboardKeys.all, 'trust', matterId] as const,
  recentTx: (matterId: string) => [...dashboardKeys.all, 'recent-tx', matterId] as const,
  slots: (matterId: string) => [...dashboardKeys.all, 'slots', matterId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardContact {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
  phone_primary: string | null
  date_of_birth: string | null
  nationality: string | null
  immigration_status: string | null
  immigration_data: Json | null
  custom_fields: Json | null
}

export interface DashboardSlot {
  id: string
  slot_name: string
  slot_slug: string
  is_required: boolean
  sort_order: number
  category: string
}

/** Lean shape for the last 5 trust transactions (Vitality Header only). */
export interface DashboardTrustTransaction {
  id: string
  created_at: string
  transaction_type: string
  amount_cents: number
  running_balance_cents: number
}

// ─── useMatterDashboard ──────────────────────────────────────────────────────

/**
 * Parallel-fetch all data needed for the matter dashboard view.
 * Uses useQueries to fire 4 independent requests simultaneously.
 */
export function useMatterDashboard(matterId: string) {
  const results = useQueries({
    queries: [
      // 1. Matter core data
      {
        queryKey: dashboardKeys.core(matterId),
        queryFn: async (): Promise<DashboardMatter> => {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('matters')
            .select(MATTER_DASHBOARD_COLUMNS)
            .eq('id', matterId)
            .single()
          if (error) throw error
          return data as unknown as DashboardMatter
        },
        enabled: !!matterId,
        staleTime: 1000 * 60 * 2, // 2 min
      },

      // 2. Primary contact (two-step: matter_contacts → contacts)
      {
        queryKey: dashboardKeys.contact(matterId),
        queryFn: async (): Promise<DashboardContact | null> => {
          const supabase = createClient()

          // Step 1: find the primary client contact_id
          const { data: mc, error: mcError } = await supabase
            .from('matter_contacts')
            .select('contact_id')
            .eq('matter_id', matterId)
            .eq('role', 'client')
            .eq('is_primary', true)
            .limit(1)
            .single()

          if (mcError) {
            // PGRST116 = no rows — not an error, just no primary contact
            if (mcError.code === 'PGRST116') return null
            throw mcError
          }

          if (!mc?.contact_id) return null

          // Step 2: fetch contact details
          const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select(
              'id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, immigration_status, immigration_data, custom_fields'
            )
            .eq('id', mc.contact_id)
            .single()

          if (contactError) throw contactError
          return contact as DashboardContact
        },
        enabled: !!matterId,
        staleTime: 1000 * 60 * 5, // 5 min
      },

      // 3. Trust balance (latest running balance)
      {
        queryKey: dashboardKeys.trust(matterId),
        queryFn: async () => {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('trust_transactions')
            .select('running_balance_cents')
            .eq('matter_id', matterId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (error) throw error
          return data ?? { running_balance_cents: 0 }
        },
        enabled: !!matterId,
        staleTime: 1000 * 30, // 30 sec — money data stays fresh
      },

      // 4. Last 5 trust transactions (lean: 5 cols, 5 rows max)
      {
        queryKey: dashboardKeys.recentTx(matterId),
        queryFn: async (): Promise<DashboardTrustTransaction[]> => {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('trust_transactions')
            .select('id, created_at, transaction_type, amount_cents, running_balance_cents')
            .eq('matter_id', matterId)
            .order('created_at', { ascending: false })
            .limit(5)

          if (error) throw error
          return (data ?? []) as DashboardTrustTransaction[]
        },
        enabled: !!matterId,
        staleTime: 1000 * 30, // 30 sec — money data stays fresh
      },

      // 5. Empty / pending document slots
      {
        queryKey: dashboardKeys.slots(matterId),
        queryFn: async (): Promise<DashboardSlot[]> => {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('document_slots')
            .select('id, slot_name, slot_slug, is_required, sort_order, category')
            .eq('matter_id', matterId)
            .eq('is_active', true)
            .or('status.is.null,status.eq.pending')
            .order('sort_order', { ascending: true })

          if (error) throw error
          return (data ?? []) as DashboardSlot[]
        },
        enabled: !!matterId,
        staleTime: 1000 * 60, // 1 min
      },
    ],
  })

  const [matterQuery, contactQuery, trustQuery, recentTxQuery, slotsQuery] = results

  return {
    matter: (matterQuery.data as DashboardMatter | undefined) ?? null,
    contact: (contactQuery.data as DashboardContact | null | undefined) ?? null,
    trustBalance: (trustQuery.data as { running_balance_cents: number } | undefined) ?? { running_balance_cents: 0 },
    recentTransactions: (recentTxQuery.data as DashboardTrustTransaction[] | undefined) ?? [],
    emptySlots: (slotsQuery.data as DashboardSlot[] | undefined) ?? [],
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  }
}

// ─── Prefetch ────────────────────────────────────────────────────────────────

/**
 * Prefetch the matter core query for use in onMouseEnter handlers.
 * Warms the cache so navigating to the dashboard feels instant.
 */
export function prefetchMatterDashboard(queryClient: QueryClient, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: dashboardKeys.core(matterId),
    queryFn: async (): Promise<DashboardMatter> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select(MATTER_DASHBOARD_COLUMNS)
        .eq('id', matterId)
        .single()
      if (error) throw error
      return data as unknown as DashboardMatter
    },
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * Prefetch only the primary contact for a matter.
 * Useful for components that need just the contact, not the full dashboard.
 */
export function prefetchPrimaryContact(queryClient: QueryClient, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: dashboardKeys.contact(matterId),
    queryFn: async (): Promise<DashboardContact | null> => {
      const supabase = createClient()
      const { data: mc, error: mcError } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('role', 'client')
        .eq('is_primary', true)
        .limit(1)
        .single()
      if (mcError) {
        if (mcError.code === 'PGRST116') return null
        throw mcError
      }
      if (!mc?.contact_id) return null
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, immigration_status, immigration_data, custom_fields')
        .eq('id', mc.contact_id)
        .single()
      if (contactError) throw contactError
      return contact as DashboardContact
    },
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Prefetch ALL 4 dashboard queries in parallel.
 * Use on route prefetch or eager hover to fully warm the cache
 * so the dashboard renders instantly with no loading spinners.
 */
export function prefetchMatterFull(queryClient: QueryClient, matterId: string) {
  return Promise.all([
    // 1. Core matter data
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.core(matterId),
      queryFn: async (): Promise<DashboardMatter> => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('matters')
          .select(MATTER_DASHBOARD_COLUMNS)
          .eq('id', matterId)
          .single()
        if (error) throw error
        return data as unknown as DashboardMatter
      },
      staleTime: 1000 * 60 * 2,
    }),

    // 2. Primary contact (two-step: matter_contacts → contacts)
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.contact(matterId),
      queryFn: async (): Promise<DashboardContact | null> => {
        const supabase = createClient()

        // Step 1: find the primary client contact_id
        const { data: mc, error: mcError } = await supabase
          .from('matter_contacts')
          .select('contact_id')
          .eq('matter_id', matterId)
          .eq('role', 'client')
          .eq('is_primary', true)
          .limit(1)
          .single()

        if (mcError) {
          // PGRST116 = no rows — not an error, just no primary contact
          if (mcError.code === 'PGRST116') return null
          throw mcError
        }

        if (!mc?.contact_id) return null

        // Step 2: fetch contact details
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .select(
            'id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, immigration_status, immigration_data, custom_fields'
          )
          .eq('id', mc.contact_id)
          .single()

        if (contactError) throw contactError
        return contact as DashboardContact
      },
      staleTime: 1000 * 60 * 5,
    }),

    // 3. Trust balance (latest running balance)
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.trust(matterId),
      queryFn: async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('trust_transactions')
          .select('running_balance_cents')
          .eq('matter_id', matterId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) throw error
        return data ?? { running_balance_cents: 0 }
      },
      staleTime: 1000 * 30,
    }),

    // 4. Last 5 trust transactions
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.recentTx(matterId),
      queryFn: async (): Promise<DashboardTrustTransaction[]> => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('trust_transactions')
          .select('id, created_at, transaction_type, amount_cents, running_balance_cents')
          .eq('matter_id', matterId)
          .order('created_at', { ascending: false })
          .limit(5)
        if (error) throw error
        return (data ?? []) as DashboardTrustTransaction[]
      },
      staleTime: 1000 * 30,
    }),

    // 5. Empty / pending document slots
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.slots(matterId),
      queryFn: async (): Promise<DashboardSlot[]> => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('document_slots')
          .select('id, slot_name, slot_slug, is_required, sort_order, category')
          .eq('matter_id', matterId)
          .eq('is_active', true)
          .or('status.is.null,status.eq.pending')
          .order('sort_order', { ascending: true })

        if (error) throw error
        return (data ?? []) as DashboardSlot[]
      },
      staleTime: 1000 * 60,
    }),
  ])
}

/**
 * Prefetch just the trust balance for a matter.
 * Useful for lightweight hover prefetch where only the balance is needed.
 */
export function prefetchTrustBalance(queryClient: QueryClient, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: dashboardKeys.trust(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('trust_transactions')
        .select('running_balance_cents')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ?? { running_balance_cents: 0 }
    },
    staleTime: 1000 * 30,
  })
}

/**
 * Prefetch only the document slots query for a matter.
 * Useful for warming the cache before navigating to a document-heavy view.
 */
export function prefetchDocumentSlots(queryClient: QueryClient, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: dashboardKeys.slots(matterId),
    queryFn: async (): Promise<DashboardSlot[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slots')
        .select('id, slot_name, slot_slug, is_required, sort_order, category')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .or('status.is.null,status.eq.pending')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as DashboardSlot[]
    },
    staleTime: 1000 * 60,
  })
}