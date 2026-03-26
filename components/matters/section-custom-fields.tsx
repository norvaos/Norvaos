'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Section Custom Fields Renderer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders dynamic custom fields defined per section in matter type settings.
 * Stores/retrieves values via the matter_custom_data JSONB table.
 *
 * Supports field types: text, date, number, select, checkbox
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomFieldDef } from '@/lib/types/ircc-forms'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface SectionCustomFieldsProps {
  matterId: string
  sectionKey: string
  customFields: CustomFieldDef[]
}

type CustomDataValues = Record<string, string | number | boolean | null>

// ── Data Hook ────────────────────────────────────────────────────────────────

function useCustomData(matterId: string, sectionKey: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['matter-custom-data', matterId, sectionKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_custom_data')
        .select('data')
        .eq('matter_id', matterId)
        .eq('section_key', sectionKey)
        .maybeSingle()

      if (error) throw error
      return (data?.data ?? {}) as CustomDataValues
    },
    staleTime: 30_000,
  })
}

function useSaveCustomData() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      sectionKey,
      values,
    }: {
      matterId: string
      sectionKey: string
      values: CustomDataValues
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('matter_custom_data')
        .upsert(
          {
            matter_id: matterId,
            section_key: sectionKey,
            data: values,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'matter_id,section_key' },
        )
      if (error) throw error
    },
    onSuccess: (_, { matterId, sectionKey }) => {
      queryClient.invalidateQueries({
        queryKey: ['matter-custom-data', matterId, sectionKey],
      })
    },
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export function SectionCustomFields({
  matterId,
  sectionKey,
  customFields,
}: SectionCustomFieldsProps) {
  const { data: savedValues, isLoading } = useCustomData(matterId, sectionKey)
  const saveCustomData = useSaveCustomData()
  const [localValues, setLocalValues] = useState<CustomDataValues>({})

  // Sync local state with saved values
  useEffect(() => {
    if (savedValues) {
      setLocalValues(savedValues)
    }
  }, [savedValues])

  const handleChange = useCallback(
    (key: string, value: string | number | boolean | null) => {
      setLocalValues((prev) => {
        const next = { ...prev, [key]: value }
        // Debounced save
        saveCustomData.mutate({
          matterId,
          sectionKey,
          values: next,
        })
        return next
      })
    },
    [matterId, sectionKey, saveCustomData],
  )

  if (!customFields || customFields.length === 0) return null
  if (isLoading) return null

  return (
    <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="gap-1 text-[10px] text-violet-600 border-violet-200 bg-violet-50">
          <Sparkles className="h-2.5 w-2.5" />
          Custom Fields
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {customFields.map((field) => (
          <CustomFieldInput
            key={field.key}
            field={field}
            value={localValues[field.key] ?? null}
            onChange={(value) => handleChange(field.key, value)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Individual Field Renderer ────────────────────────────────────────────────

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef
  value: string | number | boolean | null
  onChange: (value: string | number | boolean | null) => void
}) {
  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className="h-8 text-sm"
          />
        </div>
      )

    case 'number':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
      )

    case 'date':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <TenantDateInput
            value={(value as string) ?? ''}
            onChange={(iso) => onChange(iso || null)}
            className="h-8 text-sm"
          />
        </div>
      )

    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(v) => onChange(v || null)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? [])
                .filter((opt) => opt.value && opt.value.length > 0)
                .map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )

    case 'checkbox':
      return (
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id={`custom-${field.key}`}
            checked={(value as boolean) ?? false}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <Label
            htmlFor={`custom-${field.key}`}
            className="text-sm text-slate-700 cursor-pointer"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
        </div>
      )

    default:
      return null
  }
}
