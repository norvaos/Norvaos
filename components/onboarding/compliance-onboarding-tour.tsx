'use client'

/**
 * ComplianceOnboardingTour  -  Directive: Compliance Onboarding
 *
 * A guided product tour for new users that walks through every
 * compliance surface in NorvaOS, with dedicated Law Society of Ontario
 * compliance guidance. Features light/dark mode toggle inside the tour.
 *
 * Activation:
 *   - Auto-triggers on first login (user_metadata.onboarding_tour_completed is not set)
 *   - Can be re-triggered from the Academy or settings
 *
 * Persistence:
 *   - On completion or skip → sets user_metadata.onboarding_tour_completed: true
 *   - Current step stored in component state (not persisted across sessions)
 *
 * Tour Stops (10):
 *   1. Welcome  -  What NorvaOS protects
 *   2. LSO Compliance Overview  -  What the Law Society requires
 *   3. LSO Trust Accounting Rules  -  Rule 3.7, bookkeeping, reconciliation
 *   4. LSO Record Keeping & Audit Readiness  -  How to stay compliant at all times
 *   5. Glass Fortress  -  The Sovereign Matrix dashboard
 *   6. Readiness Ring  -  Matter shield domains & score
 *   7. Genesis Block  -  Pre-Flight Checklist & Sovereign Sparkle
 *   8. Trust Ledger  -  Immutable audit chain
 *   9. Compliance Dashboard  -  Audit Simulation mode
 *   10. Academy & Ignite  -  Certification and Sovereign Ignition
 */

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Shield,
  Sparkles,
  ShieldCheck,
  Landmark,
  GraduationCap,
  Flame,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Scale,
  BookOpen,
  FileCheck2,
  Sun,
  Moon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Tour Steps ──────────────────────────────────────────────────────────────

interface TourStep {
  id: string
  title: string
  description: string
  icon: ReactNode
  /** CSS colour class for the icon in dark mode */
  accentDark: string
  /** CSS colour class for the icon in light mode */
  accentLight: string
  /** Navigation target (optional  -  if set, user is redirected when step activates) */
  href?: string
  /** Detailed explanation shown below the description */
  details: string[]
  /** Optional callout box for compliance-critical guidance */
  complianceNote?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the Fortress',
    description: 'NorvaOS is the most compliant immigration operating system ever built. This tour walks you through every layer of protection  -  and teaches you how to stay compliant at all times.',
    icon: <Shield className="h-6 w-6" />,
    accentDark: 'text-violet-400',
    accentLight: 'text-violet-600',
    details: [
      'Row-Level Security isolates every tenant\'s data',
      'SHA-256 hash chains ensure mathematical data integrity',
      'All data stored exclusively in Canada (ca-central-1) under federal privacy law',
      'Every action is logged to the SENTINEL audit trail',
      'Tip: Use the Sun/Moon button below to switch between light and dark mode',
    ],
  },
  {
    id: 'lso-overview',
    title: 'Law Society of Ontario  -  Your Obligations',
    description: 'As a licensed lawyer in Ontario, you are bound by the Rules of Professional Conduct and the By-Laws of the Law Society of Ontario (LSO). NorvaOS automates and enforces these obligations.',
    icon: <Scale className="h-6 w-6" />,
    accentDark: 'text-amber-400',
    accentLight: 'text-amber-600',
    details: [
      'By-Law 9: Trust accounting, record retention, and financial obligations',
      'Rule 3.1: Competence  -  you must understand your compliance tools',
      'Rule 3.2: Quality of Service  -  client files must be accurate and current',
      'Rule 3.3: Confidentiality  -  client data must be protected at all times',
      'Rule 3.7: Trust accounting  -  funds must be properly handled and reconciled',
      'Rule 5.1: Supervision  -  partners must oversee all compliance obligations',
    ],
    complianceNote: 'LSO spot audits can happen at any time. NorvaOS keeps you audit-ready 24/7  -  but YOU must ensure the data entered is accurate. The system verifies integrity, not truth.',
  },
  {
    id: 'lso-trust-rules',
    title: 'LSO Trust Accounting  -  Rules You Must Follow',
    description: 'Trust accounting violations are the #1 cause of LSO discipline proceedings. NorvaOS enforces these rules at the database level so mistakes become structurally impossible.',
    icon: <Landmark className="h-6 w-6" />,
    accentDark: 'text-emerald-400',
    accentLight: 'text-emerald-600',
    details: [
      'By-Law 9, s.18: Trust funds must never be overdrawn  -  NorvaOS blocks this at DB level',
      'By-Law 9, s.27: Monthly three-way reconciliation  -  NorvaOS runs this automatically nightly',
      'By-Law 9, s.18(6): Client trust ledger must show each receipt and disbursement  -  our ledger is append-only',
      'By-Law 9, s.26: Maintain a book of duplicate receipts  -  every transaction auto-generates an audit entry',
      'Rule 3.7-2: Zero-balance before file closure  -  NorvaOS blocks closing with residual funds',
      'Tip: Run "Simulate LSO Examination" monthly from the Compliance Dashboard to verify everything',
    ],
    complianceNote: 'If the LSO auditor asks to see your trust ledger, use the "Export Audit" button on any matter. The PDF is password-protected, hash-chained, and includes the Global Firm Hash on every page.',
  },
  {
    id: 'lso-record-keeping',
    title: 'Staying Compliant at All Times',
    description: 'Compliance is not a one-time event  -  it is a continuous practice. Here is how NorvaOS helps you maintain compliance every single day.',
    icon: <BookOpen className="h-6 w-6" />,
    accentDark: 'text-violet-400',
    accentLight: 'text-violet-600',
    details: [
      'Daily: NorvaOS runs Continuity Sequence at 02:00 AM  -  checks address gaps, document expiry, stale matters',
      'Weekly: Review the Compliance Dashboard for any warnings or integrity issues',
      'Monthly: Run the "Simulate LSO Examination" to generate a full Battle-Ready scorecard',
      'Per Matter: Always complete the Pre-Flight Checklist before activating (Identity, History, Trust)',
      'Per Closure: Verify zero trust balance before closing any file (automated by NorvaOS)',
      'Always: Never bypass the conflict check  -  NorvaOS logs every override to SENTINEL',
    ],
    complianceNote: 'The Genesis Block is your digital proof that a matter was opened correctly. It cannot be altered. If you are ever questioned about a file opening, the Genesis Block is your first line of defence.',
  },
  {
    id: 'glass-fortress',
    title: 'The Sovereign Matrix Dashboard',
    description: 'Your main dashboard shows every active matter in a glassmorphism grid. Hover any sealed matter to see its SHA-256 hash connecting to the Global Firm Hash.',
    icon: <Sparkles className="h-6 w-6" />,
    accentDark: 'text-emerald-400',
    accentLight: 'text-emerald-600',
    href: '/',
    details: [
      'Global Firm Hash: HMAC-SHA256 of all genesis blocks across the firm',
      'Micro-Audit Trace: Hover 500ms reveals the cryptographic chain',
      'Readiness Ring: High-fidelity SVG gauge with heat-map colouring',
      'Gold Aura: Glows on matters with 100% readiness and sealed genesis',
    ],
  },
  {
    id: 'readiness-ring',
    title: 'Readiness Score & Shield Domains',
    description: 'Every matter has a composite readiness score built from 5 domains. The shield glows emerald when Documents, Review, and Compliance all reach 100%.',
    icon: <ShieldCheck className="h-6 w-6" />,
    accentDark: 'text-emerald-400',
    accentLight: 'text-emerald-600',
    details: [
      'Documents (22%): All required document slots filled and accepted',
      'Review (18%): Lawyer review of every uploaded document',
      'Compliance (11%): Conflict check + KYC verification + retainer agreement',
      'Score < 35: Red pulse heartbeat warns the matter needs urgent attention',
      'Score = 100 + shield complete: Emerald glow + Gold Aura  -  ready for genesis',
    ],
  },
  {
    id: 'genesis-block',
    title: 'Pre-Flight & Genesis Block',
    description: 'Before a matter can be activated, three hard-gate checks must pass. Only then can the immutable Genesis Block be sealed  -  your cryptographic proof of proper file opening.',
    icon: <Sparkles className="h-6 w-6" />,
    accentDark: 'text-amber-400',
    accentLight: 'text-amber-600',
    details: [
      'Check 1  -  Identity: 100% match between passport and intake data',
      'Check 2  -  History: 0 days unaccounted in the immigration timeline',
      'Check 3  -  Trust: Hash chain parity (every transaction has a matching audit entry)',
      'All three green → "Generate Genesis Block" activates inside the modal',
      'Genesis seal → Sovereign Confetti → matter status changes to ACTIVE',
    ],
    complianceNote: 'The Genesis Block contains the SHA-256 hash of your conflict check, KYC verification, and retainer status at the moment of activation. This is immutable evidence for LSO audits.',
  },
  {
    id: 'trust-ledger',
    title: 'Immutable Trust Ledger',
    description: 'Every trust dollar is tracked on an append-only, SHA-256 hash-chained ledger. No row can ever be modified or deleted  -  this is your mathematical proof of financial integrity.',
    icon: <Landmark className="h-6 w-6" />,
    accentDark: 'text-violet-400',
    accentLight: 'text-violet-600',
    details: [
      'INSERT-only enforcement via database triggers + Row-Level Security',
      'Running balance computed atomically  -  overdraft blocked at the DB level',
      'Every transaction auto-generates a trust_ledger_audit entry with SHA-256 hash',
      'Zero-balance verification enforced before matter closure (LSO By-Law 9)',
      'Three-way reconciliation runs nightly and flags discrepancies immediately',
    ],
  },
  {
    id: 'compliance-dashboard',
    title: 'Compliance Dashboard & Audit Simulation',
    description: 'The admin compliance view shows real-time firm health. Run a full "Simulate LSO Examination" to verify every hash chain across every active matter.',
    icon: <BarChart3 className="h-6 w-6" />,
    accentDark: 'text-emerald-400',
    accentLight: 'text-emerald-600',
    href: '/admin/compliance',
    details: [
      'Region Lock: Confirms all data is in Canadian data centres (ca-central-1)',
      'Encryption Status: Verifies PII ciphertext format (AES-256-GCM)',
      'Audit Parity: trust_transactions count must equal trust_ledger_audit count',
      'SENTINEL Summary: 24-hour security event breakdown by severity',
      'Simulate LSO Examination: Full integrity check on every matter → per-matter PDF export',
    ],
    complianceNote: 'Run the simulation monthly. If it returns "BATTLE-READY," your firm can withstand an unannounced LSO spot audit. If it returns "ISSUES FOUND," address every red item immediately.',
  },
  {
    id: 'academy-ignite',
    title: 'Academy & Sovereign Ignition',
    description: 'Complete three Academy modules to earn your Sovereign Certified badge with a Gold Sparkle border on your avatar. Then seal your commitment at /ignite.',
    icon: <GraduationCap className="h-6 w-6" />,
    accentDark: 'text-amber-400',
    accentLight: 'text-amber-600',
    href: '/academy',
    details: [
      'Module 1: Fortress Foundations  -  RLS, SHA-256 hashing, PIPEDA enforcement',
      'Module 2: Intake to Genesis  -  OCR, conflict scanning, readiness, genesis activation',
      'Module 3: Sovereign Oversight  -  compliance dashboard, audit simulation, emergency overrides',
      'All three complete → norva_certified: true → Gold Sparkle border on your sidebar avatar',
      '/ignite: The Sovereign Ignition ceremony  -  hold-to-ignite for 3 seconds with 3D confetti',
    ],
    complianceNote: 'LSO Rule 3.1 requires lawyers to maintain competence. Completing the Norva Sovereign Academy demonstrates your understanding of the compliance tools protecting your practice.',
  },
]

// ── Tour Context ────────────────────────────────────────────────────────────

interface TourContextType {
  isActive: boolean
  currentStep: number
  totalSteps: number
  startTour: () => void
  endTour: () => void
}

const TourContext = createContext<TourContextType>({
  isActive: false,
  currentStep: 0,
  totalSteps: TOUR_STEPS.length,
  startTour: () => {},
  endTour: () => {},
})

export function useTour() {
  return useContext(TourContext)
}

// ── Tour Status Hook ────────────────────────────────────────────────────────

function useTourStatus() {
  const { authUser } = useUser()

  return useQuery({
    queryKey: ['onboarding-tour-status', authUser?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { completed: true } // Fail closed

      const metadata = user.user_metadata ?? {}
      return {
        completed: metadata.onboarding_tour_completed === true,
      }
    },
    enabled: !!authUser?.id,
    staleTime: 1000 * 60 * 10,
  })
}

function useCompleteTour() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: {
          onboarding_tour_completed: true,
          onboarding_tour_completed_at: new Date().toISOString(),
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tour-status'] })
    },
  })
}

// ── Tour Provider ───────────────────────────────────────────────────────────

export function ComplianceOnboardingTourProvider({ children }: { children: ReactNode }) {
  const { data: tourStatus } = useTourStatus()
  const completeTour = useCompleteTour()
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  // Auto-trigger on first login if tour not completed
  useEffect(() => {
    if (tourStatus && !tourStatus.completed) {
      const timer = setTimeout(() => setIsActive(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [tourStatus])

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
  }, [])

  /** Close the overlay without marking as completed  -  user can re-trigger later */
  const dismissTour = useCallback(() => {
    setIsActive(false)
    setCurrentStep(0)
  }, [])

  /** Close AND mark as completed (only when all steps finished) */
  const finishTour = useCallback(() => {
    setIsActive(false)
    setCurrentStep(0)
    completeTour.mutate()
  }, [completeTour])

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: TOUR_STEPS.length,
        startTour,
        endTour: dismissTour,
      }}
    >
      {children}
      {isActive && (
        <TourOverlay
          step={currentStep}
          onNext={() => {
            if (currentStep < TOUR_STEPS.length - 1) {
              setCurrentStep((s) => s + 1)
            } else {
              finishTour()
            }
          }}
          onPrev={() => setCurrentStep((s) => Math.max(0, s - 1))}
          onSkip={dismissTour}
        />
      )}
    </TourContext.Provider>
  )
}

// ── Theme Toggle Button ─────────────────────────────────────────────────────

function TourThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        setTheme(isDark ? 'light' : 'dark')
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300',
        isDark
          ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20'
          : 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 border border-violet-500/20',
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5" />
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" />
          <span>Dark Mode</span>
        </>
      )}
    </button>
  )
}

// ── Tour Overlay ────────────────────────────────────────────────────────────

function TourOverlay({
  step,
  onNext,
  onPrev,
  onSkip,
}: {
  step: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const tourStep = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === TOUR_STEPS.length - 1
  const progress = ((step + 1) / TOUR_STEPS.length) * 100
  const accent = isDark ? tourStep.accentDark : tourStep.accentLight

  // Navigate to step's href if specified
  useEffect(() => {
    if (tourStep.href) {
      router.push(tourStep.href)
    }
  }, [tourStep.href, router])

  return (
    <>
      {/* Backdrop  -  clicking does NOT dismiss; tour must be completed or explicitly skipped */}
      <div
        className={cn(
          'fixed inset-0 z-[9998] transition-opacity duration-500 animate-in fade-in',
          isDark
            ? 'bg-black/60 backdrop-blur-sm'
            : 'bg-white/60 backdrop-blur-sm',
        )}
      />

      {/* Tour Card */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto relative w-full max-w-lg rounded-3xl border p-6',
            'shadow-2xl',
            'animate-in slide-in-from-bottom-4 fade-in duration-500',
            isDark
              ? 'bg-slate-900/95 backdrop-blur-2xl border-white/[0.08] shadow-black/40'
              : 'bg-white/95 backdrop-blur-2xl border-slate-200 shadow-slate-300/40',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top bar: Theme toggle + Close */}
          <div className="flex items-center justify-between mb-4">
            <TourThemeToggle />
            <button
              type="button"
              onClick={onSkip}
              className={cn(
                'rounded-full p-1.5 transition-colors',
                isDark
                  ? 'text-white/30 hover:text-white/60 hover:bg-white/10'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
              )}
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step indicator dots */}
          <div className="flex items-center gap-2 mb-5">
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300',
                    idx === step
                      ? cn('w-6', isDark ? 'bg-emerald-500' : 'bg-emerald-600')
                      : idx < step
                        ? cn('w-3', isDark ? 'bg-emerald-500/40' : 'bg-emerald-600/30')
                        : cn('w-3', isDark ? 'bg-white/10' : 'bg-slate-200'),
                  )}
                />
              ))}
            </div>
            <span className={cn(
              'text-[10px] ml-auto tabular-nums',
              isDark ? 'text-white/30' : 'text-slate-400',
            )}>
              {step + 1} / {TOUR_STEPS.length}
            </span>
          </div>

          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              isDark
                ? 'bg-white/[0.06] border border-white/[0.08]'
                : 'bg-slate-50 border border-slate-200',
              accent,
            )}>
              {tourStep.icon}
            </div>
            <div className="min-w-0">
              <h3 className={cn(
                'text-lg font-bold leading-tight',
                isDark ? 'text-white/90' : 'text-slate-900',
              )}>
                {tourStep.title}
              </h3>
              <p className={cn(
                'text-sm mt-1 leading-relaxed',
                isDark ? 'text-white/50' : 'text-slate-500',
              )}>
                {tourStep.description}
              </p>
            </div>
          </div>

          {/* Detail bullets */}
          <div className={cn(
            'rounded-2xl border p-4 mb-4',
            isDark
              ? 'bg-white/[0.03] border-white/[0.05]'
              : 'bg-slate-50/80 border-slate-100',
          )}>
            <ul className="space-y-2">
              {tourStep.details.map((detail, idx) => (
                <li
                  key={idx}
                  className={cn(
                    'flex items-start gap-2.5 text-xs leading-relaxed',
                    isDark ? 'text-white/45' : 'text-slate-600',
                  )}
                  style={{
                    animation: `fadeSlideIn 0.3s ease-out ${idx * 0.08}s both`,
                  }}
                >
                  <CheckCircle2 className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', accent)} />
                  {detail}
                </li>
              ))}
            </ul>
          </div>

          {/* LSO Compliance Note  -  highlighted callout */}
          {tourStep.complianceNote && (
            <div className={cn(
              'rounded-2xl border-2 p-4 mb-4',
              isDark
                ? 'bg-amber-500/[0.06] border-amber-500/20'
                : 'bg-amber-50 border-amber-200',
            )}>
              <div className="flex items-start gap-2.5">
                <Scale className={cn(
                  'h-4 w-4 mt-0.5 shrink-0',
                  isDark ? 'text-amber-400' : 'text-amber-600',
                )} />
                <div>
                  <p className={cn(
                    'text-[10px] font-bold uppercase tracking-wider mb-1',
                    isDark ? 'text-amber-400/70' : 'text-amber-700',
                  )}>
                    LSO Compliance Note
                  </p>
                  <p className={cn(
                    'text-xs leading-relaxed',
                    isDark ? 'text-amber-300/60' : 'text-amber-800/80',
                  )}>
                    {tourStep.complianceNote}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className={cn(
            'h-1 rounded-full overflow-hidden mb-5',
            isDark ? 'bg-white/[0.06]' : 'bg-slate-100',
          )}>
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isDark
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className={cn(
                isDark
                  ? 'text-white/30 hover:text-white/60 hover:bg-white/5'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
              )}
            >
              Skip Tour
            </Button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrev}
                  className={cn(
                    isDark
                      ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNext}
                className={cn(
                  'border-0',
                  isLast
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white'
                    : isDark
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white'
                      : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white',
                )}
              >
                {isLast ? (
                  <>
                    <Flame className="h-4 w-4 mr-1" />
                    Complete Tour
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
