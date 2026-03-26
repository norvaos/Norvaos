import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { toast } from 'sonner'

// ─── Constants ───────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  'assignment',
  'key_dates',
  'contacts',
  'case_config',
  'notifications',
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]

export interface OnboardingStep {
  step_key: OnboardingStepKey
  confirmed_at: string | null
  confirmed_by: string | null
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const onboardingKeys = {
  all: ['matter_onboarding_steps'] as const,
  matter: (matterId: string) => [...onboardingKeys.all, matterId] as const,
}

// ─── Fetch onboarding steps for a matter ─────────────────────────────────────

export function useMatterOnboardingSteps(matterId: string) {
  const { tenant } = useTenant()

  return useQuery({
    queryKey: onboardingKeys.matter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('matter_onboarding_steps')
        .select('step_key, confirmed_at, confirmed_by')
        .eq('matter_id', matterId)

      // Gracefully handle missing table (migration not yet run)
      if (error) {
        if (error.code === '42P01') return {} // table does not exist yet
        throw error
      }

      // Return a map of step_key → step data
      const map: Record<string, OnboardingStep> = {}
      for (const row of data ?? []) {
        map[row.step_key] = row as OnboardingStep
      }
      return map
    },
    enabled: !!matterId && !!tenant,
    staleTime: 1000 * 30, // 30s  -  onboarding state changes infrequently
  })
}

// ─── Computed: how many steps are incomplete ──────────────────────────────────

export function useOnboardingBadgeCount(matterId: string) {
  const { data: steps } = useMatterOnboardingSteps(matterId)

  if (!steps) return ONBOARDING_STEPS.length

  const confirmedCount = ONBOARDING_STEPS.filter(
    (key) => steps[key]?.confirmed_at != null
  ).length

  return ONBOARDING_STEPS.length - confirmedCount
}

// ─── Confirm a step ──────────────────────────────────────────────────────────

export function useConfirmOnboardingStep() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      stepKey,
    }: {
      matterId: string
      stepKey: OnboardingStepKey
    }) => {
      const supabase = createClient()
      if (!tenant || !appUser) throw new Error('No session')

      const { error } = await (supabase as any)
        .from('matter_onboarding_steps')
        .upsert(
          {
            tenant_id: tenant.id,
            matter_id: matterId,
            step_key: stepKey,
            confirmed_at: new Date().toISOString(),
            confirmed_by: appUser.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'matter_id,step_key' }
        )

      if (error) throw error
    },
    onSuccess: (_, { matterId }) => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.matter(matterId) })
      toast.success('Step confirmed')
    },
    onError: (err) => {
      toast.error('Failed to confirm step', { description: (err as Error).message })
    },
  })
}

// ─── Unconfirm a step (revert) ───────────────────────────────────────────────

export function useUnconfirmOnboardingStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      stepKey,
    }: {
      matterId: string
      stepKey: OnboardingStepKey
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('matter_onboarding_steps')
        .update({ confirmed_at: null, confirmed_by: null })
        .eq('matter_id', matterId)
        .eq('step_key', stepKey)

      if (error) throw error
    },
    onSuccess: (_, { matterId }) => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.matter(matterId) })
    },
  })
}
