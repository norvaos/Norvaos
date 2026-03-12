'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Search,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Asterisk,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useIrccFormFields,
  useBulkUpdateIrccFormFields,
} from '@/lib/queries/ircc-forms'
import type { IrccFormField, IrccFormFieldUpdate } from '@/lib/types/ircc-forms'
import { deriveClientLabel } from '@/lib/ircc/xfa-label-utils'
import {
  isSystemField as isSystemFieldCheck,
  deriveSectionKey,
  deriveSectionTitle,
} from '@/lib/ircc/field-auto-classify'
import { cn } from '@/lib/utils'

// ── XFA field classification (delegates to shared module) ───────────────────

function isSystemField(field: IrccFormField): boolean {
  if (field.is_meta_field) return true
  return isSystemFieldCheck(field.xfa_path || '', field.suggested_label || null)
}

/**
 * Extract a section group key from XFA path.
 * e.g. "Part1.SponsorDetails.q1.FamilyName" → "Part1.SponsorDetails"
 */
function getSectionKey(xfaPath: string): string {
  const key = deriveSectionKey(xfaPath)
  if (!key) {
    const parts = xfaPath.split('.')
    return parts[0] || 'Other'
  }
  // Use Part.Section composite key for grouping in admin panel
  const parts = xfaPath.split('.')
  return `${parts[0]}.${key}`
}

function getSectionTitle(sectionKey: string): string {
  const parts = sectionKey.split('.')
  const segment = parts[1] || parts[0] || 'Other'
  return deriveSectionTitle(segment)
}

/** Get display label for a field using shared label utility */
function getDisplayLabel(field: IrccFormField): string {
  return deriveClientLabel(field.xfa_path, field.label, field.suggested_label)
}

// ── Component ───────────────────────────────────────────────────────────────

interface SectionGroup {
  key: string
  title: string
  fields: IrccFormField[]
}

export function ClientFieldConfigPanel({ formId }: { formId: string }) {
  const { data: fields, isLoading } = useIrccFormFields(formId)
  const bulkUpdateMutation = useBulkUpdateIrccFormFields()
  const [search, setSearch] = useState('')
  const [showSystemFields, setShowSystemFields] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [pendingUpdates, setPendingUpdates] = useState<
    Record<string, IrccFormFieldUpdate>
  >({})

  // Merge DB state with pending local changes
  const mergedFields = useMemo(() => {
    if (!fields) return []
    return (fields as IrccFormField[]).map((f) => {
      const pending = pendingUpdates[f.id]
      return pending ? { ...f, ...pending } : f
    })
  }, [fields, pendingUpdates])

  // Separate system fields from client-configurable fields
  const { clientFields, systemFieldCount } = useMemo(() => {
    const client: IrccFormField[] = []
    let system = 0
    for (const f of mergedFields) {
      if (isSystemField(f)) system++
      else client.push(f)
    }
    return { clientFields: client, systemFieldCount: system }
  }, [mergedFields])

  // Apply search filter
  const filteredFields = useMemo(() => {
    if (!search) return clientFields
    const lower = search.toLowerCase()
    return clientFields.filter(
      (f) =>
        getDisplayLabel(f).toLowerCase().includes(lower) ||
        f.xfa_path.toLowerCase().includes(lower)
    )
  }, [clientFields, search])

  // Group into sections by XFA path
  const sections: SectionGroup[] = useMemo(() => {
    const map = new Map<string, IrccFormField[]>()
    for (const f of filteredFields) {
      const key = getSectionKey(f.xfa_path)
      const arr = map.get(key) || []
      arr.push(f)
      map.set(key, arr)
    }
    return Array.from(map.entries()).map(([key, sectionFields]) => ({
      key,
      title: getSectionTitle(key),
      fields: sectionFields,
    }))
  }, [filteredFields])

  // Stats
  const visibleCount = clientFields.filter((f) => f.is_client_visible).length
  const requiredCount = clientFields.filter((f) => f.is_client_required).length
  const totalClient = clientFields.length
  const pendingCount = Object.keys(pendingUpdates).length

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleToggleVisible = useCallback(
    (fieldId: string, checked: boolean) => {
      setPendingUpdates((prev) => ({
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          is_client_visible: checked,
          ...(checked ? {} : { is_client_required: false }),
        },
      }))
    },
    []
  )

  const handleToggleRequired = useCallback(
    (fieldId: string, checked: boolean) => {
      setPendingUpdates((prev) => ({
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          is_client_required: checked,
        },
      }))
    },
    []
  )

  const handleLabelChange = useCallback(
    (fieldId: string, label: string) => {
      setPendingUpdates((prev) => ({
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          label: label || null,
        },
      }))
    },
    []
  )

  const handleSelectAllInSection = useCallback(
    (sectionFields: IrccFormField[]) => {
      const updates: Record<string, IrccFormFieldUpdate> = { ...pendingUpdates }
      for (const f of sectionFields) {
        updates[f.id] = { ...updates[f.id], is_client_visible: true }
      }
      setPendingUpdates(updates)
    },
    [pendingUpdates]
  )

  const handleDeselectAllInSection = useCallback(
    (sectionFields: IrccFormField[]) => {
      const updates: Record<string, IrccFormFieldUpdate> = { ...pendingUpdates }
      for (const f of sectionFields) {
        updates[f.id] = { ...updates[f.id], is_client_visible: false, is_client_required: false }
      }
      setPendingUpdates(updates)
    },
    [pendingUpdates]
  )

  const handleSelectAll = useCallback(() => {
    const updates: Record<string, IrccFormFieldUpdate> = { ...pendingUpdates }
    for (const f of clientFields) {
      updates[f.id] = { ...updates[f.id], is_client_visible: true }
    }
    setPendingUpdates(updates)
  }, [clientFields, pendingUpdates])

  const handleDeselectAll = useCallback(() => {
    const updates: Record<string, IrccFormFieldUpdate> = { ...pendingUpdates }
    for (const f of clientFields) {
      updates[f.id] = { ...updates[f.id], is_client_visible: false, is_client_required: false }
    }
    setPendingUpdates(updates)
  }, [clientFields, pendingUpdates])

  const handleSave = async () => {
    const entries = Object.entries(pendingUpdates)
    if (entries.length === 0) {
      toast.info('No changes to save')
      return
    }

    try {
      await bulkUpdateMutation.mutateAsync({
        formId,
        updates: entries.map(([fieldId, updates]) => ({ fieldId, updates })),
      })
      setPendingUpdates({})
      toast.success('Client field configuration saved')
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Client Questionnaire Fields</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Select which fields the client fills on the portal. Grouped by form section.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={bulkUpdateMutation.isPending}
              >
                {bulkUpdateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Save {pendingCount} Change{pendingCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>

        {/* Search + Actions bar */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleSelectAll}>
            <Eye className="h-3 w-3" />
            Select All
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleDeselectAll}>
            <EyeOff className="h-3 w-3" />
            Deselect All
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
          <span>
            <strong className="text-slate-700">{visibleCount}</strong> of{' '}
            <strong className="text-slate-700">{totalClient}</strong> fields visible to client
          </span>
          <span>
            <strong className="text-slate-700">{requiredCount}</strong> mandatory
          </span>
          {systemFieldCount > 0 && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
              onClick={() => setShowSystemFields(!showSystemFields)}
            >
              <Filter className="h-3 w-3" />
              {systemFieldCount} system fields {showSystemFields ? 'shown' : 'hidden'}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Sections */}
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No fields found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Try a different search term' : 'Upload and scan a form to extract fields'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {sections.map((section) => {
              const isCollapsed = collapsedSections.has(section.key)
              const sectionVisible = section.fields.filter((f) => f.is_client_visible).length
              return (
                <div key={section.key}>
                  {/* Section header */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left cursor-pointer select-none"
                    onClick={() => toggleSection(section.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection(section.key) }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-700 flex-1">
                      {section.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-4',
                        sectionVisible > 0
                          ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                          : 'text-slate-400'
                      )}
                    >
                      {sectionVisible}/{section.fields.length}
                    </Badge>
                    {!isCollapsed && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="text-[10px] text-blue-500 hover:text-blue-700 px-1"
                          onClick={() => handleSelectAllInSection(section.fields)}
                        >
                          All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
                          onClick={() => handleDeselectAllInSection(section.fields)}
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section fields */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {/* Column header */}
                      <div className="grid grid-cols-[36px_36px_1fr_120px] gap-2 px-4 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        <div className="text-center">Show</div>
                        <div className="text-center">Req</div>
                        <div>Field</div>
                        <div className="text-right">XFA Path</div>
                      </div>
                      {section.fields.map((field) => (
                        <ClientFieldRow
                          key={field.id}
                          field={field}
                          onToggleVisible={handleToggleVisible}
                          onToggleRequired={handleToggleRequired}
                          onLabelChange={handleLabelChange}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* System fields (collapsed by default) */}
            {showSystemFields && systemFieldCount > 0 && (
              <div>
                <div className="px-4 py-2 bg-amber-50/50 text-xs text-amber-600 font-medium flex items-center gap-1.5">
                  <Filter className="h-3 w-3" />
                  System / Meta Fields ({systemFieldCount}) — auto-hidden from clients
                </div>
                <div className="divide-y divide-slate-100 opacity-40">
                  {mergedFields
                    .filter((f) => isSystemField(f))
                    .map((field) => (
                      <div
                        key={field.id}
                        className="grid grid-cols-[36px_36px_1fr_120px] gap-2 px-4 py-2 items-center"
                      >
                        <div className="text-center text-xs text-slate-300">—</div>
                        <div className="text-center text-xs text-slate-300">—</div>
                        <div className="text-xs text-slate-400 truncate">
                          {field.suggested_label || field.xfa_path}
                        </div>
                        <div className="text-[10px] text-slate-300 truncate text-right font-mono">
                          {field.xfa_path}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Field row ───────────────────────────────────────────────────────────────

function ClientFieldRow({
  field,
  onToggleVisible,
  onToggleRequired,
  onLabelChange,
}: {
  field: IrccFormField
  onToggleVisible: (id: string, checked: boolean) => void
  onToggleRequired: (id: string, checked: boolean) => void
  onLabelChange: (id: string, label: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const displayLabel = getDisplayLabel(field)
  // Show last 2 segments of xfa path for context
  const shortPath = field.xfa_path.split('.').slice(-2).join('.')

  return (
    <div
      className={cn(
        'grid grid-cols-[36px_36px_1fr_120px] gap-2 px-4 py-2 items-center transition-colors',
        field.is_client_visible
          ? 'bg-blue-50/30 hover:bg-blue-50/50'
          : 'hover:bg-slate-50/50'
      )}
    >
      {/* Show checkbox */}
      <div className="flex justify-center">
        <Checkbox
          checked={field.is_client_visible}
          onCheckedChange={(checked) =>
            onToggleVisible(field.id, checked === true)
          }
        />
      </div>

      {/* Required checkbox */}
      <div className="flex justify-center">
        <Checkbox
          checked={field.is_client_required}
          disabled={!field.is_client_visible}
          onCheckedChange={(checked) =>
            onToggleRequired(field.id, checked === true)
          }
        />
      </div>

      {/* Label */}
      <div className="flex items-center gap-2 min-w-0">
        {isEditing ? (
          <Input
            className="h-7 text-xs flex-1"
            defaultValue={field.label || field.suggested_label || ''}
            placeholder={displayLabel}
            autoFocus
            onBlur={(e) => {
              onLabelChange(field.id, e.target.value)
              setIsEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onLabelChange(field.id, (e.target as HTMLInputElement).value)
                setIsEditing(false)
              }
              if (e.key === 'Escape') setIsEditing(false)
            }}
          />
        ) : (
          <button
            type="button"
            className="text-xs text-left truncate flex-1 hover:text-primary transition-colors"
            onClick={() => setIsEditing(true)}
            title={`Click to edit label\nXFA: ${field.xfa_path}`}
          >
            {displayLabel}
          </button>
        )}
        {field.is_client_required && field.is_client_visible && (
          <Asterisk className="h-3 w-3 text-red-400 flex-shrink-0" />
        )}
      </div>

      {/* Short XFA path for context */}
      <div className="text-[10px] text-slate-300 truncate text-right font-mono" title={field.xfa_path}>
        {shortPath}
      </div>
    </div>
  )
}
