import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ────────────────────────────────────────────────────────────────────

/** Heritage field state: tracks origin and freshness of auto-injected data */
export type FieldOrigin = 'manual' | 'heritage' | 'scan' | 'prefill'
export type FieldFreshness = 'verified' | 'stale' | 'unverified'

export interface FieldMeta {
  origin: FieldOrigin
  freshness: FieldFreshness
  /** ISO timestamp of when this value was last set */
  updatedAt: string
  /** If heritage, the source matter_id it came from */
  sourceMatterId?: string
}

interface FormWizardState {
  // ── Data Core ──────────────────────────────────────────────────────────────
  /** Active matter being edited */
  activeMatterId: string | null
  /** Active form code (e.g. 'IMM5257E') */
  activeFormCode: string | null
  /** Active form DB id */
  activeFormId: string | null
  /** Current wizard step (0-based) */
  currentStep: number
  /** The form field data keyed by profile_path (e.g. 'personal.first_name') */
  formData: Record<string, unknown>
  /** Per-field metadata tracking origin and freshness */
  fieldMeta: Record<string, FieldMeta>
  /** ISO timestamp of last local mutation */
  lastSavedAt: string | null
  /** Active page index for PDF preview */
  activePreviewPage: number

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Initialise wizard for a specific matter + form combination */
  initWizard: (matterId: string, formCode: string, formId: string) => void

  /** Set a single field value by dot-path (e.g. 'personal.first_name') */
  setField: (path: string, value: unknown, origin?: FieldOrigin) => void

  /** Bulk-inject data (Heritage Sync or ID Scanner) without clobbering manual edits */
  injectHeritage: (
    data: Record<string, unknown>,
    sourceMatterId?: string,
  ) => void

  /** Bulk-inject data from an ID scan */
  injectScan: (data: Record<string, unknown>) => void

  /** Advance wizard step */
  setStep: (step: number) => void

  /** Set active preview page */
  setPreviewPage: (page: number) => void

  /** Mark a heritage/scan field as manually verified by staff */
  verifyField: (path: string) => void

  /**
   * Clear wizard state after successful generation/submission.
   * Optionally preserves data for a different form on the same matter.
   */
  resetWizard: () => void

  /** Check if there's a persisted session for a given matter + form */
  hasSession: (matterId: string, formCode: string) => boolean
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useFormWizardStore = create<FormWizardState>()(
  persist(
    (set, get) => ({
      // Defaults
      activeMatterId: null,
      activeFormCode: null,
      activeFormId: null,
      currentStep: 0,
      formData: {},
      fieldMeta: {},
      lastSavedAt: null,
      activePreviewPage: 0,

      initWizard: (matterId, formCode, formId) => {
        const state = get()
        // If resuming the same session, don't clear data
        if (state.activeMatterId === matterId && state.activeFormCode === formCode) {
          // Just update formId in case it changed (re-scan)
          set({ activeFormId: formId })
          return
        }
        // New session  -  start fresh
        set({
          activeMatterId: matterId,
          activeFormCode: formCode,
          activeFormId: formId,
          currentStep: 0,
          formData: {},
          fieldMeta: {},
          lastSavedAt: null,
          activePreviewPage: 0,
        })
      },

      setField: (path, value, origin = 'manual') =>
        set((state) => ({
          formData: setNestedValue({ ...state.formData }, path, value),
          fieldMeta: {
            ...state.fieldMeta,
            [path]: {
              origin,
              freshness: origin === 'manual' ? 'verified' : 'unverified',
              updatedAt: new Date().toISOString(),
            },
          },
          lastSavedAt: new Date().toISOString(),
        })),

      injectHeritage: (data, sourceMatterId) =>
        set((state) => {
          const now = new Date().toISOString()
          let newFormData = { ...state.formData }
          const newMeta = { ...state.fieldMeta }

          for (const [path, value] of Object.entries(data)) {
            // Never overwrite a field the user already typed manually
            if (newMeta[path]?.origin === 'manual') continue
            newFormData = setNestedValue(newFormData, path, value)
            newMeta[path] = {
              origin: 'heritage',
              freshness: 'stale', // Heritage data always needs verification
              updatedAt: now,
              sourceMatterId,
            }
          }

          return {
            formData: newFormData,
            fieldMeta: newMeta,
            lastSavedAt: now,
          }
        }),

      injectScan: (data) =>
        set((state) => {
          const now = new Date().toISOString()
          let newFormData = { ...state.formData }
          const newMeta = { ...state.fieldMeta }

          for (const [path, value] of Object.entries(data)) {
            // Never overwrite a field the user already typed manually
            if (newMeta[path]?.origin === 'manual') continue
            newFormData = setNestedValue(newFormData, path, value)
            newMeta[path] = {
              origin: 'scan',
              freshness: 'unverified',
              updatedAt: now,
            }
          }

          return {
            formData: newFormData,
            fieldMeta: newMeta,
            lastSavedAt: now,
          }
        }),

      setStep: (step) => set({ currentStep: step }),

      setPreviewPage: (page) => set({ activePreviewPage: page }),

      verifyField: (path) =>
        set((state) => ({
          fieldMeta: {
            ...state.fieldMeta,
            [path]: state.fieldMeta[path]
              ? { ...state.fieldMeta[path], freshness: 'verified' as const }
              : { origin: 'manual' as const, freshness: 'verified' as const, updatedAt: new Date().toISOString() },
          },
        })),

      resetWizard: () =>
        set({
          activeMatterId: null,
          activeFormCode: null,
          activeFormId: null,
          currentStep: 0,
          formData: {},
          fieldMeta: {},
          lastSavedAt: null,
          activePreviewPage: 0,
        }),

      hasSession: (matterId, formCode) => {
        const state = get()
        return (
          state.activeMatterId === matterId &&
          state.activeFormCode === formCode &&
          Object.keys(state.formData).length > 0
        )
      },
    }),
    {
      name: 'norvaos-form-wizard',
      partialize: (state) => ({
        activeMatterId: state.activeMatterId,
        activeFormCode: state.activeFormCode,
        activeFormId: state.activeFormId,
        currentStep: state.currentStep,
        formData: state.formData,
        fieldMeta: state.fieldMeta,
        lastSavedAt: state.lastSavedAt,
        activePreviewPage: state.activePreviewPage,
      }),
    }
  )
)

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deep-set a value at a dot-notation path on an object.
 * Returns a new reference for the modified branch (shallow clone).
 *
 * Example: setNestedValue({}, 'a.b.c', 42)  =>  { a: { b: { c: 42 } } }
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.')
  const result = { ...obj }
  let cur: Record<string, unknown> = result

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const existing = cur[key]
    if (existing === null || existing === undefined || typeof existing !== 'object') {
      cur[key] = {}
    } else {
      cur[key] = { ...(existing as Record<string, unknown>) }
    }
    cur = cur[key] as Record<string, unknown>
  }

  cur[parts[parts.length - 1]] = value
  return result
}
