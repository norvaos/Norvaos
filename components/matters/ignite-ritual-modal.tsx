'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck,
  ShieldX,
  Loader2,
  CheckCircle2,
  XCircle,
  Flame,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIgniteChecklist, useIgniteMatter } from '@/lib/queries/ignite'
import { useMicrosoftConnection } from '@/lib/queries/microsoft-integration'
import { useUser } from '@/lib/hooks/use-user'

// ─── Props ──────────────────────────────────────────────────────────────────

interface IgniteRitualModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  matterTitle: string
  readinessScore: number
}

// ─── Sealing Animation Overlay ──────────────────────────────────────────────

function SealingOverlay({
  matterTitle,
  onComplete,
}: {
  matterTitle: string
  onComplete: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 dark:bg-black/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Emerald progress bar sweeping across top */}
      <motion.div
        className="absolute top-0 left-0 h-1.5 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 2.2, ease: 'easeInOut' }}
        onAnimationComplete={() => {
          // Fire confetti on completion
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#10b981', '#059669', '#34d399', '#6ee7b7'],
          })
          setTimeout(onComplete, 1800)
        }}
      />

      {/* Lock icon pulsing */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.3, duration: 0.8, type: 'spring' }}
        className="mb-8"
      >
        <div className="rounded-full bg-emerald-500/20 p-6">
          <Lock className="h-16 w-16 text-emerald-400" />
        </div>
      </motion.div>

      {/* Sealing text */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-lg font-semibold text-emerald-400 tracking-wide"
      >
        Sealing Submission...
      </motion.p>

      {/* Success message (appears after bar finishes) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.4, duration: 0.6 }}
        className="mt-8 max-w-md text-centre px-6"
      >
        <p className="text-white text-centre text-base leading-relaxed">
          Matter <span className="font-bold text-emerald-300">{matterTitle}</span> has
          been Ignited. The Fortress has recorded this submission. You are now{' '}
          <span className="font-bold text-emerald-300">100% Compliant</span>.
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function IgniteRitualModal({
  open,
  onOpenChange,
  matterId,
  matterTitle,
  readinessScore,
}: IgniteRitualModalProps) {
  const [showSealing, setShowSealing] = useState(false)
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false)

  const { appUser } = useUser()
  const { data: msConnection } = useMicrosoftConnection(appUser?.id || '')
  const isMicrosoftConnected = !!msConnection && msConnection.is_active

  // Only render when readiness >= 100
  if (readinessScore < 100) return null

  const {
    data: checklist,
    isLoading: checklistLoading,
  } = useIgniteChecklist(matterId)

  const igniteMutation = useIgniteMatter(matterId)

  const allPassed = checklist?.allPassed ?? false

  const handleIgnite = useCallback(async () => {
    if (!allPassed || igniteMutation.isPending) return

    try {
      await igniteMutation.mutateAsync({ sendWelcomeEmail })
      // Show sealing animation on success
      setShowSealing(true)
    } catch {
      // Error handled by mutation's onError
    }
  }, [allPassed, igniteMutation, sendWelcomeEmail])

  const handleSealingComplete = useCallback(() => {
    setShowSealing(false)
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <>
      {/* Sealing Animation Overlay */}
      <AnimatePresence>
        {showSealing && (
          <SealingOverlay
            matterTitle={matterTitle}
            onComplete={handleSealingComplete}
          />
        )}
      </AnimatePresence>

      {/* Main Modal */}
      <Dialog open={open && !showSealing} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <Flame className="h-5 w-5 text-emerald-500" />
              Ignite Ritual  -  Guardian Gate
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              Final verification before sealing{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {matterTitle}
              </span>{' '}
              for submission. All checks must pass.
            </DialogDescription>
          </DialogHeader>

          {/* Guardian Gate Checklist */}
          <div className="mt-4 space-y-3">
            {checklistLoading ? (
              <div className="flex items-center justify-centre py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Running Guardian Gate checks...
                </span>
              </div>
            ) : (
              <>
                {checklist?.checks.map((check) => (
                  <div
                    key={check.key}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border px-4 py-3 transition-colours',
                      check.passed
                        ? 'border-emerald-500/20 bg-emerald-950/30 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                        : 'border-red-500/20 bg-red-950/30 dark:border-red-900/50 dark:bg-red-950/30',
                    )}
                  >
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          check.passed
                            ? 'text-emerald-400 dark:text-emerald-300'
                            : 'text-red-400 dark:text-red-300',
                        )}
                      >
                        {check.label}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {check.detail}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Forensic Hash */}
                {checklist?.forensicHash && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">
                      {checklist.forensicHash}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Status summary */}
          <div className="mt-4 flex items-center gap-2">
            {allPassed ? (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  All Guardian Gate checks passed
                </span>
              </>
            ) : (
              <>
                <ShieldX className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {checklist
                    ? `${checklist.checks.filter((c) => !c.passed).length} check(s) failed`
                    : 'Loading checks...'}
                </span>
              </>
            )}
          </div>

          {/* Send Welcome Email Toggle */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <Label
                htmlFor="send-welcome-email"
                className={cn(
                  'text-sm font-medium',
                  !isMicrosoftConnected && 'text-muted-foreground',
                )}
              >
                Send Welcome Email on Ignition
              </Label>
            </div>
            {isMicrosoftConnected ? (
              <Switch
                id="send-welcome-email"
                checked={sendWelcomeEmail}
                onCheckedChange={setSendWelcomeEmail}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Switch
                      id="send-welcome-email"
                      checked={false}
                      disabled
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Connect Microsoft 365 to enable</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* IGNITE SUBMISSION Button */}
          <div className="mt-6">
            <Button
              onClick={handleIgnite}
              disabled={!allPassed || igniteMutation.isPending || checklistLoading}
              className={cn(
                'w-full py-6 text-base font-bold tracking-wide uppercase transition-all duration-300',
                allPassed
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] dark:bg-emerald-600 dark:hover:bg-emerald-500'
                  : 'bg-zinc-300 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed',
              )}
            >
              {igniteMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Igniting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Flame className="h-5 w-5" />
                  Ignite Submission
                </span>
              )}
            </Button>
          </div>

          {/* Error message */}
          {igniteMutation.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400 text-centre">
              {igniteMutation.error instanceof Error
                ? igniteMutation.error.message
                : 'An error occurred'}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
