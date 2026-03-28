'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useCommandCentre } from './command-centre-context'

export function ConvertedBanner() {
  const { convertedMatterId, matter } = useCommandCentre()

  if (!convertedMatterId) return null

  return (
    <div className="flex items-center justify-between gap-3 bg-emerald-950/30 border-b border-green-200 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <span>
          This lead was converted to{' '}
          <span className="font-semibold">
            Matter {matter?.matter_number ?? ''}
          </span>
        </span>
      </div>
      <Link
        href={`/matters/${convertedMatterId}`}
        className="flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-green-900 transition-colors"
      >
        Open Matter
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
