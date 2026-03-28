'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useOverriddenLeads,
  useStaleLeads,
  useNudgeStaff,
  type OverriddenLead,
  type StaleLead,
} from '@/lib/queries/principal-radar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Shield,
  AlertTriangle,
  Clock,
  Send,
  Eye,
  Loader2,
  ShieldAlert,
  Zap,
  Lock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATE_LABELS: Record<string, string> = {
  conflict_check: 'Conflict Check',
  strategy_meeting: 'Strategy Meeting',
  id_capture: 'ID Capture',
}

const panelVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RadarHeader() {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 text-white">
          <Shield className="size-5" />
        </div>
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
          >
            Principal&apos;s Radar
          </h1>
          <p className="text-sm text-muted-foreground">
            Sovereignty monitor — overridden gates &amp; stale engagements
          </p>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  colour,
}: {
  icon: React.ElementType
  label: string
  value: number
  colour: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex items-center justify-center size-11 rounded-lg ${colour}`}>
          <Icon className="size-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function OverrideRow({
  item,
  onNudge,
  nudgingId,
}: {
  item: OverriddenLead
  onNudge: (item: OverriddenLead) => void
  nudgingId: string | null
}) {
  const router = useRouter()
  const name = [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
  const gateLabel = GATE_LABELS[item.gate_key] ?? item.gate_key

  return (
    <motion.div
      layout
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center size-9 rounded-full bg-amber-950/40 dark:bg-amber-900/40">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0">
              {gateLabel} — OVERRIDDEN
            </Badge>
            {item.assigned_user_name && (
              <span className="truncate">→ {item.assigned_user_name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => router.push(`/command/lead/${item.lead_id}`)}
        >
          <Eye className="size-3.5 mr-1" />
          View
        </Button>
        {item.assigned_to && (
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={nudgingId === item.override_id}
            onClick={() => onNudge(item)}
          >
            {nudgingId === item.override_id ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Send className="size-3.5 mr-1" />
            )}
            Nudge
          </Button>
        )}
      </div>
    </motion.div>
  )
}

function StaleRow({
  item,
  onNudge,
  nudgingId,
}: {
  item: StaleLead
  onNudge: (item: StaleLead) => void
  nudgingId: string | null
}) {
  const router = useRouter()
  const name = [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
  const hoursLabel = item.hours_stale >= 72
    ? `${Math.round(item.hours_stale / 24)}d stale`
    : `${item.hours_stale}h stale`

  return (
    <motion.div
      layout
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center size-9 rounded-full bg-red-950/40 dark:bg-red-900/40">
          <Clock className="size-4 text-red-600 dark:text-red-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-red-500/50 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0">
              {hoursLabel}
            </Badge>
            {item.lead_status && (
              <span className="capitalize">{item.lead_status.replace(/_/g, ' ')}</span>
            )}
            {item.assigned_user_name && (
              <span className="truncate">→ {item.assigned_user_name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => router.push(`/command/lead/${item.lead_id}`)}
        >
          <Eye className="size-3.5 mr-1" />
          View
        </Button>
        {item.assigned_to && (
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white"
            disabled={nudgingId === item.lead_id}
            onClick={() => onNudge(item)}
          >
            {nudgingId === item.lead_id ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Zap className="size-3.5 mr-1" />
            )}
            Nudge
          </Button>
        )}
      </div>
    </motion.div>
  )
}

function EmptyRadar({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex items-center justify-center size-12 rounded-full bg-emerald-950/40 dark:bg-emerald-900/40 mb-3">
        <Shield className="size-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <p className="text-sm font-medium text-emerald-400 dark:text-emerald-300">All clear</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PrincipalRadarPage() {
  const router = useRouter()
  const { role, isLoading: roleLoading } = useUserRole()
  const { appUser } = useUser()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Gate: owner-only access
  const isOwner = role?.name?.toLowerCase() === 'owner'

  useEffect(() => {
    if (!roleLoading && !isOwner) {
      router.replace('/')
    }
  }, [roleLoading, isOwner, router])

  // Data
  const { data: overrides, isLoading: overridesLoading } = useOverriddenLeads(tenantId)
  const { data: staleLeads, isLoading: staleLoading } = useStaleLeads(tenantId)
  const nudge = useNudgeStaff()

  // Track which row is currently being nudged
  const [nudgingId, setNudgingId] = useState<string | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<'overrides' | 'stale'>('overrides')

  async function handleNudgeOverride(item: OverriddenLead) {
    if (!item.assigned_to || !tenantId) return
    setNudgingId(item.override_id)
    try {
      await nudge.mutateAsync({
        tenantId,
        recipientUserId: item.assigned_to,
        leadId: item.lead_id,
        contactName: [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || 'Unknown',
        reason: 'overridden_gate',
        detail: GATE_LABELS[item.gate_key] ?? item.gate_key,
      })
    } finally {
      setNudgingId(null)
    }
  }

  async function handleNudgeStale(item: StaleLead) {
    if (!item.assigned_to || !tenantId) return
    setNudgingId(item.lead_id)
    try {
      await nudge.mutateAsync({
        tenantId,
        recipientUserId: item.assigned_to,
        leadId: item.lead_id,
        contactName: [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || 'Unknown',
        reason: 'stale_engagement',
      })
    } finally {
      setNudgingId(null)
    }
  }

  // Don't render anything until role is resolved
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isOwner) return null

  const overrideCount = overrides?.length ?? 0
  const staleCount = staleLeads?.length ?? 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <RadarHeader />

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          icon={ShieldAlert}
          label="Overridden Gates"
          value={overrideCount}
          colour="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <StatCard
          icon={Clock}
          label="Stale Leads (48h+)"
          value={staleCount}
          colour="bg-gradient-to-br from-red-500 to-rose-600"
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-muted/50 w-fit">
        <button
          onClick={() => setActiveTab('overrides')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overrides'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="size-3.5 inline-block mr-1.5 -mt-0.5" />
          Overridden Gates
          {overrideCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
              {overrideCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('stale')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'stale'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="size-3.5 inline-block mr-1.5 -mt-0.5" />
          Stale Leads
          {staleCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
              {staleCount}
            </Badge>
          )}
        </button>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {activeTab === 'overrides' ? (
              <>
                <Lock className="size-4 inline-block mr-2 text-amber-500 -mt-0.5" />
                Golden Thread Overrides
              </>
            ) : (
              <>
                <AlertTriangle className="size-4 inline-block mr-2 text-red-500 -mt-0.5" />
                Stale Engagements
              </>
            )}
          </CardTitle>
          <CardDescription>
            {activeTab === 'overrides'
              ? 'Leads with bypassed compliance gates requiring review'
              : 'Active leads with no activity for 48+ hours'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {activeTab === 'overrides' && (
              <motion.div
                key="overrides"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
              >
                {overridesLoading ? (
                  <LoadingSkeleton />
                ) : overrideCount === 0 ? (
                  <EmptyRadar label="No overridden gates — compliance is intact" />
                ) : (
                  overrides!.map((item) => (
                    <OverrideRow
                      key={item.override_id}
                      item={item}
                      onNudge={handleNudgeOverride}
                      nudgingId={nudgingId}
                    />
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'stale' && (
              <motion.div
                key="stale"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
              >
                {staleLoading ? (
                  <LoadingSkeleton />
                ) : staleCount === 0 ? (
                  <EmptyRadar label="No stale leads — all engagements are active" />
                ) : (
                  staleLeads!.map((item) => (
                    <StaleRow
                      key={item.lead_id}
                      item={item}
                      onNudge={handleNudgeStale}
                      nudgingId={nudgingId}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
