'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileText, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface RetainerGateStatus {
  exists: boolean
  status: string | null
  signedAt: string | null
  sentAt: string | null
  meetsGate: boolean
}

interface GatingStatusResponse {
  matterId: string
  retainerStatus: RetainerGateStatus
  evaluation: {
    passed: boolean
    conditions: Array<{
      conditionId: string
      conditionName: string
      passed: boolean
      details?: string
    }>
  }
}

export function RetainerGatePanel({
  matterId,
  onCreateRetainer,
}: {
  matterId: string
  onCreateRetainer?: () => void
}) {
  const { data, isLoading } = useQuery<GatingStatusResponse>({
    queryKey: ['gating-status', matterId],
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/gating-status`)
      if (!res.ok) throw new Error('Failed to fetch gating status')
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min
    refetchOnWindowFocus: false,
  })

  if (isLoading || !data) return null

  const retainer = data.retainerStatus
  const retainerCondition = data.evaluation.conditions.find(
    (c) => c.conditionId === 'require_retainer_agreement',
  )

  // If no retainer gate exists in the rules, don't show this panel
  if (!retainerCondition) return null

  const isBlocked = !retainerCondition.passed

  return (
    <Card className={isBlocked ? 'border-amber-500/50 bg-amber-950/30/50 dark:bg-amber-950/20' : 'border-emerald-500/50 bg-emerald-950/30/50 dark:bg-emerald-950/20'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {isBlocked ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          Retainer Agreement Gate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            Status:{' '}
            <span className="font-medium">
              {retainer.status
                ? retainer.status.replace(/_/g, ' ')
                : 'No retainer agreement'}
            </span>
          </span>
        </div>

        {retainer.signedAt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Signed: {new Date(retainer.signedAt).toLocaleDateString('en-CA')}
          </div>
        )}

        {isBlocked && (
          <div className="space-y-2 pt-1">
            <p className="text-sm text-amber-400 dark:text-amber-400">
              {retainerCondition.details ??
                'A signed Retainer Agreement is required before advancing this matter.'}
            </p>
            {onCreateRetainer && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateRetainer}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-950/40 dark:text-amber-400"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Generate Retainer Agreement
              </Button>
            )}
          </div>
        )}

        {!isBlocked && (
          <p className="text-sm text-emerald-400 dark:text-emerald-400">
            Retainer agreement requirement satisfied.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
