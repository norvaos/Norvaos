/**
 * Matter Profile Queries
 *
 * Query hooks for the matter-scoped profile system.
 *
 * Each person in a matter (matter_people) has a profile_data JSONB column
 * holding a snapshot of their canonical profile plus matter-specific data.
 * These hooks read/write that layer and invoke the carry-forward / sync-back
 * PostgreSQL functions.
 *
 * Reading priority for the fill engine:
 *   matter_people.profile_data  (matter-scoped, this file)
 *   ↑ falls back to contacts.immigration_data only if no matter profile exists
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatterPersonProfile {
  id: string
  matter_id: string
  contact_id: string | null
  person_role: string
  role_label: string | null
  sort_order: number
  first_name: string
  last_name: string
  profile_data: Record<string, unknown>
  snapshot_taken_at: string | null
  is_locked: boolean
  profile_version: number
  updated_at: string
}

export interface ProfileSyncLogEntry {
  id: string
  matter_id: string
  matter_person_id: string
  contact_id: string | null
  sync_direction: 'canonical_to_matter' | 'matter_to_canonical'
  fields_synced: string[] | null
  synced_by: string | null
  notes: string | null
  created_at: string
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const matterProfileKeys = {
  all:        (matterId: string) => ['matter-profiles', matterId] as const,
  person:     (matterId: string, personId: string) => ['matter-profiles', matterId, personId] as const,
  syncLog:    (matterId: string) => ['matter-profile-sync-log', matterId] as const,
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * All people in a matter with their profiles.
 * Used by the workbench, family consistency view, and fill engine.
 */
export function useMatterPeople(matterId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: matterProfileKeys.all(matterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matter_people')
        .select(
          'id, matter_id, contact_id, person_role, role_label, sort_order, ' +
          'first_name, last_name, profile_data, snapshot_taken_at, ' +
          'is_locked, profile_version, updated_at',
        )
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as MatterPersonProfile[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min — profiles change during active workbench sessions
  })
}

/**
 * Single person's profile. Used by the workbench field verification panel.
 */
export function useMatterPersonProfile(matterId: string, personId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: matterProfileKeys.person(matterId, personId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matter_people')
        .select(
          'id, matter_id, contact_id, person_role, role_label, ' +
          'first_name, last_name, profile_data, snapshot_taken_at, ' +
          'is_locked, profile_version, updated_at',
        )
        .eq('id', personId)
        .eq('matter_id', matterId)
        .single()
      if (error) throw error
      return data as unknown as MatterPersonProfile
    },
    enabled: !!matterId && !!personId,
    staleTime: 1000 * 30, // 30s — workbench needs near-real-time
  })
}

/**
 * Sync log for a matter — shows carry-forward and sync-back history.
 */
export function useMatterProfileSyncLog(matterId: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: matterProfileKeys.syncLog(matterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matter_profile_sync_log')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as ProfileSyncLogEntry[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Update a single field (or multiple fields) in a person's profile_data.
 *
 * Merges the patch into the existing profile_data at the top level.
 * Uses profile_version for optimistic concurrency — throws if version mismatch.
 *
 * Usage:
 *   const update = useUpdateMatterPersonProfile()
 *   update.mutate({ personId, matterId, patch: { 'personal.given_name': 'Ahmed' }, currentVersion: 3 })
 */
export function useUpdateMatterPersonProfile() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      personId,
      matterId,
      patch,
      currentVersion,
    }: {
      personId: string
      matterId: string
      patch: Record<string, unknown>
      currentVersion: number
    }) => {
      // Fetch current profile_data to merge into
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase as any)
        .from('matter_people')
        .select('profile_data, profile_version, is_locked')
        .eq('id', personId)
        .single() as {
          data: { profile_data: Record<string, unknown> | null; profile_version: number; is_locked: boolean } | null
          error: Error | null
        }

      if (fetchErr || !current) throw new Error('Person profile not found')
      if (current.is_locked) throw new Error('Profile is locked — generate a new package version to make changes')
      if (current.profile_version !== currentVersion) {
        throw new Error(`Version conflict: expected ${currentVersion}, found ${current.profile_version}. Reload and retry.`)
      }

      const merged = { ...(current.profile_data ?? {}), ...patch }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_people')
        .update({
          profile_data:    merged as Json,
          profile_version: currentVersion + 1,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', personId)
        .eq('profile_version', currentVersion) // double-guard against race
        .select('id, profile_version, updated_at')
        .single() as { data: { id: string; profile_version: number; updated_at: string } | null; error: Error | null }

      if (error) throw error
      return data
    },
    onSuccess: (_, { matterId, personId }) => {
      qc.invalidateQueries({ queryKey: matterProfileKeys.person(matterId, personId) })
      qc.invalidateQueries({ queryKey: matterProfileKeys.all(matterId) })
    },
  })
}

/**
 * Carry-forward: snapshot contacts.immigration_data → matter_people.profile_data.
 *
 * Call this:
 *   1. Automatically when a new matter is created for an existing client
 *   2. Manually when staff wants to refresh stable biographical data
 *      (e.g. client updated their address in the portal since matter opened)
 *
 * Returns the new profile_version.
 */
export function useSnapshotContactToMatter() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterPersonId,
      contactId,
      tenantId,
      matterId,
    }: {
      matterPersonId: string
      contactId: string
      tenantId: string
      matterId: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'snapshot_contact_profile_to_matter',
        {
          p_matter_person_id: matterPersonId,
          p_contact_id:       contactId,
          p_tenant_id:        tenantId,
          p_synced_by:        null,
        },
      ) as { data: number | null; error: Error | null }
      if (error) throw error
      return { newVersion: data ?? 1, matterId, matterPersonId }
    },
    onSuccess: ({ matterId, matterPersonId }) => {
      qc.invalidateQueries({ queryKey: matterProfileKeys.person(matterId, matterPersonId) })
      qc.invalidateQueries({ queryKey: matterProfileKeys.all(matterId) })
      qc.invalidateQueries({ queryKey: matterProfileKeys.syncLog(matterId) })
    },
  })
}

/**
 * Sync-back: push selected profile keys from matter → contacts.immigration_data.
 *
 * Call after a matter closes when the practitioner wants changes (new passport,
 * new address) to carry forward into the next matter automatically.
 *
 * Pass fieldsToSync = null to sync all keys.
 * Pass fieldsToSync = ['passport', 'contact_info'] for selective sync.
 */
export function useSyncMatterProfileToCanonical() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterPersonId,
      contactId,
      tenantId,
      matterId,
      fieldsToSync = null,
    }: {
      matterPersonId: string
      contactId: string
      tenantId: string
      matterId: string
      fieldsToSync?: string[] | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc(
        'sync_matter_profile_to_canonical',
        {
          p_matter_person_id: matterPersonId,
          p_contact_id:       contactId,
          p_tenant_id:        tenantId,
          p_fields_to_sync:   fieldsToSync,
          p_synced_by:        null,
        },
      ) as { error: Error | null }
      if (error) throw error
      return { matterId, matterPersonId, contactId }
    },
    onSuccess: ({ matterId, matterPersonId }) => {
      qc.invalidateQueries({ queryKey: matterProfileKeys.syncLog(matterId) })
      qc.invalidateQueries({ queryKey: matterProfileKeys.person(matterId, matterPersonId) })
    },
  })
}

/**
 * Lock all profiles in a matter.
 * Called when a package is generated — prevents further profile edits.
 */
export function useLockMatterProfiles() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ matterId }: { matterId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('matter_people')
        .update({ is_locked: true, updated_at: new Date().toISOString() })
        .eq('matter_id', matterId)
        .eq('is_active', true) as { error: Error | null }
      if (error) throw error
    },
    onSuccess: (_, { matterId }) => {
      qc.invalidateQueries({ queryKey: matterProfileKeys.all(matterId) })
    },
  })
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Read a single value from a profile using dot-notation path.
 * e.g. getProfileValue(profile, 'passport.number') → 'AB123456'
 */
export function getProfileValue(
  profile: Record<string, unknown>,
  profilePath: string,
): unknown {
  const parts = profilePath.split('.')
  let current: unknown = profile
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Set a value at a dot-notation path in a profile, returning a new object.
 * Immutable — does not mutate the input.
 * e.g. setProfileValue(profile, 'passport.number', 'XY789') → new profile
 */
export function setProfileValue(
  profile: Record<string, unknown>,
  profilePath: string,
  value: unknown,
): Record<string, unknown> {
  const parts = profilePath.split('.')
  const result = { ...profile }
  let current = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    current[part] = typeof current[part] === 'object' && current[part] !== null
      ? { ...(current[part] as Record<string, unknown>) }
      : {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
  return result
}
