'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ColumnMapperRowProps {
  sourceHeader: string
  targetColumn: string | null
  availableTargets: { value: string; label: string; required: boolean }[]
  sampleValues: string[]
  onChange: (sourceHeader: string, targetColumn: string | null) => void
}

export function ColumnMapperRow({
  sourceHeader,
  targetColumn,
  availableTargets,
  sampleValues,
  onChange,
}: ColumnMapperRowProps) {
  return (
    <div className="grid grid-cols-12 gap-3 items-center py-2 border-b border-slate-100 last:border-0">
      {/* Source column */}
      <div className="col-span-3">
        <p className="text-sm font-medium text-slate-700 truncate">{sourceHeader}</p>
      </div>

      {/* Arrow */}
      <div className="col-span-1 text-center text-slate-400 text-xs">&rarr;</div>

      {/* Target column selector */}
      <div className="col-span-4">
        <Select
          value={targetColumn ?? '__skip'}
          onValueChange={(val) => onChange(sourceHeader, val === '__skip' ? null : val)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Skip this column" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__skip">
              <span className="text-slate-400">Skip this column</span>
            </SelectItem>
            {availableTargets.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className={cn(t.required && 'font-medium')}>
                  {t.label}
                  {t.required && <span className="text-red-500 ml-1">*</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sample values */}
      <div className="col-span-4">
        <div className="flex flex-wrap gap-1">
          {sampleValues.slice(0, 3).map((val, i) => (
            <span
              key={i}
              className="inline-block max-w-[120px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
            >
              {val || '(empty)'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
