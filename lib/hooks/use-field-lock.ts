'use client'

/**
 * useFieldLock  -  Field-level locking via Supabase Realtime broadcast.
 *
 * When Lawyer A starts editing a field, they broadcast a "field_lock" event.
 * Lawyer B sees "Lawyer A is editing..." and the field becomes read-only.
 * When Lawyer A stops typing (5s timeout) or blurs, a "field_unlock" is sent.
 *
 * Uses broadcast (not presence) because field locks are ephemeral actions
 * that don't need to survive reconnection  -  if a user disconnects, their
 * locks automatically expire via the timeout.
 *
 * SENTINEL: tenant_id is included in the payload so cross-tenant leaks
 * are impossible even if channel names somehow collide.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FieldLockInfo {
  fieldId: string
  lockedBy: {
    userId: string
    displayName: string
  }
  lockedAt: string
}

interface UseFieldLockOptions {
  /** The matter presence channel (shared with useMatterPresence) */
  channel: RealtimeChannel | null
  /** Current user info */
  userId: string | null
  displayName: string
  tenantId: string | null
  /** Whether the hook is active */
  enabled?: boolean
}

interface UseFieldLockReturn {
  /** Map of fieldId → lock info (fields currently locked by OTHER users) */
  lockedFields: Map<string, FieldLockInfo>
  /** Call when the current user starts editing a field */
  lockField: (fieldId: string) => void
  /** Call when the current user stops editing a field */
  unlockField: (fieldId: string) => void
  /** Check if a specific field is locked by another user */
  isFieldLocked: (fieldId: string) => boolean
  /** Get the lock info for a specific field */
  getFieldLock: (fieldId: string) => FieldLockInfo | undefined
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LOCK_TIMEOUT_MS = 5000 // Auto-expire locks after 5 seconds of inactivity
const LOCK_EVENT = 'field_lock'
const UNLOCK_EVENT = 'field_unlock'

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useFieldLock({
  channel,
  userId,
  displayName,
  tenantId,
  enabled = true,
}: UseFieldLockOptions): UseFieldLockReturn {
  const [lockedFields, setLockedFields] = useState<Map<string, FieldLockInfo>>(new Map())
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const myLocksRef = useRef<Set<string>>(new Set())

  // ── Broadcast helpers ────────────────────────────────────────────────────

  const lockField = useCallback(
    (fieldId: string) => {
      if (!channel || !userId || !tenantId) return
      myLocksRef.current.add(fieldId)
      channel.send({
        type: 'broadcast',
        event: LOCK_EVENT,
        payload: { fieldId, userId, displayName, tenantId, lockedAt: new Date().toISOString() },
      })
    },
    [channel, userId, displayName, tenantId],
  )

  const unlockField = useCallback(
    (fieldId: string) => {
      if (!channel || !userId || !tenantId) return
      myLocksRef.current.delete(fieldId)
      channel.send({
        type: 'broadcast',
        event: UNLOCK_EVENT,
        payload: { fieldId, userId, tenantId },
      })
    },
    [channel, userId, tenantId],
  )

  // ── Listen for lock/unlock broadcasts ────────────────────────────────────

  useEffect(() => {
    if (!enabled || !channel || !userId || !tenantId) return

    const handleLock = (msg: { payload: { fieldId: string; userId: string; displayName: string; tenantId: string; lockedAt: string } }) => {
      const { fieldId, userId: lockUserId, displayName: lockName, tenantId: lockTenant, lockedAt } = msg.payload

      // SENTINEL: ignore locks from other tenants
      if (lockTenant !== tenantId) return
      // Ignore our own locks
      if (lockUserId === userId) return

      setLockedFields((prev) => {
        const next = new Map(prev)
        next.set(fieldId, {
          fieldId,
          lockedBy: { userId: lockUserId, displayName: lockName },
          lockedAt,
        })
        return next
      })

      // Auto-expire the lock after timeout
      const existing = timeoutsRef.current.get(fieldId)
      if (existing) clearTimeout(existing)
      timeoutsRef.current.set(
        fieldId,
        setTimeout(() => {
          setLockedFields((prev) => {
            const next = new Map(prev)
            next.delete(fieldId)
            return next
          })
          timeoutsRef.current.delete(fieldId)
        }, LOCK_TIMEOUT_MS),
      )
    }

    const handleUnlock = (msg: { payload: { fieldId: string; userId: string; tenantId: string } }) => {
      const { fieldId, userId: unlockUserId, tenantId: unlockTenant } = msg.payload

      if (unlockTenant !== tenantId) return
      if (unlockUserId === userId) return

      setLockedFields((prev) => {
        const next = new Map(prev)
        next.delete(fieldId)
        return next
      })

      const existing = timeoutsRef.current.get(fieldId)
      if (existing) {
        clearTimeout(existing)
        timeoutsRef.current.delete(fieldId)
      }
    }

    channel.on('broadcast', { event: LOCK_EVENT }, handleLock as never)
    channel.on('broadcast', { event: UNLOCK_EVENT }, handleUnlock as never)

    // Cleanup: unlock all our fields and clear timeouts
    return () => {
      // Release all locks this user holds
      for (const fieldId of myLocksRef.current) {
        channel.send({
          type: 'broadcast',
          event: UNLOCK_EVENT,
          payload: { fieldId, userId, tenantId },
        })
      }
      myLocksRef.current.clear()

      // Clear all timeout timers
      for (const timeout of timeoutsRef.current.values()) {
        clearTimeout(timeout)
      }
      timeoutsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, userId, tenantId, enabled])

  // ── Convenience getters ──────────────────────────────────────────────────

  const isFieldLocked = useCallback(
    (fieldId: string) => lockedFields.has(fieldId),
    [lockedFields],
  )

  const getFieldLock = useCallback(
    (fieldId: string) => lockedFields.get(fieldId),
    [lockedFields],
  )

  return useMemo(
    () => ({ lockedFields, lockField, unlockField, isFieldLocked, getFieldLock }),
    [lockedFields, lockField, unlockField, isFieldLocked, getFieldLock],
  )
}
