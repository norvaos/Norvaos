'use client'

import { PlatformCard } from '@/components/import/platform-card'
import { Button } from '@/components/ui/button'
import { getAllAdapters } from '@/lib/services/import/adapters'
import type { SourcePlatform } from '@/lib/services/import/types'

interface SelectPlatformProps {
  selected: SourcePlatform | null
  onSelect: (platform: SourcePlatform) => void
  onNext: () => void
}

const adapters = getAllAdapters()

export function SelectPlatform({ selected, onSelect, onNext }: SelectPlatformProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Select Platform</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose the platform you are migrating data from.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {adapters.map((adapter) => (
          <PlatformCard
            key={adapter.platform}
            platform={adapter.platform}
            displayName={adapter.displayName}
            description={adapter.description}
            entityCount={adapter.entities.length}
            selected={selected === adapter.platform}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!selected}>
          Next
        </Button>
      </div>
    </div>
  )
}
