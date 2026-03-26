'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  Lock,
  Sparkles,
  ExternalLink,
  Activity,
} from 'lucide-react'

interface Matter {
  id: string
  matter_number: string
  title: string
  status: string
  genesisHash: string | null
  trustBalance: number
  integrityStatus: 'hardened' | 'soft' | 'breach'
}

interface FirmOversightData {
  matters: Matter[]
  summary: {
    totalActive: number
    hardened: number
    soft: number
    breaches: number
  }
}

export default function FirmOversightPage() {
  const { data, isLoading } = useQuery<FirmOversightData>({
    queryKey: ['firm-oversight'],
    queryFn: async () => {
      const res = await fetch('/api/admin/firm-oversight')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 15000,
  })

  const summary = data?.summary
  const matters = data?.matters ?? []

  const hardenedMatters = matters.filter((m) => m.integrityStatus === 'hardened')
  const softMatters = matters.filter((m) => m.integrityStatus === 'soft')
  const breachedMatters = matters.filter((m) => m.integrityStatus === 'breach')
  const breachCount = breachedMatters.length

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <Activity className="h-7 w-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Firm Oversight — Sovereign Health Matrix
          </h1>
          <p className="text-sm text-muted-foreground">
            5-Second Health Check for the Principal Lawyer
          </p>
        </div>
      </div>

      {/* Red Alert Pulse Banner */}
      {breachCount > 0 && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-bold text-red-700 dark:text-red-400">
                INTEGRITY BREACH DETECTED
              </p>
              <p className="text-sm text-red-600">
                Trust ledger hash chain verification failed on {breachCount}{' '}
                matter(s). Investigate immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Active</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalActive ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Hardened
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
              {summary?.hardened ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Soft
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
              {summary?.soft ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
              Integrity Breaches
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700 dark:text-red-400">
              {summary?.breaches ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breached Matters (shown first if any) */}
      {breachedMatters.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
            Breached Matters
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {breachedMatters.map((matter) => (
              <MatterCard key={matter.id} matter={matter} />
            ))}
          </div>
        </div>
      )}

      {/* Matrix Grid: Hardened vs Soft */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hardened Column */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            Hardened — Genesis Sealed
          </h2>
          {hardenedMatters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hardened matters.</p>
          ) : (
            <div className="space-y-3">
              {hardenedMatters.map((matter) => (
                <MatterCard key={matter.id} matter={matter} />
              ))}
            </div>
          )}
        </div>

        {/* Soft Column */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-700 dark:text-amber-400">
            <Lock className="h-5 w-5" />
            Soft — In Progress
          </h2>
          {softMatters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No soft matters.</p>
          ) : (
            <div className="space-y-3">
              {softMatters.map((matter) => (
                <MatterCard key={matter.id} matter={matter} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MatterCard({ matter }: { matter: Matter }) {
  const isHardened = matter.integrityStatus === 'hardened'
  const isSoft = matter.integrityStatus === 'soft'
  const isBreach = matter.integrityStatus === 'breach'

  const trustIsZero = matter.trustBalance === 0
  const isClosedWithBalance =
    matter.status === 'closed' && matter.trustBalance !== 0

  return (
    <Card
      className={cn(
        'transition-all',
        isHardened && 'border-emerald-300 dark:border-emerald-700',
        isSoft && 'border-amber-300 dark:border-amber-700',
        isBreach && 'border-red-500 animate-pulse dark:border-red-600'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isHardened && (
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
            )}
            {isSoft && <Lock className="h-5 w-5 shrink-0 text-amber-600" />}
            {isBreach && (
              <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <div>
              <CardTitle className="text-sm font-semibold leading-tight">
                {matter.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {matter.matter_number}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-xs',
              isHardened &&
                'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
              isSoft &&
                'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
              isBreach &&
                'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400'
            )}
          >
            {matter.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Genesis Hash */}
        {isHardened && matter.genesisHash ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-mono">
              {matter.genesisHash.slice(0, 16)}...
            </span>
          </div>
        ) : isSoft ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Lock className="h-3.5 w-3.5" />
            <span>Awaiting Genesis</span>
          </div>
        ) : isBreach ? (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="font-mono">
              {matter.genesisHash
                ? `${matter.genesisHash.slice(0, 16)}...`
                : 'Hash compromised'}
            </span>
          </div>
        ) : null}

        {/* Trust Balance */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trust Balance</span>
          <span
            className={cn(
              'font-mono font-semibold',
              trustIsZero
                ? 'text-emerald-600 dark:text-emerald-400'
                : isClosedWithBalance
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground'
            )}
          >
            ${matter.trustBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Integrity Status */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Integrity</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0',
              isHardened &&
                'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400',
              isSoft &&
                'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
              isBreach &&
                'border-red-400 text-red-700 dark:border-red-600 dark:text-red-400'
            )}
          >
            {isHardened && 'Verified'}
            {isSoft && 'Pending'}
            {isBreach && 'BREACH'}
          </Badge>
        </div>

        {/* Investigate Breach Button */}
        {isBreach && (
          <Button
            asChild
            variant="destructive"
            size="sm"
            className="mt-2 w-full"
          >
            <Link href={`/matters/${matter.id}?tab=trust`}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Investigate Breach
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
