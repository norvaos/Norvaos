'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getAdapter } from '@/lib/services/import/adapters'
import { cn } from '@/lib/utils'
import type { SourcePlatform, ImportEntityType } from '@/lib/services/import/types'

interface SelectEntityProps {
  platform: SourcePlatform
  selected: ImportEntityType | null
  completedEntities: ImportEntityType[]
  onSelect: (entityType: ImportEntityType) => void
  onNext: () => void
  onBack: () => void
}

export function SelectEntity({
  platform,
  selected,
  completedEntities,
  onSelect,
  onNext,
  onBack,
}: SelectEntityProps) {
  const adapter = getAdapter(platform)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Select Entity Type</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose what type of data to import from {adapter.displayName}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {adapter.entities.map((entity) => {
          const missingDeps = (entity.dependsOn ?? []).filter(
            (dep) => !completedEntities.includes(dep),
          )
          const isBlocked = missingDeps.length > 0
          const isCompleted = completedEntities.includes(entity.entityType)
          const isSelected = selected === entity.entityType

          return (
            <button
              key={entity.entityType}
              type="button"
              onClick={() => !isBlocked && onSelect(entity.entityType)}
              disabled={isBlocked}
              className={cn(
                'w-full text-left rounded-lg border p-4 transition-all',
                isBlocked && 'opacity-50 cursor-not-allowed',
                isSelected && 'border-primary ring-2 ring-primary/20 bg-primary/5',
                !isSelected && !isBlocked && 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{entity.sourceDisplayName}</p>
                  <p className="text-xs text-slate-500 mt-1">{entity.description}</p>
                </div>
                <div className="shrink-0">
                  {isCompleted && (
                    <Badge variant="secondary" className="text-[10px]">
                      Imported
                    </Badge>
                  )}
                  {isBlocked && (
                    <Badge variant="destructive" className="text-[10px]">
                      Requires {missingDeps.join(', ')}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!selected}>
          Next
        </Button>
      </div>
    </div>
  )
}
