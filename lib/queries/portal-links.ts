import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type PortalLink = Database['public']['Tables']['portal_links']['Row']

/** Shape of the metadata JSONB stored on each portal link */
export interface PortalLinkMetadata {
  /** Custom welcome message shown at the top of the portal */
  welcome_message?: string
  /** Instructions for the client on what to upload (overrides matter-type defaults) */
  instructions?: string
  /** Lawyer's display name shown on the portal */
  lawyer_name?: string
  /** Lawyer's email for client to reach out */
  lawyer_email?: string
  /** Lawyer's phone number */
  lawyer_phone?: string
  /** What the lawyer handles, e.g. "For legal questions" */
  lawyer_role_description?: string
  /** Support staff display name */
  support_staff_name?: string
  /** Support staff email */
  support_staff_email?: string
  /** Support staff phone number */
  support_staff_phone?: string
  /** What support staff handles, e.g. "For documents, portal support, and payment confirmation" */
  support_staff_role_description?: string
  /** Preferred language for the portal and emails (default: 'en') */
  preferred_language?: 'en' | 'fr'
  /** Per-matter payment config overrides (overrides tenant defaults field-by-field) */
  payment_config?: {
    e_transfer_email?: string
    e_transfer_instructions?: string
    credit_card_url?: string
    credit_card_label?: string
    payment_instructions?: string
  }
}

export const portalLinkKeys = {
  all: ['portal-links'] as const,
  byMatter: (matterId: string) => [...portalLinkKeys.all, 'matter', matterId] as const,
}

/** Fetch active portal links for a matter (used on the matter detail page) */
export function usePortalLinks(matterId: string) {
  return useQuery({
    queryKey: portalLinkKeys.byMatter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('portal_links')
        .select('*')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as PortalLink[]
    },
    enabled: !!matterId,
  })
}

/** Generate a new portal link with a crypto-random token */
export function useCreatePortalLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      matterId,
      contactId,
      createdBy,
      expiryDays = 30,
      metadata,
    }: {
      tenantId: string
      matterId: string
      contactId?: string | null
      createdBy: string
      expiryDays?: number
      metadata?: PortalLinkMetadata
    }) => {
      const supabase = createClient()

      // Generate a crypto-safe token (73 chars, cryptographically random)
      const token = crypto.randomUUID() + '-' + crypto.randomUUID()

      // Hash token for secure storage (SHA-256 via Web Crypto API)
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token))
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      const { data, error } = await supabase
        .from('portal_links')
        .insert({
          tenant_id: tenantId,
          matter_id: matterId,
          contact_id: contactId ?? null,
          token: 'REDACTED',
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
          created_by: createdBy,
          metadata: (metadata ?? {}) as unknown as Database['public']['Tables']['portal_links']['Insert']['metadata'],
        } as any)
        .select()
        .single()

      if (error) throw error

      // Return the data with the plain token (not stored in DB) so the UI can show the link
      return { ...data, token } as PortalLink
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: portalLinkKeys.byMatter(data.matter_id ?? '') })
      toast.success('Portal link generated')
    },
    onError: () => {
      toast.error('Failed to generate portal link')
    },
  })
}

/** Revoke (deactivate) a portal link */
export function useRevokePortalLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, matterId }: { id: string; matterId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('portal_links')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { matterId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: portalLinkKeys.byMatter(data.matterId) })
      toast.success('Portal link revoked')
    },
    onError: () => {
      toast.error('Failed to revoke portal link')
    },
  })
}
