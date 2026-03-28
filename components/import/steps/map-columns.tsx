'use client'

import { Button } from '@/components/ui/button'
import { ColumnMapperRow } from '@/components/import/column-mapper-row'
import { getAdapter } from '@/lib/services/import/adapters'
import type { SourcePlatform, ImportEntityType } from '@/lib/services/import/types'

interface MapColumnsProps {
  platform: SourcePlatform
  entityType: ImportEntityType
  csvHeaders: string[]
  mapping: Record<string, string>
  previewRows: Record<string, string>[]
  onMappingChange: (mapping: Record<string, string>) => void
  onValidate: () => void
  isValidating: boolean
  onBack: () => void
}

export function MapColumns({
  platform,
  entityType,
  csvHeaders,
  mapping,
  previewRows,
  onMappingChange,
  onValidate,
  isValidating,
  onBack,
}: MapColumnsProps) {
  const adapter = getAdapter(platform)
  const entityAdapter = adapter.getEntityAdapter(entityType)

  // Build available target options
  const targetOptions = (entityAdapter?.fieldMappings ?? [])
    .filter((f) => !f.targetColumn.startsWith('__'))
    .map((f) => ({
      value: f.targetColumn,
      label: f.targetColumn.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      required: f.required,
    }))

  const handleChange = (sourceHeader: string, targetColumn: string | null) => {
    const newMapping = { ...mapping }
    if (targetColumn) {
      newMapping[sourceHeader] = targetColumn
    } else {
      delete newMapping[sourceHeader]
    }
    onMappingChange(newMapping)
  }

  // Check if all required fields are mapped
  const mappedTargets = new Set(Object.values(mapping))
  const missingRequired = targetOptions.filter(
    (t) => t.required && !mappedTargets.has(t.value),
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Map Columns</h2>
        <p className="text-sm text-slate-500 mt-1">
          Match your CSV columns to the corresponding fields. Auto-detected mappings are pre-filled.
        </p>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-lg bg-amber-950/30 border border-amber-500/20 px-4 py-3">
          <p className="text-xs text-amber-400">
            <span className="font-medium">Required fields not yet mapped:</span>{' '}
            {missingRequired.map((f) => f.label).join(', ')}
          </p>
        </div>
      )}

      {/* Column header */}
      <div className="grid grid-cols-12 gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
        <div className="col-span-3">CSV Column</div>
        <div className="col-span-1"></div>
        <div className="col-span-4">Maps To</div>
        <div className="col-span-4">Sample Values</div>
      </div>

      {/* Column rows */}
      <div className="border rounded-lg px-3 py-1 bg-white">
        {csvHeaders.map((header) => (
          <ColumnMapperRow
            key={header}
            sourceHeader={header}
            targetColumn={mapping[header] ?? null}
            availableTargets={targetOptions}
            sampleValues={previewRows.map((row) => row[header] ?? '')}
            onChange={handleChange}
          />
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onValidate} disabled={isValidating}>
          {isValidating ? 'Validating...' : 'Validate & Preview'}
        </Button>
      </div>
    </div>
  )
}
