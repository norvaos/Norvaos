'use client'

/**
 * Norva Sovereign Academy — Directive 029
 *
 * High-prestige onboarding hub with three Norva Sovereign video modules.
 * Once a user watches all three videos, they receive norva_certified: true
 * in their auth.users metadata and a "Sovereign Certified" Gold Sparkle
 * border on their sidebar avatar.
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  GraduationCap,
  PlayCircle,
  CheckCircle2,
  Shield,
  Sparkles,
  Lock,
  Trophy,
  BookOpen,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Academy Module Definitions ──────────────────────────────────────────────

interface AcademyModule {
  id: string
  title: string
  description: string
  duration: string
  icon: React.ReactNode
  /** Guidde/Mux embed URL — injected per-tenant via provisioning */
  videoUrl: string | null
  topics: string[]
}

const ACADEMY_MODULES: AcademyModule[] = [
  {
    id: 'fortress-foundations',
    title: 'Module 1: The Fortress Foundations',
    description:
      'Understand the NorvaOS architecture — RLS, immutable ledgers, HMAC hash chains, and the Sovereign Shield that protects every matter.',
    duration: '12 min',
    icon: <Shield className="h-6 w-6 text-violet-600" />,
    videoUrl: null,
    topics: [
      'Row-Level Security and tenant isolation',
      'Immutable trust ledger (SHA-256 chain)',
      'Genesis Block and 3-pillar compliance',
      'PIPEDA data sovereignty enforcement',
    ],
  },
  {
    id: 'intake-to-genesis',
    title: 'Module 2: Intake to Genesis — The Breeze',
    description:
      'Master the end-to-end flow from lead intake, through OCR identity injection, conflict scanning, to the Sovereign Sparkle genesis seal.',
    duration: '18 min',
    icon: <Sparkles className="h-6 w-6 text-emerald-600" />,
    videoUrl: null,
    topics: [
      'Lead intake and OCR document parsing',
      'Global conflict search engine',
      'Readiness score and shield domains',
      'Pre-flight checklist and genesis activation',
      'Trust ledger and zero-balance closing',
    ],
  },
  {
    id: 'sovereign-oversight',
    title: 'Module 3: Sovereign Oversight — The Shield',
    description:
      'Learn to use the firm-wide compliance dashboard, audit simulation mode, emergency overrides, and the Global Expiry Sentinel.',
    duration: '15 min',
    icon: <Trophy className="h-6 w-6 text-amber-600" />,
    videoUrl: null,
    topics: [
      'Compliance health dashboard',
      'Audit simulation (LSO examination mode)',
      'Emergency override with Partner PIN',
      'Global expiry dashboard and 180-day pulse',
      'Data hardening integrity metrics',
    ],
  },
]

// ── Certification Hook ──────────────────────────────────────────────────────

function useAcademyProgress() {
  const { authUser } = useUser()

  return useQuery({
    queryKey: ['academy-progress', authUser?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { completedModules: [] as string[], isCertified: false }

      const metadata = user.user_metadata ?? {}
      const completedModules = (metadata.academy_completed_modules as string[]) ?? []
      const isCertified = metadata.norva_certified === true

      return { completedModules, isCertified }
    },
    enabled: !!authUser?.id,
    staleTime: 1000 * 30,
  })
}

function useMarkModuleComplete() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (moduleId: string) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const metadata = user.user_metadata ?? {}
      const existing = (metadata.academy_completed_modules as string[]) ?? []

      if (existing.includes(moduleId)) return { alreadyComplete: true }

      const updated = [...existing, moduleId]
      const allComplete = ACADEMY_MODULES.every((m) => updated.includes(m.id))

      const { error } = await supabase.auth.updateUser({
        data: {
          academy_completed_modules: updated,
          ...(allComplete ? { norva_certified: true, norva_certified_at: new Date().toISOString() } : {}),
        },
      })

      if (error) throw error
      return { allComplete, updated }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academy-progress'] })
    },
  })
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function AcademyPage() {
  const { data: progress, isLoading } = useAcademyProgress()
  const markComplete = useMarkModuleComplete()

  const completedModules = progress?.completedModules ?? []
  const isCertified = progress?.isCertified ?? false
  const completionPct = Math.round((completedModules.length / ACADEMY_MODULES.length) * 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-violet-600" />
            Norva Sovereign Academy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete all three modules to earn your Sovereign Certified badge
          </p>
        </div>
        {isCertified && (
          <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0 gap-1.5 px-3 py-1.5 text-sm animate-sovereign-sparkle">
            <Trophy className="h-4 w-4" />
            Sovereign Certified
          </Badge>
        )}
      </div>

      {/* Progress Bar */}
      <Card className={cn(
        'border-2 transition-colors',
        isCertified
          ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10 dark:border-amber-700'
          : 'border-violet-200 dark:border-violet-800',
      )}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {isCertified
                  ? 'All modules completed — You are Sovereign Certified'
                  : `${completedModules.length} of ${ACADEMY_MODULES.length} modules completed`}
              </span>
            </div>
            <span className="text-sm font-bold tabular-nums">{completionPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                isCertified
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
                  : 'bg-gradient-to-r from-violet-600 to-purple-600',
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Module Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {ACADEMY_MODULES.map((mod, idx) => {
          const isComplete = completedModules.includes(mod.id)
          const isMarking = markComplete.isPending

          return (
            <Card
              key={mod.id}
              className={cn(
                'relative overflow-hidden transition-all duration-300 border-2',
                isComplete
                  ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-700 dark:bg-emerald-900/10'
                  : 'border-border hover:border-violet-300 dark:hover:border-violet-700',
              )}
            >
              {/* Module number badge */}
              <div className="absolute top-3 right-3">
                {isComplete ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                    {idx + 1}
                  </div>
                )}
              </div>

              <CardHeader className="pb-3">
                <div className="mb-2">{mod.icon}</div>
                <CardTitle className="text-base leading-tight pr-8">
                  {mod.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  {mod.duration}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{mod.description}</p>

                {/* Topic List */}
                <ul className="space-y-1.5">
                  {mod.topics.map((topic) => (
                    <li key={topic} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className={cn(
                        'h-3.5 w-3.5 mt-0.5 shrink-0',
                        isComplete ? 'text-emerald-500' : 'text-muted-foreground/40',
                      )} />
                      {topic}
                    </li>
                  ))}
                </ul>

                {/* Video Player Placeholder / Embed Area */}
                <div className={cn(
                  'rounded-lg border-2 border-dashed aspect-video flex items-center justify-center',
                  isComplete
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20'
                    : 'border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-900/20',
                )}>
                  {mod.videoUrl ? (
                    <iframe
                      src={mod.videoUrl}
                      className="w-full h-full rounded-lg"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <div className="text-center space-y-2">
                      <PlayCircle className={cn(
                        'h-10 w-10 mx-auto',
                        isComplete ? 'text-emerald-400' : 'text-violet-400',
                      )} />
                      <p className="text-xs text-muted-foreground">
                        Video will be embedded during pilot provisioning
                      </p>
                    </div>
                  )}
                </div>

                {/* Mark Complete Button */}
                {!isComplete ? (
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0"
                    disabled={isMarking || isLoading}
                    onClick={() => markComplete.mutate(mod.id)}
                  >
                    {isMarking ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Mark as Completed
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-emerald-600 py-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Completed</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Certification Card */}
      {isCertified && (
        <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-900/10 dark:via-yellow-900/10 dark:to-amber-900/10 dark:border-amber-700">
          <CardContent className="py-6 text-center space-y-3">
            <div className="relative inline-block">
              <Trophy className="h-12 w-12 text-amber-500 mx-auto" />
              <Sparkles className="h-5 w-5 text-yellow-500 absolute -top-1 -right-1 animate-sovereign-sparkle" />
            </div>
            <h2 className="text-xl font-bold text-amber-800 dark:text-amber-300">
              Sovereign Certified
            </h2>
            <p className="text-sm text-amber-700/80 dark:text-amber-400/80 max-w-md mx-auto">
              You have completed all three Norva Sovereign Academy modules.
              Your sidebar avatar now bears the Gold Sparkle — the mark of a Master of the Fortress.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
