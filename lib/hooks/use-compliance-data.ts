'use client'

/**
 * Shared Compliance Data Hooks — Directive 41.3
 *
 * Extracted from regulatory-sidebar.tsx so that both the detailed
 * RegulatorySidebar and the compact CompliancePulse can consume
 * the same data without duplicating queries. TanStack Query's
 * queryKey deduplication ensures a single network request.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatFullName } from '@/lib/utils/formatters'

// ── Types ────────────────────────────────────────────────────────────

export interface ConflictScanRecord {
  id: string
  status: string
  score: number | null
  triggered_by: string | null
  officer_name: string | null
  completed_at: string | null
  created_at: string
}

export interface AMLCheckResult {
  idDocHash: string | null
  uploadedIdHash: string | null
  hashMatch: boolean
  hasIdentityDoc: boolean
}

export interface RetainerAgreement {
  id: string
  file_name: string
  content_hash: string | null
  storage_path: string
  signed_at: string | null
}

export type KycStatus = 'verified' | 'pending' | 'not_started'
export type ConflictPulse = 'passed' | 'flagged' | 'not_started'
export type RetainerPulse = 'hash_verified' | 'signed' | 'unsigned' | 'none'
export type AmlPulse = 'match' | 'mismatch' | 'pending'

export interface ComplianceMatrix {
  kyc: KycStatus
  conflict: ConflictPulse
  retainer: RetainerPulse
  aml: AmlPulse
  /** 0-100 percentage, calculated from the 4 items above */
  score: number
  isLoading: boolean
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useLatestConflictScan(contactId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ['regulatory-conflict-scan', contactId],
    queryFn: async (): Promise<ConflictScanRecord | null> => {
      if (!contactId) return null
      const supabase = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: scan } = await (supabase as any)
        .from('conflict_scans')
        .select('id, status, score, triggered_by, completed_at, created_at')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!scan) return null

      let officerName: string | null = null
      if (scan.triggered_by) {
        const { data: user } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', scan.triggered_by)
          .single()
        if (user) {
          officerName = formatFullName(user.first_name, user.last_name) || null
        }
      }

      return { ...scan, officer_name: officerName } as ConflictScanRecord
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useAMLShield(contactId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ['regulatory-aml-shield', contactId],
    queryFn: async (): Promise<AMLCheckResult> => {
      if (!contactId)
        return { idDocHash: null, uploadedIdHash: null, hashMatch: false, hasIdentityDoc: false }
      const supabase = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: verification } = await (supabase as any)
        .from('identity_verifications')
        .select('document_number_hash')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const idDocHash = verification?.document_number_hash ?? null

      const { data: identityDoc } = await supabase
        .from('documents')
        .select('content_hash')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('category', 'identity')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const uploadedIdHash = identityDoc?.content_hash ?? null

      return {
        idDocHash,
        uploadedIdHash,
        hashMatch: !!idDocHash && !!uploadedIdHash && idDocHash === uploadedIdHash,
        hasIdentityDoc: !!uploadedIdHash,
      }
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useRetainerAgreement(
  leadId: string | null,
  matterId: string | null,
  tenantId: string
) {
  return useQuery({
    queryKey: ['regulatory-retainer', leadId, matterId],
    queryFn: async (): Promise<RetainerAgreement | null> => {
      const supabase = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: signingDoc } = await (supabase as any)
        .from('signing_documents')
        .select('id, file_name, checksum_sha256, storage_path, signed_at')
        .eq('tenant_id', tenantId)
        .eq('document_type', 'retainer')
        .or(
          leadId
            ? `lead_id.eq.${leadId},matter_id.eq.${matterId ?? ''}`
            : `matter_id.eq.${matterId}`
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (signingDoc) {
        return {
          id: signingDoc.id,
          file_name: signingDoc.file_name ?? 'Retainer Agreement',
          content_hash: signingDoc.checksum_sha256 ?? null,
          storage_path: signingDoc.storage_path ?? '',
          signed_at: signingDoc.signed_at ?? null,
        }
      }

      const { data: retainerDoc } = await supabase
        .from('documents')
        .select('id, file_name, content_hash, storage_path')
        .eq('tenant_id', tenantId)
        .eq('category', 'retainer')
        .or(
          leadId
            ? `lead_id.eq.${leadId},matter_id.eq.${matterId ?? ''}`
            : `matter_id.eq.${matterId}`
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (retainerDoc) {
        return {
          id: retainerDoc.id,
          file_name: retainerDoc.file_name ?? 'Retainer Agreement',
          content_hash: retainerDoc.content_hash ?? null,
          storage_path: retainerDoc.storage_path ?? '',
          signed_at: null,
        }
      }

      return null
    },
    enabled: !!tenantId && (!!leadId || !!matterId),
    staleTime: 1000 * 60 * 5,
  })
}

/** KYC check — does the contact have a verified identity_verification? */
export function useKycStatus(contactId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ['compliance-kyc', contactId],
    queryFn: async (): Promise<KycStatus> => {
      if (!contactId) return 'not_started'
      const supabase = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('identity_verifications')
        .select('status')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!data) return 'not_started'
      return data.status === 'verified' ? 'verified' : 'pending'
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

/** Check if a Government ID document exists in the vault for this contact */
export function useHasGovernmentId(contactId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ['compliance-gov-id', contactId],
    queryFn: async (): Promise<boolean> => {
      if (!contactId) return false
      const supabase = createClient()
      const { data } = await supabase
        .from('documents')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('category', 'identity')
        .limit(1)
        .maybeSingle()
      return !!data
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Composite Matrix ─────────────────────────────────────────────────

export function useComplianceMatrix(
  contactId: string | null,
  leadId: string | null,
  matterId: string | null,
  tenantId: string
): ComplianceMatrix {
  const { data: kycStatus, isLoading: kycLoading } = useKycStatus(contactId, tenantId)
  const { data: conflictScan, isLoading: conflictLoading } = useLatestConflictScan(
    contactId,
    tenantId
  )
  const { data: retainer, isLoading: retainerLoading } = useRetainerAgreement(
    leadId,
    matterId,
    tenantId
  )
  const { data: amlResult, isLoading: amlLoading } = useAMLShield(contactId, tenantId)

  const isLoading = kycLoading || conflictLoading || retainerLoading || amlLoading

  // Derive conflict pulse
  const conflict: ConflictPulse = !conflictScan
    ? 'not_started'
    : conflictScan.status === 'completed' && (conflictScan.score ?? 0) < 50
      ? 'passed'
      : 'flagged'

  // Derive retainer pulse
  const retainerPulse: RetainerPulse = !retainer
    ? 'none'
    : retainer.content_hash && retainer.signed_at
      ? 'hash_verified'
      : retainer.signed_at
        ? 'signed'
        : 'unsigned'

  // Derive AML pulse
  const aml: AmlPulse = !amlResult?.hasIdentityDoc
    ? 'pending'
    : amlResult.hashMatch
      ? 'match'
      : 'mismatch'

  const kyc = kycStatus ?? 'not_started'

  // Score: each item is 25 points
  let score = 0
  if (kyc === 'verified') score += 25
  if (conflict === 'passed') score += 25
  if (retainerPulse === 'hash_verified') score += 25
  else if (retainerPulse === 'signed') score += 15
  if (aml === 'match') score += 25

  return { kyc, conflict, retainer: retainerPulse, aml, score, isLoading }
}
