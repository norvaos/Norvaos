import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ConditionalColorRule {
  id: string
  column: string
  condition: 'is' | 'is_not' | 'is_empty' | 'is_not_empty' | 'ends_before' | 'ends_after'
  value: string
  target: 'cell' | 'row'
  color: string
  enabled: boolean
}

interface TaskTableState {
  // State
  columnVisibility: Record<string, boolean>
  columnOrder: string[]
  groupBy: string | null
  showCompleted: boolean
  searchQuery: string
  conditionalColorRules: ConditionalColorRule[]
  statusFilter: string | null

  // Actions
  setColumnVisibility: (col: string, visible: boolean) => void
  setColumnOrder: (order: string[]) => void
  setGroupBy: (groupBy: string | null) => void
  setShowCompleted: (show: boolean) => void
  setSearchQuery: (query: string) => void
  addConditionalColorRule: (rule: ConditionalColorRule) => void
  removeConditionalColorRule: (id: string) => void
  toggleConditionalColorRule: (id: string) => void
  setStatusFilter: (status: string | null) => void
}

const DEFAULT_COLUMN_ORDER = [
  'select',
  'title',
  'owner',
  'status',
  'priority',
  'due_date',
  'notes',
  'timeline',
  'files',
  'checkbox',
]

export const useTaskTableStore = create<TaskTableState>()(
  persist(
    (set) => ({
      columnVisibility: {
        title: true,
        owner: true,
        status: true,
        priority: true,
        due_date: true,
        notes: true,
        timeline: true,
        files: true,
        checkbox: true,
      },
      setColumnVisibility: (col, visible) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [col]: visible,
          },
        })),

      columnOrder: DEFAULT_COLUMN_ORDER,
      setColumnOrder: (order) => set({ columnOrder: order }),

      groupBy: null,
      setGroupBy: (groupBy) => set({ groupBy }),

      showCompleted: true,
      setShowCompleted: (show) => set({ showCompleted: show }),

      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),

      conditionalColorRules: [],
      addConditionalColorRule: (rule) =>
        set((state) => ({
          conditionalColorRules: [...state.conditionalColorRules, rule],
        })),
      removeConditionalColorRule: (id) =>
        set((state) => ({
          conditionalColorRules: state.conditionalColorRules.filter(
            (r) => r.id !== id
          ),
        })),
      toggleConditionalColorRule: (id) =>
        set((state) => ({
          conditionalColorRules: state.conditionalColorRules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r
          ),
        })),

      statusFilter: null,
      setStatusFilter: (status) => set({ statusFilter: status }),
    }),
    {
      name: 'lexcrm-task-table',
      partialize: (state) => ({
        columnVisibility: state.columnVisibility,
        columnOrder: state.columnOrder,
        groupBy: state.groupBy,
        showCompleted: state.showCompleted,
        conditionalColorRules: state.conditionalColorRules,
      }),
    }
  )
)
