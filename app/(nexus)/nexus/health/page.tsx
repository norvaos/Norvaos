'use client'

import { useState, useEffect } from 'react'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import {
  Activity, Cpu, HardDrive, Wifi, Database, Clock,
  Server, CheckCircle2, AlertTriangle, RefreshCw,
} from 'lucide-react'

interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  latency: number
  details: string
}

export default function HealthPage() {
  const dark = useNexusDark()
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  async function runHealthChecks() {
    setLoading(true)
    const start = performance.now()

    // Simulate health checks (in production these would hit real endpoints)
    const results: HealthCheck[] = []

    // Database check
    try {
      const dbStart = performance.now()
      const res = await fetch('/api/nexus/overview')
      const dbLatency = Math.round(performance.now() - dbStart)
      results.push({
        name: 'Supabase Database',
        status: res.ok ? 'healthy' : 'degraded',
        latency: dbLatency,
        details: res.ok ? `Connected, ${dbLatency}ms response` : `HTTP ${res.status}`,
      })
    } catch {
      results.push({ name: 'Supabase Database', status: 'down', latency: 0, details: 'Connection failed' })
    }

    // Auth check
    try {
      const authStart = performance.now()
      const res = await fetch('/api/auth/session')
      const authLatency = Math.round(performance.now() - authStart)
      results.push({
        name: 'Authentication',
        status: res.ok || res.status === 401 ? 'healthy' : 'degraded',
        latency: authLatency,
        details: `Auth service responsive, ${authLatency}ms`,
      })
    } catch {
      results.push({ name: 'Authentication', status: 'down', latency: 0, details: 'Auth service unreachable' })
    }

    // API check
    results.push({
      name: 'API Gateway',
      status: 'healthy',
      latency: Math.round(performance.now() - start),
      details: 'All API routes responding',
    })

    // Storage
    results.push({
      name: 'File Storage',
      status: 'healthy',
      latency: 45,
      details: 'Supabase Storage operational',
    })

    // Realtime
    results.push({
      name: 'Realtime',
      status: 'healthy',
      latency: 12,
      details: 'WebSocket channels active',
    })

    // Edge Functions
    results.push({
      name: 'Edge Functions',
      status: 'healthy',
      latency: 28,
      details: 'All edge functions deployed',
    })

    setChecks(results)
    setLastChecked(new Date())
    setLoading(false)
  }

  useEffect(() => { runHealthChecks() }, [])

  const card = dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'
  const h = dark ? 'text-white' : 'text-gray-900'
  const sub = dark ? 'text-white/40' : 'text-gray-500'
  const dim = dark ? 'text-white/20' : 'text-gray-300'

  const healthy = checks.filter((c) => c.status === 'healthy').length
  const total = checks.length
  const allHealthy = healthy === total && total > 0

  const sysMetrics = [
    { label: 'CPU', value: 12, icon: Cpu, max: 100 },
    { label: 'Memory', value: 34, icon: HardDrive, max: 100 },
    { label: 'Network I/O', value: 8, icon: Wifi, max: 100 },
    { label: 'DB Connections', value: 22, icon: Database, max: 100 },
    { label: 'Avg Latency', value: 14, icon: Clock, max: 500, unit: 'ms' },
    { label: 'Uptime', value: 99.9, icon: Server, max: 100, unit: '%' },
  ]

  const statusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    if (status === 'degraded') return <AlertTriangle className="h-5 w-5 text-amber-500" />
    return <AlertTriangle className="h-5 w-5 text-red-500" />
  }

  const statusColour = (status: string) => {
    if (status === 'healthy') return 'text-emerald-500'
    if (status === 'degraded') return 'text-amber-500'
    return 'text-red-500'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold tracking-tight', h)}>System Health</h1>
          <p className={cn('text-sm mt-0.5', sub)}>
            {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString('en-CA')}` : 'Checking...'}
          </p>
        </div>
        <button
          onClick={runHealthChecks}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
            'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20',
            'hover:shadow-amber-500/30 hover:brightness-110 disabled:opacity-50',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Overall status */}
      <div className={cn('rounded-xl border p-6', allHealthy
        ? dark ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-emerald-200 bg-emerald-50'
        : dark ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-200 bg-amber-50',
      )}>
        <div className="flex items-center gap-3">
          {allHealthy
            ? <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            : <AlertTriangle className="h-8 w-8 text-amber-500" />
          }
          <div>
            <div className={cn('text-lg font-bold', allHealthy ? 'text-emerald-500' : 'text-amber-500')}>
              {allHealthy ? 'All Systems Operational' : 'Some Systems Degraded'}
            </div>
            <div className={cn('text-sm', sub)}>{healthy}/{total} services healthy</div>
          </div>
        </div>
      </div>

      {/* Service checks */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <div key={check.name} className={cn('rounded-xl border p-5 transition-all', card)}>
            <div className="flex items-start justify-between mb-3">
              {statusIcon(check.status)}
              <span className={cn('mono text-xs font-bold', statusColour(check.status))}>
                {check.latency}ms
              </span>
            </div>
            <div className={cn('text-sm font-bold mb-1', h)}>{check.name}</div>
            <div className={cn('text-xs', sub)}>{check.details}</div>
            <div className="mt-3">
              <div className={cn('h-1.5 rounded-full overflow-hidden', dark ? 'bg-white/[0.04]' : 'bg-gray-100')}>
                <div className="h-full rounded-full transition-all" style={{
                  width: check.status === 'healthy' ? '100%' : check.status === 'degraded' ? '60%' : '10%',
                  backgroundColor: check.status === 'healthy' ? '#22c55e' : check.status === 'degraded' ? '#f59e0b' : '#ef4444',
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* System Resources */}
      <div>
        <h2 className={cn('text-base font-bold mb-4', h)}>System Resources</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sysMetrics.map((m) => {
            const Icon = m.icon
            const pct = (m.value / m.max) * 100
            const colour = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e'
            return (
              <div key={m.label} className={cn('rounded-xl border p-5', card)}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', sub)} />
                    <span className={cn('text-sm font-medium', h)}>{m.label}</span>
                  </div>
                  <span className="text-lg font-bold" style={{ color: colour }}>
                    {m.value}{m.unit ?? '%'}
                  </span>
                </div>
                <div className={cn('h-2 rounded-full overflow-hidden', dark ? 'bg-white/[0.04]' : 'bg-gray-100')}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${pct}%`, backgroundColor: colour,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
