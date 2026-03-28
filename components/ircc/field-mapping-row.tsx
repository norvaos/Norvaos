'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { searchProfilePaths } from '@/lib/ircc/profile-path-catalog'
import type { IrccFormField, IrccFormFieldUpdate } from '@/lib/types/ircc-forms'

export function FieldMappingRow({
  field,
  onUpdate,
}: {
  field: IrccFormField
  onUpdate: (fieldId: string, updates: IrccFormFieldUpdate) => void
}) {
  const [profilePathSearch, setProfilePathSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(
    () => (profilePathSearch ? searchProfilePaths(profilePathSearch).slice(0, 8) : []),
    [profilePathSearch],
  )

  return (
    <TableRow className={field.is_mapped ? 'bg-emerald-950/30/30' : ''}>
      <TableCell className="font-mono text-xs max-w-[200px] truncate" title={field.xfa_path}>
        {field.xfa_path}
      </TableCell>
      <TableCell className="text-xs">{field.suggested_label ?? ' - '}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {field.xfa_field_type ?? 'text'}
        </Badge>
      </TableCell>
      <TableCell className="relative min-w-[220px]">
        <div className="relative">
          <Input
            className="h-8 text-xs font-mono"
            placeholder="e.g. personal.family_name"
            value={field.profile_path ?? profilePathSearch}
            onChange={(e) => {
              setProfilePathSearch(e.target.value)
              setShowSuggestions(true)
              if (!e.target.value) {
                onUpdate(field.id, { profile_path: null })
              }
            }}
            onFocus={() => {
              if (profilePathSearch || field.profile_path) setShowSuggestions(true)
            }}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 200)
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onUpdate(field.id, { profile_path: s.path })
                    setProfilePathSearch('')
                    setShowSuggestions(false)
                  }}
                >
                  <span className="font-mono text-primary">{s.path}</span>
                  <span className="text-slate-400">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {field.is_mapped ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <span className="text-xs text-slate-400"> - </span>
        )}
      </TableCell>
    </TableRow>
  )
}
