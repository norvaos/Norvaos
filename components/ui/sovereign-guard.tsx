'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldAlert, AlertTriangle, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

export type GuardVariant = 'discard' | 'delete' | 'warning' | 'error'

export interface SovereignGuardOptions {
  /** Variant controls icon + accent colour */
  variant?: GuardVariant
  /** Headline  -  e.g. "Hold on..." */
  title?: string
  /** Explanatory message */
  message: string
  /** Primary (safe) button label  -  default "Keep Building" */
  confirmLabel?: string
  /** Destructive / secondary button label  -  default "Discard Progress" */
  cancelLabel?: string
  /** Called when user chooses the safe action (stay / keep) */
  onConfirm?: () => void
  /** Called when user chooses the destructive action (discard / delete) */
  onCancel?: () => void
}

interface GuardState extends SovereignGuardOptions {
  open: boolean
  resolve: ((confirmed: boolean) => void) | null
}

// ─── Variant Config ─────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<GuardVariant, {
  icon: typeof ShieldAlert
  ring: string
  glow: string
  bg: string
  iconColor: string
  destructiveBtn: string
}> = {
  discard: {
    icon: AlertTriangle,
    ring: 'ring-amber-500/30',
    glow: 'shadow-[0_0_60px_rgba(245,158,11,0.15)]',
    bg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    destructiveBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  delete: {
    icon: Trash2,
    ring: 'ring-red-500/30',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.15)]',
    bg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    destructiveBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'ring-amber-500/30',
    glow: 'shadow-[0_0_60px_rgba(245,158,11,0.15)]',
    bg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    destructiveBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  error: {
    icon: ShieldAlert,
    ring: 'ring-red-500/30',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.15)]',
    bg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    destructiveBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
}

// ─── Context ────────────────────────────────────────────────────────────────

interface SovereignGuardContextValue {
  /** Imperative: opens guard and returns a promise that resolves true (safe) or false (destructive) */
  confirm: (options: SovereignGuardOptions) => Promise<boolean>
  /** Imperative: opens guard as an alert (single OK button) */
  alert: (options: Omit<SovereignGuardOptions, 'cancelLabel' | 'onCancel'>) => Promise<void>
}

const SovereignGuardContext = createContext<SovereignGuardContextValue | null>(null)

export function useSovereignGuard() {
  const ctx = useContext(SovereignGuardContext)
  if (!ctx) {
    throw new Error('useSovereignGuard must be used within <SovereignGuardProvider>')
  }
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function SovereignGuardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GuardState>({
    open: false,
    message: '',
    resolve: null,
  })

  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((options: SovereignGuardOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({ ...options, open: true, resolve })
    })
  }, [])

  const alert = useCallback((options: Omit<SovereignGuardOptions, 'cancelLabel' | 'onCancel'>): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve()
      setState({
        ...options,
        cancelLabel: undefined,
        onCancel: undefined,
        open: true,
        resolve: () => resolve(),
      })
    })
  }, [])

  const handleSafe = useCallback(() => {
    state.onConfirm?.()
    resolveRef.current?.(true)
    resolveRef.current = null
    setState((s) => ({ ...s, open: false }))
  }, [state])

  const handleDestructive = useCallback(() => {
    state.onCancel?.()
    resolveRef.current?.(false)
    resolveRef.current = null
    setState((s) => ({ ...s, open: false }))
  }, [state])

  // Close on backdrop = treat as "safe" (stay)
  const handleBackdropClick = useCallback(() => {
    handleSafe()
  }, [handleSafe])

  const variant = state.variant ?? 'discard'
  const config = VARIANT_CONFIG[variant]
  const Icon = config.icon
  const isAlertMode = !state.cancelLabel && !state.onCancel

  return (
    <SovereignGuardContext.Provider value={{ confirm, alert }}>
      {children}

      <AnimatePresence>
        {state.open && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop  -  deep blur */}
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
              onClick={handleBackdropClick}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Glass Card */}
            <motion.div
              className={cn(
                'relative z-10 w-full max-w-md mx-4',
                'rounded-2xl border border-white/10',
                'bg-slate-900/80 backdrop-blur-xl',
                'ring-1', config.ring,
                config.glow,
                'p-6',
              )}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close X */}
              <button
                onClick={handleSafe}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Icon Badge */}
              <div className={cn('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full', config.bg)}>
                <Icon className={cn('h-7 w-7', config.iconColor)} />
              </div>

              {/* Title */}
              <h3 className="text-center text-lg font-semibold text-white mb-2">
                {state.title ?? 'Hold on...'}
              </h3>

              {/* Message */}
              <p className="text-center text-sm text-slate-300 leading-relaxed mb-6">
                {state.message}
              </p>

              {/* Buttons */}
              <div className={cn(
                'flex gap-3',
                isAlertMode ? 'justify-center' : 'justify-between'
              )}>
                {!isAlertMode && (
                  <button
                    onClick={handleDestructive}
                    className={cn(
                      'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                      config.destructiveBtn,
                    )}
                  >
                    {state.cancelLabel ?? 'Discard Progress'}
                  </button>
                )}

                <button
                  onClick={handleSafe}
                  autoFocus
                  className={cn(
                    'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                    'bg-white text-slate-900 hover:bg-slate-100',
                    'ring-1 ring-white/20',
                  )}
                >
                  {state.confirmLabel ?? (isAlertMode ? 'Got It' : 'Keep Building')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SovereignGuardContext.Provider>
  )
}
