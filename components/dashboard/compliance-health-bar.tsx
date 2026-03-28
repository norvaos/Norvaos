'use client'

/**
 * ComplianceHealthBar  -  Directive 41.3, Item 1B
 *
 * Firm-wide compliance health widget for the main dashboard.
 * Shows percentage of active matters with verified IDs, conflict checks, etc.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  ShieldCheck,
  Fingerprint,
  FileSignature,
  UserCheck,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Hook ─────────────────────────────────────────────────────────────

interface FirmHealth {
  totalMatters: number
  kycVerified: number
  conflictCleared: number
  retainerSigned: number
  overallPercent: number
}

function useFirmComplianceHealth(tenantId: string) {
  return useQuery({
    queryKey: ['firm-compliance-health', tenantId],
    queryFn: async (): Promise<FirmHealth> => {
      const supabase = createClient()

      // Count active matters
      const { count: totalMatters } = await supabase
        .from('matters')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active')

      const total = totalMatters ?? 0
      if (total === 0) {
        return { totalMatters: 0, kycVerified: 0, conflictCleared: 0, retainerSigned: 0, overallPercent: 100 }
      }

      // KYC: matters where the primary contact has a verified identity_verification
      const { data: mattersWithKyc } = await supabase
        .from('matter_contacts')
        .select(`
          matter_id,
          matters!inner(id, status, tenant_id),
          identity_verifications:identity_verifications!inner(status)
        `)
        .eq('matters.tenant_id', tenantId)
        .eq('matters.status', 'active')
        .eq('role', 'client')
        .eq('identity_verifications.status', 'verified')

      // Conflict: matters where the primary contact has a passing conflict_status
      const { data: mattersWithConflict } = await supabase
        .from('matter_contacts')
        .select(`
          matter_id,
          matters!inner(id, status, tenant_id),
          contacts!inner(conflict_status)
        `)
        .eq('matters.tenant_id', tenantId)
        .eq('matters.status', 'active')
        .eq('role', 'client')
        .in('contacts.conflict_status', ['auto_scan_complete', 'cleared_by_lawyer', 'waiver_obtained'])

      // Retainer: matters with a signed retainer document
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mattersWithRetainer } = await (supabase as any)
        .from('signing_documents')
        .select('matter_id')
        .eq('tenant_id', tenantId)
        .eq('document_type', 'retainer')
        .not('signed_at', 'is', null)

      // Deduplicate matter IDs
      const kycMatterIds = new Set((mattersWithKyc ?? []).map((r: { matter_id: string }) => r.matter_id))
      const conflictMatterIds = new Set((mattersWithConflict ?? []).map((r: { matter_id: string }) => r.matter_id))
      const retainerMatterIds = new Set((mattersWithRetainer ?? []).map((r: { matter_id: string }) => r.matter_id))

      const kycVerified = kycMatterIds.size
      const conflictCleared = conflictMatterIds.size
      const retainerSigned = retainerMatterIds.size

      // Overall: average of the three percentages
      const overallPercent = total > 0
        ? Math.round(((kycVerified + conflictCleared + retainerSigned) / (total * 3)) * 100)
        : 100

      return { totalMatters: total, kycVerified, conflictCleared, retainerSigned, overallPercent }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ── Component ────────────────────────────────────────────────────────

export function ComplianceHealthBar() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { data, isLoading } = useFirmComplianceHealth(tenantId)

  if (!tenantId || isLoading) {
    return (
      <Card>
        <CardContent className="py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading Firm Compliance Health...
        </CardContent>
      </Card>
    )
  }

  if (!data || data.totalMatters === 0) {
    return null // No active matters  -  don't show the bar
  }

  const pct = (num: number) =>
    data.totalMatters > 0 ? Math.round((num / data.totalMatters) * 100) : 100

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-blue-600" />
            Firm Compliance Health
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-bold tabular-nums',
              data.overallPercent === 100
                ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400'
                : data.overallPercent >= 70
                  ? 'border-amber-500/30 bg-amber-950/30 text-amber-400'
                  : 'border-red-500/30 bg-red-950/30 text-red-400'
            )}
          >
            {data.overallPercent}% Compliant
          </Badge>
        </div>
        {/* Overall progress bar */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              data.overallPercent === 100
                ? 'bg-emerald-950/300'
                : data.overallPercent >= 70
                  ? 'bg-amber-950/300'
                  : 'bg-red-950/300'
            )}
            style={{ width: `${data.overallPercent}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-1">
        <div className="flex items-center gap-4 text-xs">
          <HealthMetric
            icon={<UserCheck className="size-3 text-blue-500" />}
            label="KYC Verified"
            value={`${data.kycVerified}/${data.totalMatters}`}
            percent={pct(data.kycVerified)}
          />
          <HealthMetric
            icon={<ShieldCheck className="size-3 text-green-500" />}
            label="Conflict Cleared"
            value={`${data.conflictCleared}/${data.totalMatters}`}
            percent={pct(data.conflictCleared)}
          />
          <HealthMetric
            icon={<FileSignature className="size-3 text-purple-500" />}
            label="Retainer Signed"
            value={`${data.retainerSigned}/${data.totalMatters}`}
            percent={pct(data.retainerSigned)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Metric pill ──────────────────────────────────────────────────────

function HealthMetric({
  icon,
  label,
  value,
  percent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  percent: number
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-medium">{value}</span>
            <span
              className={cn(
                'text-[9px] font-bold',
                percent === 100
                  ? 'text-green-600'
                  : percent >= 70
                    ? 'text-amber-600'
                    : 'text-red-600'
              )}
            >
              ({percent}%)
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {percent === 100
            ? `All active matters have ${label.toLowerCase()}.`
            : `${100 - percent}% of active matters are missing ${label.toLowerCase()}.`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
