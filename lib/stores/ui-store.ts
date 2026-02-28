import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean
  sidebarMobileOpen: boolean
  toggleSidebar: () => void
  setSidebarMobileOpen: (open: boolean) => void

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  // View preferences
  viewPreferences: Record<string, 'table' | 'kanban' | 'calendar' | 'timeline' | 'week' | '3day' | 'day'>
  setViewPreference: (entity: string, view: 'table' | 'kanban' | 'calendar' | 'timeline' | 'week' | '3day' | 'day') => void

  // Active modals/sheets
  activeModal: string | null
  modalData: Record<string, unknown> | null
  openModal: (modal: string, data?: Record<string, unknown>) => void
  closeModal: () => void

  // Global practice filter ('all' | practice_area id UUID string)
  // Persisted per browser session. Server preference is saved separately via API.
  activePracticeFilter: string
  activePracticeColor: string | null
  activePracticeName: string | null
  setActivePracticeFilter: (filter: string, color?: string | null, name?: string | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // View preferences
      viewPreferences: {
        leads: 'kanban',
        matters: 'table',
        contacts: 'table',
        tasks: 'table',
      },
      setViewPreference: (entity, view) =>
        set((state) => ({
          viewPreferences: { ...state.viewPreferences, [entity]: view },
        })),

      // Modals
      activeModal: null,
      modalData: null,
      openModal: (modal, data) => set({ activeModal: modal, modalData: data ?? null }),
      closeModal: () => set({ activeModal: null, modalData: null }),

      // Practice filter — 'all' or a practice_area UUID
      // Color and name are stored alongside so the header can render the accent
      // instantly from localStorage without waiting for the practice areas query.
      activePracticeFilter: 'all',
      activePracticeColor: null,
      activePracticeName: null,
      setActivePracticeFilter: (filter, color, name) =>
        set({
          activePracticeFilter: filter,
          activePracticeColor: filter === 'all' ? null : (color ?? null),
          activePracticeName: filter === 'all' ? null : (name ?? null),
        }),
    }),
    {
      name: 'norvaos-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewPreferences: state.viewPreferences,
        activePracticeFilter: state.activePracticeFilter,
        activePracticeColor: state.activePracticeColor,
        activePracticeName: state.activePracticeName,
      }),
    }
  )
)
