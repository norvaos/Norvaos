'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Database,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Globe,
  Eye,
  Loader2,
  Hammer,
  Sparkles,
  FileWarning,
  PlayCircle,
  Download,
  Swords,
} from 'lucide-react'

import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/utils/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  details: Record<string, unknown>
  message: string
}

interface SentinelSummary {
  name: string
  totalEvents: number
  bySeverity: {
    breach: number
    critical: number
    warning: number
    info: number
  }
  byType: Record<string, number>
  latestEvent: {
    id: string
    event_type: string
    severity: string
    created_at: string
  } | null
}

interface HardeningIntegrity {
  name: string
  totalGapsClosed: number
  totalGaps: number
  gapClosureRate: number
  inconsistenciesPreempted: number
  genesisBlocksSealed: number
  genesisBlocksCompliant: number
  documentsVerified: number
  documentsTampered: number
}

interface AuditSimulationResult {
  simulationId: string
  executedAt: string
  overallVerdict: 'BATTLE_READY' | 'ISSUES_FOUND'
  summary: {
    totalMatters: number
    genesisSealed: number
    genesisMissing: number
    ledgerParityPassed: number
    ledgerParityFailed: number
    integrityVerified: number
    integrityBreach: number
    integrityUnchecked: number
    zeroBalanceClosed: number
    residualFundsClosed: number
  }
  matters: Array<{
    matterId: string
    matterNumber: string
    title: string
    status: string
    genesisStatus: 'sealed' | 'missing'
    ledgerParity: 'pass' | 'fail'
    integrityStatus: 'verified' | 'breach' | 'unchecked'
    trustBalance: number
    exportUrl: string
  }>
}

interface ComplianceData {
  overallStatus: 'COMPLIANT' | 'WARNING' | 'CRITICAL'
  timestamp: string
  checks: {
    regionLock: HealthCheck
    encryptionStatus: HealthCheck
    auditParity: HealthCheck
    sentinelSummary: SentinelSummary
    hardeningIntegrity: HardeningIntegrity
  }
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function ComplianceDashboard() {
  const { role } = useUserRole()
  const canView = hasPermission(role as any, 'settings', 'view')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<AuditSimulationResult | null>(null)

  const { data, isLoading, error, refetch } = useQuery<ComplianceData>({
    queryKey: ['admin', 'compliance-health'],
    queryFn: async () => {
      const res = await fetch('/api/admin/compliance-health')
      if (!res.ok) throw new Error('Failed to load compliance data')
      return res.json()
    },
    enabled: canView,
    refetchInterval: 30_000, // Auto-refresh every 30s
    staleTime: 10_000,
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const handleSimulateExamination = async () => {
    setIsSimulating(true)
    setSimulationResult(null)
    try {
      const res = await fetch('/api/admin/audit-simulation', { method: 'POST' })
      if (!res.ok) throw new Error('Simulation failed')
      const result: AuditSimulationResult = await res.json()
      setSimulationResult(result)
    } catch {
      setSimulationResult(null)
    } finally {
      setIsSimulating(false)
    }
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <ShieldX className="h-12 w-12 mx-auto text-destructive" />
          <p className="text-lg font-semibold">Access Denied</p>
          <p className="text-sm text-muted-foreground">
            Administrator privileges required to view compliance status.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Compliance Health Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Directive 006  -  Real-time &quot;Legal Grade&quot; system health
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <OverallStatusBadge status={data.overallStatus} />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          Last checked: {format(new Date(data.timestamp), 'PPpp')}
        </p>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span>Failed to load compliance data. Check server logs.</span>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* Health Check Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* Region Lock */}
            <HealthCheckCard
              icon={<Globe className="h-5 w-5" />}
              check={data.checks.regionLock}
            />

            {/* Encryption Status */}
            <HealthCheckCard
              icon={<Lock className="h-5 w-5" />}
              check={data.checks.encryptionStatus}
            />

            {/* Audit Parity */}
            <HealthCheckCard
              icon={<Database className="h-5 w-5" />}
              check={data.checks.auditParity}
            />
          </div>

          {/* Sentinel Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                SENTINEL Event Summary (Last 24h)
              </CardTitle>
              <CardDescription>
                Security events captured by the telemetry system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SeverityCard
                  label="Breach"
                  count={data.checks.sentinelSummary.bySeverity.breach}
                  variant="destructive"
                />
                <SeverityCard
                  label="Critical"
                  count={data.checks.sentinelSummary.bySeverity.critical}
                  variant="destructive"
                />
                <SeverityCard
                  label="Warning"
                  count={data.checks.sentinelSummary.bySeverity.warning}
                  variant="warning"
                />
                <SeverityCard
                  label="Info"
                  count={data.checks.sentinelSummary.bySeverity.info}
                  variant="default"
                />
              </div>

              {/* Event type breakdown */}
              {Object.keys(data.checks.sentinelSummary.byType).length > 0 && (
                <div className="mt-4 border rounded-md p-3">
                  <p className="text-sm font-medium mb-2">Events by Type</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.checks.sentinelSummary.byType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => (
                        <Badge key={type} variant="outline" className="text-xs">
                          {type}: {count}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {data.checks.sentinelSummary.latestEvent && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Latest event: {data.checks.sentinelSummary.latestEvent.event_type}{' '}
                  ({data.checks.sentinelSummary.latestEvent.severity}) at{' '}
                  {format(new Date(data.checks.sentinelSummary.latestEvent.created_at), 'PPpp')}
                </div>
              )}

              {data.checks.sentinelSummary.totalEvents === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  No security events in the last 24 hours
                </div>
              )}
            </CardContent>
          </Card>

          {/* Directive 019: Data Hardening Integrity */}
          {data.checks.hardeningIntegrity && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Hammer className="h-5 w-5" />
                  Data Hardening Integrity
                </CardTitle>
                <CardDescription>
                  Gaps closed, inconsistencies pre-empted, and genesis blocks sealed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <HardeningMetric
                    label="Gaps Closed"
                    value={data.checks.hardeningIntegrity.totalGapsClosed}
                    subtitle={`of ${data.checks.hardeningIntegrity.totalGaps} required`}
                    rate={data.checks.hardeningIntegrity.gapClosureRate}
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  />
                  <HardeningMetric
                    label="Inconsistencies Pre-empted"
                    value={data.checks.hardeningIntegrity.inconsistenciesPreempted}
                    subtitle="OCR vs. manual mismatches"
                    icon={<FileWarning className="h-4 w-4 text-amber-600" />}
                  />
                  <HardeningMetric
                    label="Genesis Blocks Sealed"
                    value={data.checks.hardeningIntegrity.genesisBlocksSealed}
                    subtitle={`${data.checks.hardeningIntegrity.genesisBlocksCompliant} compliant`}
                    icon={<Sparkles className="h-4 w-4 text-violet-600" />}
                  />
                  <HardeningMetric
                    label="Documents Verified"
                    value={data.checks.hardeningIntegrity.documentsVerified}
                    subtitle={data.checks.hardeningIntegrity.documentsTampered > 0
                      ? `${data.checks.hardeningIntegrity.documentsTampered} tampered`
                      : '0 tampered'}
                    icon={<Shield className="h-4 w-4 text-emerald-600" />}
                    alert={data.checks.hardeningIntegrity.documentsTampered > 0}
                  />
                </div>

                {/* Gap closure progress bar */}
                <div className="mt-4 border rounded-md p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium">Gap Closure Rate</p>
                    <span className="text-sm font-bold tabular-nums">
                      {data.checks.hardeningIntegrity.gapClosureRate}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.checks.hardeningIntegrity.gapClosureRate >= 90
                          ? 'bg-emerald-500'
                          : data.checks.hardeningIntegrity.gapClosureRate >= 60
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(data.checks.hardeningIntegrity.gapClosureRate, 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Directive 026: Audit Simulation */}
          <Card className="border-violet-200 dark:border-violet-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Swords className="h-5 w-5 text-violet-600" />
                Simulate Regulatory Examination
              </CardTitle>
              <CardDescription>
                Directive 026  -  Run a full integrity check on every active matter and generate a Battle-Ready scorecard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Button
                  onClick={handleSimulateExamination}
                  disabled={isSimulating}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                >
                  {isSimulating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                  )}
                  {isSimulating ? 'Running Simulation...' : 'Run Full Simulation'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Tests every ledger hash, genesis seal, and trust balance across all active matters.
                </p>
              </div>

              {simulationResult && (
                <div className="space-y-4">
                  {/* Verdict Banner */}
                  <div className={`rounded-lg border-2 p-4 ${
                    simulationResult.overallVerdict === 'BATTLE_READY'
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                      : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                  }`}>
                    <div className="flex items-center gap-3">
                      {simulationResult.overallVerdict === 'BATTLE_READY' ? (
                        <ShieldCheck className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-6 w-6 text-red-600" />
                      )}
                      <div>
                        <p className={`font-bold text-lg ${
                          simulationResult.overallVerdict === 'BATTLE_READY'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-700 dark:text-red-400'
                        }`}>
                          {simulationResult.overallVerdict === 'BATTLE_READY'
                            ? 'BATTLE-READY  -  All checks passed'
                            : 'ISSUES FOUND  -  Review required'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Simulation ID: {simulationResult.simulationId.slice(0, 8)}... | {format(new Date(simulationResult.executedAt), 'PPpp')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border p-3 text-center bg-muted/30">
                      <div className="text-2xl font-bold">{simulationResult.summary.totalMatters}</div>
                      <div className="text-xs font-medium text-muted-foreground">Total Matters</div>
                    </div>
                    <div className={`rounded-md border p-3 text-center ${simulationResult.summary.genesisSealed === simulationResult.summary.totalMatters ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="text-2xl font-bold">{simulationResult.summary.genesisSealed}</div>
                      <div className="text-xs font-medium">Genesis Sealed</div>
                    </div>
                    <div className={`rounded-md border p-3 text-center ${simulationResult.summary.ledgerParityFailed === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="text-2xl font-bold">{simulationResult.summary.ledgerParityPassed}</div>
                      <div className="text-xs font-medium">Ledger Parity OK</div>
                    </div>
                    <div className={`rounded-md border p-3 text-center ${simulationResult.summary.integrityBreach === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="text-2xl font-bold">{simulationResult.summary.integrityVerified}</div>
                      <div className="text-xs font-medium">Integrity Verified</div>
                    </div>
                  </div>

                  {/* Per-Matter Results */}
                  <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                    {simulationResult.matters.map((m) => (
                      <div key={m.matterId} className="flex items-center justify-between p-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          {m.genesisStatus === 'sealed' && m.ledgerParity === 'pass' && m.integrityStatus !== 'breach' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="font-medium">{m.matterNumber}</span>
                            <span className="text-muted-foreground ml-2 truncate">{m.title}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${m.genesisStatus === 'sealed' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}`}>
                            {m.genesisStatus === 'sealed' ? 'Sealed' : 'No Genesis'}
                          </Badge>
                          {m.integrityStatus === 'breach' && (
                            <Badge variant="destructive" className="text-[10px]">BREACH</Badge>
                          )}
                          <a
                            href={m.exportUrl}
                            className="text-violet-600 hover:text-violet-800"
                            title="Download audit PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileCheck2 className="h-5 w-5" />
                Detailed Check Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  data.checks.regionLock,
                  data.checks.encryptionStatus,
                  data.checks.auditParity,
                ].map((check) => (
                  <div key={check.name} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{check.name}</span>
                      <StatusBadge status={check.status} />
                    </div>
                    <pre className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(check.details, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function OverallStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLIANT':
      return (
        <Badge className="bg-green-600 text-white gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          COMPLIANT
        </Badge>
      )
    case 'WARNING':
      return (
        <Badge className="bg-yellow-600 text-white gap-1">
          <ShieldAlert className="h-3.5 w-3.5" />
          WARNING
        </Badge>
      )
    case 'CRITICAL':
      return (
        <Badge className="bg-red-600 text-white gap-1">
          <ShieldX className="h-3.5 w-3.5" />
          CRITICAL
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function StatusBadge({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  switch (status) {
    case 'pass':
      return (
        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          PASS
        </Badge>
      )
    case 'warn':
      return (
        <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50 gap-1">
          <AlertTriangle className="h-3 w-3" />
          WARN
        </Badge>
      )
    case 'fail':
      return (
        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 gap-1">
          <XCircle className="h-3 w-3" />
          FAIL
        </Badge>
      )
  }
}

function HealthCheckCard({
  icon,
  check,
}: {
  icon: React.ReactNode
  check: HealthCheck
}) {
  const borderColor = {
    pass: 'border-green-200',
    warn: 'border-yellow-200',
    fail: 'border-red-200',
  }[check.status]

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {icon}
            {check.name}
          </span>
          <StatusBadge status={check.status} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{check.message}</p>
      </CardContent>
    </Card>
  )
}

function SeverityCard({
  label,
  count,
  variant,
}: {
  label: string
  count: number
  variant: 'destructive' | 'warning' | 'default'
}) {
  const colors = {
    destructive: count > 0 ? 'text-red-600 bg-red-50 border-red-200' : 'text-muted-foreground bg-muted',
    warning: count > 0 ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 'text-muted-foreground bg-muted',
    default: 'text-muted-foreground bg-muted',
  }

  return (
    <div className={`rounded-md border p-3 text-center ${colors[variant]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  )
}

function HardeningMetric({
  label,
  value,
  subtitle,
  rate,
  icon,
  alert,
}: {
  label: string
  value: number
  subtitle: string
  rate?: number
  icon: React.ReactNode
  alert?: boolean
}) {
  return (
    <div className={`rounded-md border p-3 ${alert ? 'border-red-300 bg-red-50' : 'bg-muted/30'}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-600' : ''}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
    </div>
  )
}
