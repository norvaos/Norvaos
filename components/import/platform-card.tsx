'use client'

import { cn } from '@/lib/utils'
import type { SourcePlatform } from '@/lib/services/import/types'

interface PlatformCardProps {
  platform: SourcePlatform
  displayName: string
  description: string
  entityCount: number
  selected: boolean
  onSelect: (platform: SourcePlatform) => void
}

const platformColours: Record<SourcePlatform, string> = {
  ghl: 'border-blue-500/20 bg-blue-950/30',
  clio: 'border-indigo-200 bg-indigo-50',
  officio: 'border-emerald-500/20 bg-emerald-950/30',
}

const platformSelectedColours: Record<SourcePlatform, string> = {
  ghl: 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-200',
  clio: 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200',
  officio: 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-200',
}

export function PlatformCard({
  platform,
  displayName,
  description,
  entityCount,
  selected,
  onSelect,
}: PlatformCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(platform)}
      className={cn(
        'w-full text-left rounded-lg border p-5 transition-all hover:shadow-sm cursor-pointer',
        selected ? platformSelectedColours[platform] : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            platformColours[platform],
          )}
        >
          {displayName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
          <p className="text-xs text-slate-400 mt-2">
            {entityCount} entity {entityCount === 1 ? 'type' : 'types'} available
          </p>
        </div>
      </div>
    </button>
  )
}
