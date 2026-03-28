'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Mail,
  Cpu,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTenant } from '@/lib/hooks/use-tenant'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemHealthStatus {
  database: 'healthy' | 'degraded' | 'down'
  email: 'connected' | 'disconnected' | 'error'
  jobQueue: 'healthy' | 'degraded' | 'down'
  lastChecked: string
  details: {
    jobQueue: { pendingCount: number; stalledCount: number }
    integrations: {
      email: { connected: boolean; provider?: string; lastSyncAt?: string }
      onedrive: { connected: boolean; lastSyncAt?: string }
    }
  }
}

// ─── Health Badge ─────────────────────────────────────────────────────────────

function HealthBadge({ status }: { status: 'healthy' | 'degraded' | 'down' | 'connected' | 'disconnected' | 'error' }) {
  if (status === 'healthy' || status === 'connected') {
    return (
      <Badge className="bg-emerald-950/40 text-emerald-400 border-emerald-500/20">
        <CheckCircle className="mr-1 h-3 w-3" />
        {status === 'connected' ? 'Connected' : 'Healthy'}
      </Badge>
    )
  }
  if (status === 'degraded' || status === 'disconnected') {
    return (
      <Badge className="bg-yellow-950/40 text-yellow-400 border-yellow-500/20">
        <AlertTriangle className="mr-1 h-3 w-3" />
        {status === 'disconnected' ? 'Disconnected' : 'Degraded'}
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-950/40 text-red-400 border-red-500/20">
      <XCircle className="mr-1 h-3 w-3" />
      {status === 'error' ? 'Error' : 'Down'}
    </Badge>
  )
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchHealth(): Promise<SystemHealthStatus> {
  const res = await fetch('/api/support/health')
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error ?? 'Health check failed')
  }
  const { data } = await res.json()
  return data as SystemHealthStatus
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupportDashboardPage() {
  const { tenant } = useTenant()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: health, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['support-health', tenant?.id, refreshKey],
    queryFn: fetchHealth,
    enabled: !!tenant?.id,
    staleTime: 1000 * 60, // 1 minute
    retry: 1,
  })

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            System health and operational indicators
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">
                Could not load health data. Check server logs for details.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health indicators */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Database */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : health ? (
              <HealthBadge status={health.database} />
            ) : null}
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : health ? (
              <div className="space-y-1">
                <HealthBadge status={health.email} />
                {health.details.integrations.email.provider && (
                  <p className="text-xs text-muted-foreground">
                    {health.details.integrations.email.provider}
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Job Queue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              Job Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : health ? (
              <div className="space-y-1">
                <HealthBadge status={health.jobQueue} />
                <p className="text-xs text-muted-foreground">
                  {health.details.jobQueue.pendingCount} pending
                  {health.details.jobQueue.stalledCount > 0 && (
                    <span className="text-yellow-600 ml-1">
                      · {health.details.jobQueue.stalledCount} stalled
                    </span>
                  )}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Last checked */}
      {health && (
        <p className="text-xs text-muted-foreground">
          Last checked: {new Date(health.lastChecked).toLocaleString('en-CA')}
        </p>
      )}

      {/* Issue intake link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report an Issue</CardTitle>
          <CardDescription>
            Submit an internal support issue for the operations team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/settings/support/issue">Open Issue Form</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
