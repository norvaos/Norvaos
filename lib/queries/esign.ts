import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { leadWorkflowKeys } from '@/lib/queries/lead-workflow'

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const esignKeys = {
  all: ['esign'] as const,
  byMatter: (matterId: string) => [...esignKeys.all, 'matter', matterId] as const,
  byLead: (leadId: string) => [...esignKeys.all, 'lead', leadId] as const,
  detail: (requestId: string) => [...esignKeys.all, 'detail', requestId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SigningRequest {
  id: string
  tenant_id: string
  signing_document_id: string
  matter_id: string | null
  lead_id: string | null
  token_hash: string
  status: string
  signer_name: string
  signer_email: string
  signer_contact_id: string | null
  sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  declined_at: string | null
  cancelled_at: string | null
  expires_at: string
  decline_reason: string | null
  signature_mode: string | null
  signed_document_path: string | null
  signed_document_hash: string | null
  reminder_count: number
  last_reminder_at: string | null
  superseded_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  signing_documents: SigningDocument | null
}

export interface SigningDocument {
  id: string
  tenant_id: string
  document_type: string
  source_entity_type: string
  source_entity_id: string
  matter_id: string | null
  lead_id: string | null
  contact_id: string | null
  title: string
  storage_path: string
  checksum_sha256: string
  file_size_bytes: number
  created_by: string | null
  created_at: string
}

export interface SigningEvent {
  id: string
  tenant_id: string
  signing_request_id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_type: string
  actor_id: string | null
  ip_address: string | null
  user_agent: string | null
  source_document_hash: string | null
  signed_document_hash: string | null
  consent_text: string | null
  signature_mode: string | null
  typed_name: string | null
  email_message_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch all signing requests for a matter (with their documents).
 */
export function useSigningRequests(matterId: string) {
  return useQuery({
    queryKey: esignKeys.byMatter(matterId),
    queryFn: async () => {
      const res = await fetch(`/api/esign/requests?matterId=${matterId}`)
      if (!res.ok) throw new Error('Failed to fetch signing requests')
      return await res.json() as SigningRequest[]
    },
    enabled: !!matterId,
  })
}

/**
 * Fetch a single signing request with its audit events.
 */
export function useSigningRequestDetail(requestId: string) {
  return useQuery({
    queryKey: esignKeys.detail(requestId),
    queryFn: async () => {
      const res = await fetch(`/api/esign/requests/${requestId}`)
      if (!res.ok) throw new Error('Failed to fetch signing request')
      const data = await res.json()
      return data as { request: SigningRequest; events: SigningEvent[] }
    },
    enabled: !!requestId,
  })
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Send a retainer for e-signature.
 * Freezes the document + creates signing request + sends email.
 */
export function useSendForESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      invoiceId: string
      matterId: string
      signerName: string
      signerEmail: string
      signerContactId?: string | null
      documentTitle?: string
    }) => {
      const res = await fetch('/api/esign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send for e-signature')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byMatter(variables.matterId) })
      toast.success('Retainer sent for e-signature')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Resend a signing request (supersedes the old one).
 */
export function useResendESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { signingRequestId: string; matterId: string }) => {
      const res = await fetch('/api/esign/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingRequestId: params.signingRequestId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to resend')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byMatter(variables.matterId) })
      toast.success('Signing request resent')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Cancel a signing request.
 */
export function useCancelESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { signingRequestId: string; matterId: string; reason?: string }) => {
      const res = await fetch('/api/esign/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signingRequestId: params.signingRequestId,
          reason: params.reason,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to cancel')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byMatter(variables.matterId) })
      toast.success('Signing request cancelled')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Send a reminder for a signing request.
 */
export function useSendESignReminder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { signingRequestId: string; matterId?: string; leadId?: string }) => {
      const res = await fetch('/api/esign/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingRequestId: params.signingRequestId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send reminder')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      if (variables.matterId) {
        queryClient.invalidateQueries({ queryKey: esignKeys.byMatter(variables.matterId) })
      }
      if (variables.leadId) {
        queryClient.invalidateQueries({ queryKey: esignKeys.byLead(variables.leadId) })
      }
      toast.success('Reminder sent')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Lead-Level Signing Queries ─────────────────────────────────────────────

/**
 * Fetch all signing requests for a lead (with their documents).
 */
export function useSigningRequestsForLead(leadId: string) {
  return useQuery({
    queryKey: esignKeys.byLead(leadId),
    queryFn: async () => {
      const res = await fetch(`/api/esign/requests?leadId=${leadId}`)
      if (!res.ok) throw new Error('Failed to fetch signing requests')
      return await res.json() as SigningRequest[]
    },
    enabled: !!leadId,
  })
}

/**
 * Send a retainer package for e-signature at the lead level.
 */
export function useSendRetainerForESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      retainerPackageId: string
      leadId: string
      signerName: string
      signerEmail: string
      signerContactId?: string | null
      documentTitle?: string
    }) => {
      const res = await fetch('/api/esign/send-retainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send retainer for e-signature')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byLead(variables.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(variables.leadId) })
      toast.success('Retainer sent for e-signature')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Resend a lead-level signing request.
 */
export function useResendLeadESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { signingRequestId: string; leadId: string }) => {
      const res = await fetch('/api/esign/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingRequestId: params.signingRequestId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to resend')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byLead(variables.leadId) })
      toast.success('Signing request resent')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Cancel a lead-level signing request.
 */
export function useCancelLeadESign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { signingRequestId: string; leadId: string; reason?: string }) => {
      const res = await fetch('/api/esign/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signingRequestId: params.signingRequestId,
          reason: params.reason,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to cancel')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: esignKeys.byLead(variables.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(variables.leadId) })
      toast.success('Signing request cancelled')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
