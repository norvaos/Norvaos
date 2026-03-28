'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCommandCentre } from '../command-centre-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldAlert, ShieldCheck, AlertTriangle, Info } from 'lucide-react'

// ─── Hook ───────────────────────────────────────────────────────────

function useMatterRiskData(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-risk', matterId],
    queryFn: async () => {
      const supabase = createClient()

      // Get matter risk_level + custom_fields (may contain risk_flags)
      const { data: matter } = await supabase
        .from('matters')
        .select('id, risk_level, custom_fields')
        .eq('id', matterId)
        .eq('tenant_id', tenantId)
        .single()

      // Get intake risk_score from matter_intake if it exists
      const { data: intake } = await supabase
        .from('matter_intake')
        .select('risk_score, risk_level')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      const customFields = (matter?.custom_fields ?? {}) as Record<string, unknown>
      const riskFlags = (customFields.risk_flags as string[] | undefined) ?? []

      return {
        riskScore: intake?.risk_score ?? null,
        riskLevel: matter?.risk_level ?? intake?.risk_level ?? null,
        riskFlags,
      }
    },
    enabled: !!matterId && !!tenantId,
  })
}

// ─── Risk level helpers ─────────────────────────────────────────────

function getRiskLevelDisplay(
  level: string | null,
  score: number | null
): { label: string; color: string; icon: React.ReactNode } {
  // Use explicit risk_level string if available
  if (level === 'low') {
    return { label: 'Low Risk', color: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20', icon: <ShieldCheck className="h-4 w-4 text-green-600" /> }
  }
  if (level === 'medium') {
    return { label: 'Medium Risk', color: 'bg-amber-950/30 text-amber-400 border-amber-500/20', icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> }
  }
  if (level === 'high') {
    return { label: 'High Risk', color: 'bg-red-950/30 text-red-400 border-red-500/20', icon: <ShieldAlert className="h-4 w-4 text-red-600" /> }
  }

  // Fall back to score-based determination
  if (score !== null) {
    if (score <= 30) return { label: 'Low Risk', color: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20', icon: <ShieldCheck className="h-4 w-4 text-green-600" /> }
    if (score <= 60) return { label: 'Medium Risk', color: 'bg-amber-950/30 text-amber-400 border-amber-500/20', icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> }
    return { label: 'High Risk', color: 'bg-red-950/30 text-red-400 border-red-500/20', icon: <ShieldAlert className="h-4 w-4 text-red-600" /> }
  }

  return { label: 'Not Assessed', color: 'bg-slate-50 text-slate-500 border-slate-200', icon: <Info className="h-4 w-4" /> }
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Risk Panel  -  displays risk score from intake and any risk flags.
 * Override history tracked through workflow_actions audit trail.
 */
export function RiskPanel() {
  const { entityId, tenantId, entityType } = useCommandCentre()
  const { data, isLoading } = useMatterRiskData(entityId, tenantId)

  if (entityType !== 'matter') return null

  const riskDisplay = getRiskLevelDisplay(data?.riskLevel ?? null, data?.riskScore ?? null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <ShieldAlert className="h-4 w-4" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Risk level badge + score */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {riskDisplay.icon}
                <Badge variant="outline" className={riskDisplay.color}>
                  {riskDisplay.label}
                </Badge>
              </div>
              {data?.riskScore !== null && data?.riskScore !== undefined && (
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-900">{data.riskScore}</span>
                  <span className="text-xs text-slate-400 ml-1">/100</span>
                </div>
              )}
            </div>

            {/* Risk score bar */}
            {data?.riskScore !== null && data?.riskScore !== undefined && (
              <div className="space-y-1">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${data.riskScore}%`,
                      backgroundColor:
                        data.riskScore <= 30
                          ? '#22c55e'
                          : data.riskScore <= 60
                            ? '#f59e0b'
                            : '#ef4444',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>
            )}

            {/* Risk flags */}
            {data?.riskFlags && data.riskFlags.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Risk Flags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.riskFlags.map((flag, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-xs bg-red-950/30 text-red-600 border-red-500/20"
                    >
                      {flag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* No assessment message */}
            {data?.riskScore === null && data?.riskLevel === null && (!data?.riskFlags || data.riskFlags.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-2">
                No risk assessment available for this matter.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
