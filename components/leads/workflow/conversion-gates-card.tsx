'use client'

import { Shield, CheckCircle2, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getGateStatusConfig } from './lead-workflow-helpers'
import type { GateResult } from './lead-workflow-types'

// ─── Gate Icon Map ──────────────────────────────────────────────────────────

const GATE_ICONS: Record<string, React.ElementType> = {
  'check-circle-2': CheckCircle2,
  'x-circle': XCircle,
  'minus-circle': MinusCircle,
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ConversionGatesCardProps {
  canConvert: boolean
  gateResults: GateResult[]
  blockedReasons: string[]
  isLoading?: boolean
  onConvert: () => void
}

export function ConversionGatesCard({
  canConvert,
  gateResults,
  blockedReasons,
  isLoading = false,
  onConvert,
}: ConversionGatesCardProps) {
  const enabledGates = gateResults.filter((g) => g.enabled)
  const passedCount = enabledGates.filter((g) => g.passed).length
  const totalEnabled = enabledGates.length

  return (
    <Card className={canConvert ? 'border-green-200' : 'border-amber-200'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Shield className={`h-4 w-4 ${canConvert ? 'text-green-600' : 'text-amber-600'}`} />
            Conversion Gates
          </CardTitle>
          <Badge
            variant="outline"
            size="xs"
            className={
              canConvert
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }
          >
            {canConvert ? 'Ready' : `${totalEnabled - passedCount} blocking`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Gate checklist */}
        <div className="space-y-1.5">
          {gateResults.map((gate) => {
            const config = getGateStatusConfig(gate.passed, gate.enabled)
            const GateIcon = GATE_ICONS[config.iconName] ?? MinusCircle

            return (
              <div
                key={gate.gate}
                className="flex items-start gap-2 py-1"
              >
                <GateIcon className={`h-4 w-4 shrink-0 mt-0.5 ${config.iconClass}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${gate.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {gate.label}
                  </p>
                  {gate.reason && !gate.passed && gate.enabled && (
                    <p className="text-xs text-red-500 mt-0.5">{gate.reason}</p>
                  )}
                  {!gate.enabled && (
                    <p className="text-[10px] text-muted-foreground">Not required</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Blocked reasons summary */}
        {blockedReasons.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs font-medium text-amber-800 mb-1">Blocking Issues</p>
            <ul className="space-y-0.5">
              {blockedReasons.map((reason, idx) => (
                <li key={idx} className="text-xs text-amber-700">• {reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Convert button */}
        <Button
          onClick={onConvert}
          disabled={!canConvert || isLoading}
          className="w-full"
          variant={canConvert ? 'default' : 'outline'}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Converting...
            </>
          ) : canConvert ? (
            'Convert to Matter'
          ) : (
            'Gates Not Met'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
