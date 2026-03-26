import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Workplace drawer panel identifiers
type DrawerPanel =
  | 'documents'
  | 'questionnaire'
  | 'irccForms'
  | 'tasks'
  | 'deadlines'
  | 'billing'
  | 'notes'
  | 'timeline'
  | 'people'
  | 'postDecision'
  | null

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean
  sidebarMobileOpen: boolean
  toggleSidebar: () => void
  setSidebarMobileOpen: (open: boolean) => void

  // Command palette
  commandPaletteOpen: boolean
  commandPaletteInitialQuery: string | null
  setCommandPaletteOpen: (open: boolean) => void
  openCommandPaletteWith: (query: string) => void

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

  // Workplace shell state (Phase C)
  activeDrawerPanel: DrawerPanel
  communicationPanelCollapsed: boolean
  setActiveDrawerPanel: (panel: DrawerPanel) => void
  toggleCommunicationPanel: () => void

  // Zone E  -  Audit Rail collapse state (persisted)
  zoneECollapsed: boolean
  setZoneECollapsed: (v: boolean) => void

  // Session B: Sovereign Ignition UI_REFRESH event
  // When fired, forces CSS re-render for liquid-fill synchronisation with hash generation
  sovereignIgnitionSeq: number
  fireSovereignIgnition: () => void
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
      commandPaletteInitialQuery: null,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open, commandPaletteInitialQuery: open ? null : null }),
      openCommandPaletteWith: (query) => set({ commandPaletteOpen: true, commandPaletteInitialQuery: query }),

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

      // Practice filter  -  'all' or a practice_area UUID
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

      // Workplace shell state (Phase C)
      activeDrawerPanel: null,
      communicationPanelCollapsed: false,
      setActiveDrawerPanel: (panel) =>
        set((state) => ({
          activeDrawerPanel: state.activeDrawerPanel === panel ? null : panel,
        })),
      toggleCommunicationPanel: () =>
        set((state) => ({
          communicationPanelCollapsed: !state.communicationPanelCollapsed,
        })),

      // Zone E  -  Audit Rail collapse state
      zoneECollapsed: false,
      setZoneECollapsed: (v) => set({ zoneECollapsed: v }),

      // Session B: Sovereign Ignition UI_REFRESH event
      sovereignIgnitionSeq: 0,
      fireSovereignIgnition: () => set((state) => ({
        sovereignIgnitionSeq: state.sovereignIgnitionSeq + 1,
      })),
    }),
    {
      name: 'norvaos-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewPreferences: state.viewPreferences,
        activePracticeFilter: state.activePracticeFilter,
        activePracticeColor: state.activePracticeColor,
        activePracticeName: state.activePracticeName,
        communicationPanelCollapsed: state.communicationPanelCollapsed,
        zoneECollapsed: state.zoneECollapsed,
      }),
    }
  )
)
