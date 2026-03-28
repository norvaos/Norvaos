'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
  Shield,
  Skull,
  Link2,
  Link2Off,
} from 'lucide-react'
import { format } from 'date-fns'

import { useUserRole } from '@/lib/hooks/use-user-role'
import { useUser } from '@/lib/hooks/use-user'
import { hasPermission } from '@/lib/utils/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'

// ── Types ────────────────────────────────────────────────────────────────────

interface SentinelEvent {
  id: string
  event_type: string
  severity: 'info' | 'warning' | 'critical' | 'breach'
  tenant_id: string | null
  user_id: string | null
  auth_user_id: string | null
  table_name: string | null
  record_id: string | null
  ip_address: string | null
  request_path: string | null
  details: Record<string, unknown>
  created_at: string
}

interface SentinelResponse {
  events: SentinelEvent[]
  counts: {
    total: number
    critical: number
    breach: number
    warning: number
    info: number
  }
  limit: number
  error?: string
}

// ── Severity Config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  breach: {
    label: 'Breach',
    icon: Skull,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-600 text-white hover:bg-red-700',
    dot: 'bg-red-500',
  },
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-600 text-white hover:bg-orange-700',
    dot: 'bg-orange-500',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-600 text-white hover:bg-amber-700',
    dot: 'bg-amber-500',
  },
  info: {
    label: 'Info',
    icon: Info,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-600 text-white hover:bg-blue-700',
    dot: 'bg-blue-500',
  },
} as const

// ── Expandable Details ───────────────────────────────────────────────────────

function ExpandableDetails({ details }: { details: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)

  if (!details || Object.keys(details).length === 0) {
    return <span className="text-muted-foreground text-xs"> - </span>
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? 'Collapse' : 'View forensics'}
      </button>
      {expanded && (
        <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-x-auto max-w-sm whitespace-pre-wrap break-all font-mono">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  count,
  severity,
}: {
  label: string
  count: number
  severity: keyof typeof SEVERITY_CONFIG
}) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold ${config.text} mt-1`}>{count}</p>
        </div>
        <Icon className={`h-8 w-8 ${config.text} opacity-60`} />
      </div>
    </div>
  )
}

// ── Hash Chain Verification Banner ───────────────────────────────────────────

function ChainVerificationBanner() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'broken'>('idle')
  const [result, setResult] = useState<{
    total_checked: number
    first_broken_seq: number | null
    broken_row_id: string | null
    verified_at: string | null
  } | null>(null)

  const verify = async () => {
    setStatus('checking')
    try {
      const res = await fetch('/api/admin/sentinel-command/verify-chain?limit=10000')
      if (!res.ok) {
        setStatus('broken')
        return
      }
      const data = await res.json()
      setResult({
        total_checked: data.total_checked ?? 0,
        first_broken_seq: data.first_broken_seq ?? null,
        broken_row_id: data.broken_row_id ?? null,
        verified_at: data.verified_at ?? null,
      })
      setStatus(data.chain_valid ? 'valid' : 'broken')
    } catch {
      setStatus('broken')
    }
  }

  if (status === 'idle') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-muted p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="h-4 w-4" />
          <span>Hash chain integrity  -  tamper-evident SHA-256 ledger</span>
        </div>
        <Button variant="outline" size="sm" onClick={verify} className="text-xs">
          Verify Chain
        </Button>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verifying hash chain integrity...
      </div>
    )
  }

  if (status === 'valid') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 p-3">
        <div className="flex items-center gap-2 text-sm text-emerald-400 dark:text-green-400">
          <Link2 className="h-4 w-4" />
          <span className="font-medium">Chain INTACT</span>
          <span className="text-green-600/70 dark:text-green-500/70">
             -  {result?.total_checked} links verified, zero tampering detected
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={verify} className="text-xs text-green-600">
          Re-verify
        </Button>
      </div>
    )
  }

  // status === 'broken'
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-red-400 dark:text-red-400 font-semibold">
          <Link2Off className="h-4 w-4" />
          CHAIN BROKEN  -  Tampering Detected
        </div>
        <Button variant="ghost" size="sm" onClick={verify} className="text-xs text-red-600">
          Re-verify
        </Button>
      </div>
      {result?.first_broken_seq && (
        <p className="text-xs text-red-600/80 mt-1">
          First broken link at chain_seq {result.first_broken_seq}
          {result.broken_row_id && <> (row {result.broken_row_id})</>}
        </p>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SentinelCommandPage() {
  const { appUser, isLoading: userLoading } = useUser()
  const { role, isLoading: roleLoading } = useUserRole()
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')

  const isReady = !userLoading && !!appUser && !roleLoading
  const canAccess = hasPermission(role, 'settings', 'edit')

  const { data, isLoading, isError } = useQuery<SentinelResponse>({
    queryKey: ['sentinel-command', severityFilter, eventTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (severityFilter !== 'all') params.set('severity', severityFilter)
      if (eventTypeFilter !== 'all') params.set('event_type', eventTypeFilter)
      const res = await fetch(`/api/admin/sentinel-command?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Access denied')
      }
      return res.json()
    },
    enabled: isReady && canAccess,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  })

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!isReady || roleLoading || userLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-80" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldAlert className="mx-auto h-16 w-16 text-destructive opacity-60" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground max-w-md">
            The Security Command Centre is restricted to super_admin users.
            This access attempt has been logged.
          </p>
        </div>
      </div>
    )
  }

  const events = data?.events ?? []
  const counts = data?.counts ?? { total: 0, critical: 0, breach: 0, warning: 0, info: 0 }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
          <Shield className="h-6 w-6 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Command Centre</h1>
          <p className="text-sm text-muted-foreground">
            SENTINEL immutable audit log  -  all security events across the platform
          </p>
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Critical" count={counts.critical} severity="critical" />
        <StatCard label="Breach" count={counts.breach} severity="breach" />
        <StatCard label="Warnings" count={counts.warning} severity="warning" />
        <StatCard label="Informational" count={counts.info} severity="info" />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="breach">Breach</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Filter event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Types</SelectItem>
            <SelectItem value="TENANT_VIOLATION">Tenant Violation</SelectItem>
            <SelectItem value="INTAKE_BRIDGE_VIOLATION">Intake Bridge Violation</SelectItem>
            <SelectItem value="RLS_BYPASS_ATTEMPT">RLS Bypass Attempt</SelectItem>
            <SelectItem value="UNAUTHORIZED_ACCESS">Unauthorised Access</SelectItem>
            <SelectItem value="RETAINER_GATE_BLOCKED">Retainer Gate Blocked</SelectItem>
            <SelectItem value="STAGE_GATE_BLOCKED">Stage Gate Blocked</SelectItem>
            <SelectItem value="ROLE_VIOLATION">Role Violation</SelectItem>
            <SelectItem value="DATA_MASKING_BYPASS">Data Masking Bypass</SelectItem>
          </SelectContent>
        </Select>

        {(severityFilter !== 'all' || eventTypeFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSeverityFilter('all')
              setEventTypeFilter('all')
            }}
          >
            Clear filters
          </Button>
        )}

        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* ── Events Table ────────────────────────────────────────────────────── */}
      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Failed to load security events. Ensure you have admin privileges.
          </p>
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No security events"
          description={
            severityFilter !== 'all' || eventTypeFilter !== 'all'
              ? 'No events match the selected filters.'
              : 'The SENTINEL perimeter is clean. No violations detected.'
          }
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Severity</TableHead>
                <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Tenant ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="min-w-[200px]">Forensic Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const config = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.info
                const isCriticalOrBreach = event.severity === 'critical' || event.severity === 'breach'

                return (
                  <TableRow
                    key={event.id}
                    className={isCriticalOrBreach ? `${config.bg}` : ''}
                  >
                    {/* Severity dot */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                        <Badge className={`${config.badge} text-[10px] uppercase tracking-wider`}>
                          {config.label}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Timestamp */}
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(event.created_at), 'MMM d, yyyy HH:mm:ss')}
                    </TableCell>

                    {/* Event type */}
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {event.event_type}
                      </Badge>
                    </TableCell>

                    {/* Table */}
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {event.table_name ?? ' - '}
                    </TableCell>

                    {/* User ID  -  highlighted for violations */}
                    <TableCell
                      className={`text-xs font-mono max-w-[120px] truncate ${
                        isCriticalOrBreach ? config.text + ' font-semibold' : 'text-muted-foreground'
                      }`}
                      title={event.user_id ?? event.auth_user_id ?? ''}
                    >
                      {event.user_id ?? event.auth_user_id ?? ' - '}
                    </TableCell>

                    {/* Tenant ID  -  highlighted for violations */}
                    <TableCell
                      className={`text-xs font-mono max-w-[120px] truncate ${
                        isCriticalOrBreach ? config.text + ' font-semibold' : 'text-muted-foreground'
                      }`}
                      title={event.tenant_id ?? ''}
                    >
                      {event.tenant_id ?? ' - '}
                    </TableCell>

                    {/* IP */}
                    <TableCell className="text-xs text-muted-foreground">
                      {event.ip_address ?? ' - '}
                    </TableCell>

                    {/* Details */}
                    <TableCell>
                      <ExpandableDetails details={event.details} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Hash Chain Verification ──────────────────────────────────────────── */}
      <ChainVerificationBanner />

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
        <span>
          {counts.total} total events in the SENTINEL vault
          {counts.critical > 0 && (
            <span className="text-orange-500 font-semibold ml-2">
              ({counts.critical} critical)
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Immutable audit log  -  records cannot be modified or deleted
        </span>
      </div>
    </div>
  )
}
