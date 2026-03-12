'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Banknote } from 'lucide-react'

export function PricingStub() {
  return (
    <Card className="opacity-60">
      <CardContent className="py-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <Banknote className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-medium text-slate-500">Retainer Builder</p>
          <p className="text-xs text-slate-400">Coming in Phase 5</p>
        </div>
      </CardContent>
    </Card>
  )
}
