'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ── Query Keys ────────────────────────────────────────────────────────────────

export const taxProfileKeys = {
  all: ['tax-profiles'] as const,
  list: (tenantId: string) => [...taxProfileKeys.all, 'list', tenantId] as const,
  jurisdictions: () => [...taxProfileKeys.all, 'jurisdictions'] as const,
  codes: (profileId: string) => [...taxProfileKeys.all, 'codes', profileId] as const,
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaxJurisdictionRow {
  id: string
  code: string
  name: string
  country_code: string
  province_code: string | null
  is_active: boolean
}

export interface TaxCodeRow {
  id: string
  tax_profile_id: string
  label: string
  rate: number
  is_default: boolean
  is_active: boolean
  applies_to: string[]
}

export interface TaxProfileRow {
  id: string
  tenant_id: string
  name: string
  jurisdiction_id: string | null
  is_active: boolean
  created_at: string
  tax_codes?: TaxCodeRow[]
}

// ── Jurisdictions ─────────────────────────────────────────────────────────────

export function useTaxJurisdictions() {
  return useQuery({
    queryKey: taxProfileKeys.jurisdictions(),
    queryFn: async () => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('tax_jurisdictions')
        .select('id, code, name, country_code, province_code, is_active')
        .eq('is_active', true)
        .order('name')
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return (data ?? []) as TaxJurisdictionRow[]
    },
    staleTime: 10 * 60 * 1000, // jurisdictions rarely change
  })
}

// ── Tax Profiles ──────────────────────────────────────────────────────────────

export function useTaxProfiles(tenantId: string) {
  return useQuery({
    queryKey: taxProfileKeys.list(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('tax_profiles')
        .select(
          `id, tenant_id, name, jurisdiction_id, is_active, created_at,
           tax_codes!tax_codes_tax_profile_id_fkey(id, label, rate, is_default, is_active, applies_to)`,
        )
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return (data ?? []) as TaxProfileRow[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Create Tax Profile ────────────────────────────────────────────────────────

export function useCreateTaxProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tenantId,
      name,
      jurisdictionId,
    }: {
      tenantId: string
      name: string
      jurisdictionId: string | null
    }) => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('tax_profiles')
        .insert({ tenant_id: tenantId, name, jurisdiction_id: jurisdictionId })
        .select('id')
        .single()
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return data as { id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taxProfileKeys.all })
      toast.success('Tax profile created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Create Tax Code ───────────────────────────────────────────────────────────

export function useCreateTaxCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taxProfileId,
      label,
      rate,
      isDefault,
    }: {
      taxProfileId: string
      label: string
      rate: number
      isDefault: boolean
    }) => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('tax_codes')
        .insert({
          tax_profile_id: taxProfileId,
          label,
          rate,
          is_default: isDefault,
        })
        .select('id')
        .single()
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return data as { id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taxProfileKeys.all })
      toast.success('Tax code added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
