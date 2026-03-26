/**
 * TanStack Query hooks for Norva Ear  -  Consultation Co-Pilot.
 *
 * Budget: all column fragments < 20 cols per query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Column Fragments ─────────────────────────────────────────────────────────

const SESSION_LIST_COLS = 'id, title, status, participants, duration_seconds, consent_granted, consent_method, created_at, updated_at' as const // 9
const SESSION_DETAIL_COLS = 'id, title, status, participants, duration_seconds, consent_granted, consent_method, transcript, extracted_facts, anchored_fields, created_at, updated_at' as const // 12

// ── Query Keys ───────────────────────────────────────────────────────────────

export const norvaEarKeys = {
  all: ['norva-ear'] as const,
  sessions: (matterId: string) => [...norvaEarKeys.all, 'sessions', matterId] as const,
  session: (sessionId: string) => [...norvaEarKeys.all, 'session', sessionId] as const,
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useNorvaEarSessions(matterId: string) {
  return useQuery({
    queryKey: norvaEarKeys.sessions(matterId),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/norva-ear`)
      if (!res.ok) throw new Error('Failed to load Norva Ear sessions')
      const json = await res.json()
      return json.sessions as Array<{
        id: string
        title: string | null
        status: string
        participants: string[]
        duration_seconds: number | null
        consent_granted: boolean
        consent_method: string | null
        created_at: string
        updated_at: string
      }>
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useStartNorvaEarSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      matterId: string
      title?: string
      participants?: string[]
      consentMethod: 'verbal' | 'written' | 'digital' | 'pre_authorized'
    }) => {
      const res = await fetch(`/api/matters/${input.matterId}/norva-ear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          participants: input.participants,
          consentMethod: input.consentMethod,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to start session' }))
        throw new Error(data.error)
      }
      return res.json()
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: norvaEarKeys.sessions(vars.matterId) })
    },
  })
}

export function useSubmitNorvaEarTranscript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      matterId: string
      sessionId: string
      transcript: string
      durationSeconds?: number
    }) => {
      const res = await fetch(`/api/matters/${input.matterId}/norva-ear`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: input.sessionId,
          transcript: input.transcript,
          durationSeconds: input.durationSeconds,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to process transcript' }))
        throw new Error(data.error)
      }
      return res.json()
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: norvaEarKeys.sessions(vars.matterId) })
    },
  })
}
