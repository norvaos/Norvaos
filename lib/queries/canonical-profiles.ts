import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type {
  CanonicalProfileRow,
  CanonicalProfileFieldRow,
  CanonicalProfileSnapshotRow,
  CanonicalProfileConflictRow,
} from '@/lib/types/database'
import type { CanonicalDomain, FieldSource, ConflictResolution } from '@/lib/services/canonical-profile'

// ── Query Keys ──────────────────────────────────────────────────────────────

export const canonicalProfileKeys = {
  all: ['canonical-profiles'] as const,
  profile: (contactId: string) => [...canonicalProfileKeys.all, 'profile', contactId] as const,
  fields: (profileId: string, domain?: string) =>
    [...canonicalProfileKeys.all, 'fields', profileId, domain ?? 'all'] as const,
  conflicts: (profileId: string) => [...canonicalProfileKeys.all, 'conflicts', profileId] as const,
  snapshots: (matterId: string) => [...canonicalProfileKeys.all, 'snapshots', matterId] as const,
}

// ── Profile Queries ─────────────────────────────────────────────────────────

interface CanonicalProfileWithFields extends CanonicalProfileRow {
  fields: CanonicalProfileFieldRow[]
}

export function useCanonicalProfile(contactId: string) {
  return useQuery({
    queryKey: canonicalProfileKeys.profile(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data: profile, error: profileErr } = await supabase
        .from('canonical_profiles')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle()

      if (profileErr) throw profileErr
      if (!profile) return null

      const { data: fields, error: fieldsErr } = await supabase
        .from('canonical_profile_fields')
        .select('*')
        .eq('profile_id', profile.id)
        .is('effective_to', null)
        .order('domain')
        .order('field_key')

      if (fieldsErr) throw fieldsErr

      return {
        ...profile,
        fields: fields ?? [],
      } as CanonicalProfileWithFields
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 2, // 2 minutes — profile data changes moderately
  })
}

// ── Field Queries ───────────────────────────────────────────────────────────

export function useCanonicalFields(profileId: string, domain?: CanonicalDomain) {
  return useQuery({
    queryKey: canonicalProfileKeys.fields(profileId, domain),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('canonical_profile_fields')
        .select('*')
        .eq('profile_id', profileId)
        .is('effective_to', null)
        .order('domain')
        .order('field_key')

      if (domain) {
        query = query.eq('domain', domain)
      }

      const { data, error } = await query
      if (error) throw error
      return data as CanonicalProfileFieldRow[]
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Field Mutations ─────────────────────────────────────────────────────────

interface UpdateFieldInput {
  profileId: string
  domain: CanonicalDomain
  fieldKey: string
  value: unknown
  source: FieldSource
  effectiveFrom?: string
  sourceDocumentId?: string
  verificationStatus?: 'pending' | 'verified' | 'client_submitted'
}

export function useUpdateCanonicalField() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateFieldInput) => {
      const supabase = createClient()
      const today = input.effectiveFrom ?? new Date().toISOString().split('T')[0]

      // Check for existing value to detect conflicts
      const { data: existing } = await supabase
        .from('canonical_profile_fields')
        .select('id, value')
        .eq('profile_id', input.profileId)
        .eq('field_key', input.fieldKey)
        .is('effective_to', null)
        .maybeSingle()

      if (existing) {
        const valuesMatch = JSON.stringify(existing.value) === JSON.stringify(input.value)

        if (!valuesMatch) {
          // Check if this creates a conflict (different source)
          const { data: existingFull } = await supabase
            .from('canonical_profile_fields')
            .select('source')
            .eq('id', existing.id)
            .single()

          if (existingFull && existingFull.source !== input.source) {
            // Create a conflict record
            const { data: conflict, error: conflictErr } = await supabase
              .from('canonical_profile_conflicts')
              .insert({
                profile_id: input.profileId,
                field_key: input.fieldKey,
                existing_value: existing.value,
                new_value: input.value as CanonicalProfileFieldRow['value'],
                new_source: input.source,
              })
              .select('id')
              .single()

            if (conflictErr) throw conflictErr

            // Mark field as in conflict
            await supabase
              .from('canonical_profile_fields')
              .update({ verification_status: 'conflict' })
              .eq('id', existing.id)

            return { updated: false, conflictId: conflict.id }
          }
        }

        // Close out old value
        await supabase
          .from('canonical_profile_fields')
          .update({ effective_to: today })
          .eq('id', existing.id)
      }

      // Insert new field value
      const { error } = await supabase
        .from('canonical_profile_fields')
        .insert({
          profile_id: input.profileId,
          domain: input.domain,
          field_key: input.fieldKey,
          value: input.value as CanonicalProfileFieldRow['value'],
          effective_from: today,
          source: input.source,
          source_document_id: input.sourceDocumentId ?? null,
          verification_status: input.verificationStatus ?? 'pending',
        })

      if (error) throw error

      return { updated: true }
    },
    onSuccess: (result, input) => {
      qc.invalidateQueries({ queryKey: canonicalProfileKeys.fields(input.profileId) })
      if (result.updated) {
        toast.success('Field updated')
      } else if (result.conflictId) {
        toast.warning('Value conflict detected — review required')
        qc.invalidateQueries({ queryKey: canonicalProfileKeys.conflicts(input.profileId) })
      }
    },
    onError: () => {
      toast.error('Failed to update field')
    },
  })
}

// ── Conflict Queries ────────────────────────────────────────────────────────

export function useCanonicalConflicts(profileId: string) {
  return useQuery({
    queryKey: canonicalProfileKeys.conflicts(profileId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('canonical_profile_conflicts')
        .select('*')
        .eq('profile_id', profileId)
        .eq('resolution', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as CanonicalProfileConflictRow[]
    },
    enabled: !!profileId,
    staleTime: 1000 * 30, // 30 seconds — conflicts need prompt attention
  })
}

// ── Conflict Resolution ─────────────────────────────────────────────────────

interface ResolveConflictInput {
  conflictId: string
  resolution: ConflictResolution
  resolvedBy: string
  profileId: string // for cache invalidation
}

export function useResolveConflict() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ResolveConflictInput) => {
      const supabase = createClient()

      // Get the conflict
      const { data: conflict, error: fetchErr } = await supabase
        .from('canonical_profile_conflicts')
        .select('*')
        .eq('id', input.conflictId)
        .single()

      if (fetchErr) throw fetchErr

      // Update the conflict record
      const { error: updateErr } = await supabase
        .from('canonical_profile_conflicts')
        .update({
          resolution: input.resolution,
          resolved_by: input.resolvedBy,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', input.conflictId)

      if (updateErr) throw updateErr

      const today = new Date().toISOString().split('T')[0]

      if (input.resolution === 'accept_new') {
        // Close existing, insert new value
        await supabase
          .from('canonical_profile_fields')
          .update({ effective_to: today, verification_status: 'pending' })
          .eq('profile_id', conflict.profile_id)
          .eq('field_key', conflict.field_key)
          .is('effective_to', null)

        // Get the domain from existing field
        const { data: existingField } = await supabase
          .from('canonical_profile_fields')
          .select('domain')
          .eq('profile_id', conflict.profile_id)
          .eq('field_key', conflict.field_key)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()

        await supabase
          .from('canonical_profile_fields')
          .insert({
            profile_id: conflict.profile_id,
            domain: existingField?.domain ?? 'identity',
            field_key: conflict.field_key,
            value: conflict.new_value,
            effective_from: today,
            source: conflict.new_source,
            verification_status: 'verified',
          })
      } else if (input.resolution === 'keep_existing') {
        await supabase
          .from('canonical_profile_fields')
          .update({ verification_status: 'verified' })
          .eq('profile_id', conflict.profile_id)
          .eq('field_key', conflict.field_key)
          .is('effective_to', null)
      }

      return { resolved: true }
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: canonicalProfileKeys.conflicts(input.profileId) })
      qc.invalidateQueries({ queryKey: canonicalProfileKeys.fields(input.profileId) })
      toast.success('Conflict resolved')
    },
    onError: () => {
      toast.error('Failed to resolve conflict')
    },
  })
}

// ── Snapshot Queries ────────────────────────────────────────────────────────

export function useCanonicalSnapshots(matterId: string) {
  return useQuery({
    queryKey: canonicalProfileKeys.snapshots(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('canonical_profile_snapshots')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as CanonicalProfileSnapshotRow[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5, // 5 minutes — snapshots rarely change
  })
}

// ── Create Snapshot ─────────────────────────────────────────────────────────

interface CreateSnapshotInput {
  profileId: string
  matterId: string
}

export function useCreateSnapshot() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSnapshotInput) => {
      const supabase = createClient()

      // Gather current fields
      const { data: fields, error: fieldsErr } = await supabase
        .from('canonical_profile_fields')
        .select('*')
        .eq('profile_id', input.profileId)
        .is('effective_to', null)

      if (fieldsErr) throw fieldsErr

      // Structure by domain
      const snapshotData: Record<string, Record<string, unknown>> = {}
      for (const field of fields ?? []) {
        if (!snapshotData[field.domain]) {
          snapshotData[field.domain] = {}
        }
        snapshotData[field.domain][field.field_key] = {
          value: field.value,
          source: field.source,
          verification_status: field.verification_status,
          effective_from: field.effective_from,
        }
      }

      const { data, error } = await supabase
        .from('canonical_profile_snapshots')
        .upsert(
          {
            profile_id: input.profileId,
            matter_id: input.matterId,
            snapshot_data: snapshotData as CanonicalProfileSnapshotRow['snapshot_data'],
          },
          { onConflict: 'profile_id,matter_id' },
        )
        .select()
        .single()

      if (error) throw error
      return data as CanonicalProfileSnapshotRow
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: canonicalProfileKeys.snapshots(input.matterId) })
      toast.success('Profile snapshot created for this matter')
    },
    onError: () => {
      toast.error('Failed to create profile snapshot')
    },
  })
}
