import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useUpdateUserLocale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, locale }: { userId: string; locale: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ locale_preference: locale })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}
