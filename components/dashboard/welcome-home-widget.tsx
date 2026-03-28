'use client'

/**
 * Welcome Home  -  Migration Summary Widget (Directive 11.1)
 *
 * Shows a "Summary of the Move" card for newly migrated firms.
 * Displays migration stats: matters needing audit, classified documents,
 * flagged conflicts, active delta-sync status.
 *
 * Only visible when:
 *   1. A delta-sync session exists (active or recently completed), OR
 *   2. There are documents with classification metadata (migrated docs)
 *
 * Disappears after 14 days post-migration or when manually dismissed.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles,
  FileSearch,
  ShieldAlert,
  FolderSync,
  Briefcase,
  X,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Shield,
  Download,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NorvaWhisper } from '@/components/ui/norva-whisper'

interface WelcomeHomeWidgetProps {
  tenantId: string
}

interface MigrationStats {
  /** Number of matters with recent activity needing review */
  mattersNeedingAudit: number
  /** Number of auto-classified documents */
  classifiedDocuments: number
  /** Number of conflicts flagged */
  conflictsFlagged: number
  /** Delta-sync session status */
  syncStatus: 'active' | 'completed' | 'none'
  syncTotalSynced: number
  syncExpiresAt: string | null
  /** Whether migration data exists */
  hasMigrationData: boolean
}

function useMigrationStats(tenantId: string) {
  return useQuery({
    queryKey: ['migration_stats', tenantId],
    queryFn: async (): Promise<MigrationStats> => {
      const supabase = createClient()

      // Parallel queries for migration stats
      const [syncRes, classifiedRes, conflictsRes, mattersRes] = await Promise.all([
        // 1. Delta-sync session (active or recently completed)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('delta_sync_sessions')
          .select('status, total_synced, expires_at')
          .eq('tenant_id', tenantId)
          .in('status', ['active', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

        // 2. Count documents with classification metadata
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'classified'),

        // 3. Count leads with conflict_detected status
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('conflict_status', ['conflict_detected', 'review_required']),

        // 4. Count matters created in last 14 days (migration window)
        supabase
          .from('matters')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()),
      ])

      const syncSession = syncRes.data
      const hasMigrationData = !!(syncSession || (classifiedRes.count && classifiedRes.count > 0))

      return {
        mattersNeedingAudit: mattersRes.count ?? 0,
        classifiedDocuments: classifiedRes.count ?? 0,
        conflictsFlagged: conflictsRes.count ?? 0,
        syncStatus: syncSession?.status ?? 'none',
        syncTotalSynced: syncSession?.total_synced ?? 0,
        syncExpiresAt: syncSession?.expires_at ?? null,
        hasMigrationData,
      }
    },
    enabled: !!tenantId,
    staleTime: 60_000, // 1 minute
  })
}

export function WelcomeHomeWidget({ tenantId }: WelcomeHomeWidgetProps) {
  const [dismissed, setDismissed] = useState(false)
  const { data: stats, isLoading } = useMigrationStats(tenantId)

  // Don't render if dismissed, loading, or no migration data
  if (dismissed || isLoading || !stats?.hasMigrationData) {
    return null
  }

  const syncActive = stats.syncStatus === 'active'
  const daysRemaining = stats.syncExpiresAt
    ? Math.max(0, Math.ceil((new Date(stats.syncExpiresAt).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <Card className="relative overflow-hidden border-indigo-200 dark:border-indigo-800">
      {/* Gradient accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

      <CardContent className="pt-5 pb-4 px-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1">
                Welcome Home
                <NorvaWhisper title="Norva Bridge  -  Migration Complete" side="right">
                  Your data has been migrated from Clio into the Norva ecosystem. This summary shows what the Norva Bridge processed during the transition.
                </NorvaWhisper>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Your Norva migration summary
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Matters needing audit */}
          <MigrationStatCard
            icon={Briefcase}
            iconColor="text-blue-600"
            iconBg="bg-blue-950/30 dark:bg-blue-950/30"
            value={stats.mattersNeedingAudit}
            label="Active Matters"
            sublabel="migrated and ready"
            href="/matters"
          />

          {/* Auto-classified documents */}
          <MigrationStatCard
            icon={FileSearch}
            iconColor="text-violet-600"
            iconBg="bg-violet-50 dark:bg-violet-950/30"
            value={stats.classifiedDocuments}
            label="Documents Classified"
            sublabel="auto-tagged by AI"
          />

          {/* Conflicts flagged */}
          <MigrationStatCard
            icon={ShieldAlert}
            iconColor={stats.conflictsFlagged > 0 ? 'text-amber-600' : 'text-emerald-600'}
            iconBg={stats.conflictsFlagged > 0 ? 'bg-amber-950/30 dark:bg-amber-950/30' : 'bg-emerald-950/30 dark:bg-emerald-950/30'}
            value={stats.conflictsFlagged}
            label={stats.conflictsFlagged > 0 ? 'Conflicts Flagged' : 'No Conflicts'}
            sublabel={stats.conflictsFlagged > 0 ? 'require lawyer review' : 'all clear'}
            href={stats.conflictsFlagged > 0 ? '/leads?filter=conflict' : undefined}
          />

          {/* Delta-Sync status */}
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-md ${syncActive ? 'bg-emerald-950/30 dark:bg-emerald-950/30' : 'bg-muted'}`}>
                {syncActive ? (
                  <FolderSync className="h-4 w-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              {syncActive && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-400 dark:text-emerald-400">
                  <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                  LIVE
                </Badge>
              )}
            </div>
            <p className="text-lg font-bold tabular-nums">{stats.syncTotalSynced}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {syncActive
                ? `Items synced  -  ${daysRemaining}d remaining`
                : stats.syncStatus === 'completed'
                  ? 'Items synced  -  complete'
                  : 'Delta-Sync inactive'}
            </p>
          </div>
        </div>

        {/* Vault-Migration Certificate  -  pinned when migration complete */}
        {stats.syncStatus === 'completed' && (
          <VaultMigrationCertificateBanner />
        )}

        {/* Footer message */}
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {syncActive
              ? 'The Norva Bridge is monitoring Clio for new changes every 2 minutes.'
              : 'Migration complete. Your Clio data is now in the Norva Vault.'}
          </p>
          {stats.conflictsFlagged > 0 && (
            <Link href="/leads?filter=conflict">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                Review Conflicts
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function MigrationStatCard({
  icon: Icon,
  iconColor,
  iconBg,
  value,
  label,
  sublabel,
  href,
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  value: number
  label: string
  sublabel: string
  href?: string
}) {
  const content = (
    <div className={`rounded-lg border p-3 space-y-1.5 ${href ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}>
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="text-lg font-bold tabular-nums">{value.toLocaleString()}</p>
      <div>
        <p className="text-[11px] font-medium leading-tight">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{sublabel}</p>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} className="no-underline">{content}</Link>
  }

  return content
}

// ─── Vault-Migration Certificate Banner ──────────────────────────────────────

function VaultMigrationCertificateBanner() {
  const [isDownloading, setIsDownloading] = useState(false)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const res = await fetch('/api/integrations/clio/migration-certificate')
      if (!res.ok) throw new Error('Failed to generate certificate')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Norva-Secured-Certificate.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      console.error('[Migration Certificate] Download failed')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/20 dark:border-emerald-800 bg-emerald-950/30/50 dark:bg-emerald-950/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-950/40 dark:bg-emerald-900/40">
            <Shield className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-400 dark:text-emerald-300">
              Your firm is now Norva-Protected
            </p>
            <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/60">
              All data hashed, PII masking active, SENTINEL monitoring armed.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40 flex-shrink-0"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Download Certificate
        </Button>
      </div>
    </div>
  )
}
