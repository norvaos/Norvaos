import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TimerState {
  isRunning: boolean
  matterId: string | null
  matterTitle: string | null
  description: string
  startTime: number | null // Date.now() timestamp
  elapsed: number // seconds accumulated before current run

  start: (matterId: string, matterTitle: string, description?: string) => void
  stop: () => { matterId: string; description: string; durationMinutes: number } | null
  tick: () => void
  reset: () => void
  setDescription: (desc: string) => void
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      matterId: null,
      matterTitle: null,
      description: '',
      startTime: null,
      elapsed: 0,

      start: (matterId, matterTitle, description = '') => {
        set({
          isRunning: true,
          matterId,
          matterTitle,
          description,
          startTime: Date.now(),
          elapsed: 0,
        })
      },

      stop: () => {
        const state = get()
        if (!state.isRunning || !state.matterId || !state.startTime) return null

        const runSeconds = Math.floor((Date.now() - state.startTime) / 1000)
        const totalSeconds = state.elapsed + runSeconds
        const durationMinutes = Math.max(1, Math.round(totalSeconds / 60))

        const result = {
          matterId: state.matterId,
          description: state.description || 'Time entry',
          durationMinutes,
        }

        set({
          isRunning: false,
          matterId: null,
          matterTitle: null,
          description: '',
          startTime: null,
          elapsed: 0,
        })

        return result
      },

      tick: () => {
        // No-op: elapsed is computed from startTime on render
      },

      reset: () => {
        set({
          isRunning: false,
          matterId: null,
          matterTitle: null,
          description: '',
          startTime: null,
          elapsed: 0,
        })
      },

      setDescription: (description) => set({ description }),
    }),
    {
      name: 'norvaos-timer',
      partialize: (state) => ({
        isRunning: state.isRunning,
        matterId: state.matterId,
        matterTitle: state.matterTitle,
        description: state.description,
        startTime: state.startTime,
        elapsed: state.elapsed,
      }),
    }
  )
)
