'use client'

/**
 * CustomFieldsPanel  -  Renders a dynamic form from a matter type's JSON schema.
 *
 * Reads the active schema from `matter_type_schema` and the saved values from
 * `matter_custom_data`. Fields are rendered based on the JSON schema `type`
 * property: text, number, date, select (enum), and checkbox (boolean).
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  useMatterTypeSchema,
  useMatterCustomData,
  useUpsertMatterCustomData,
} from '@/lib/queries/matter-types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean'
  title?: string
  description?: string
  enum?: string[]
  format?: string // 'date' for date fields
  default?: unknown
}

interface JsonSchema {
  type: 'object'
  properties: Record<string, FieldSchema>
  required?: string[]
}

interface UiSchemaField {
  'ui:order'?: number
  'ui:placeholder'?: string
  'ui:help'?: string
}

interface UiSchema {
  'ui:order'?: string[]
  [fieldName: string]: UiSchemaField | string[] | undefined
}

interface CustomFieldsPanelProps {
  matterId: string
  matterTypeId: string | null | undefined
  tenantId: string
  readOnly?: boolean
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CustomFieldsPanel({
  matterId,
  matterTypeId,
  tenantId,
  readOnly = false,
}: CustomFieldsPanelProps) {
  const { data: schema, isLoading: schemaLoading } = useMatterTypeSchema(matterTypeId)
  const { data: customData, isLoading: dataLoading } = useMatterCustomData(matterId)
  const upsertCustomData = useUpsertMatterCustomData()

  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const jsonSchema = schema?.json_schema as unknown as JsonSchema | null
  const uiSchema = schema?.ui_schema as unknown as UiSchema | null

  // Determine field order
  const fieldOrder = useMemo(() => {
    if (!jsonSchema?.properties) return []
    const properties = Object.keys(jsonSchema.properties)
    if (uiSchema?.['ui:order']) {
      const ordered = uiSchema['ui:order'] as string[]
      // Include ordered fields first, then any remaining
      const remaining = properties.filter((k) => !ordered.includes(k))
      return [...ordered.filter((k) => properties.includes(k)), ...remaining]
    }
    return properties
  }, [jsonSchema, uiSchema])

  // Initialise form values from saved data or schema defaults
  // Use stable deps to avoid infinite re-render when object refs change
  const schemaVersion = schema?.schema_version
  const customDataId = customData?.id
  useEffect(() => {
    if (!jsonSchema?.properties) return

    const saved = (customData?.data as Record<string, unknown>) ?? {}
    const initial: Record<string, unknown> = {}

    for (const [key, fieldDef] of Object.entries(jsonSchema.properties)) {
      if (key in saved) {
        initial[key] = saved[key]
      } else if (fieldDef.default !== undefined) {
        initial[key] = fieldDef.default
      } else {
        initial[key] = fieldDef.type === 'boolean' ? false : ''
      }
    }
    setFormValues(initial)
    setIsDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaVersion, customDataId])

  const handleChange = useCallback((key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    setValidationErrors((prev) => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return prev
    })
    setIsDirty(true)
  }, [])

  const handleSave = () => {
    if (!schema || !matterTypeId || !jsonSchema) return

    // Validate required fields
    const errors: Record<string, string> = {}
    const requiredSet = new Set(jsonSchema.required ?? [])
    for (const fieldName of requiredSet) {
      const val = formValues[fieldName]
      if (val === undefined || val === null || val === '') {
        const fieldDef = jsonSchema.properties[fieldName]
        errors[fieldName] = `${fieldDef?.title ?? fieldName} is required`
      }
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      toast.error('Please fill in all required fields', {
        description: Object.values(errors).join(', '),
      })
      return
    }
    setValidationErrors({})

    upsertCustomData.mutate({
      tenantId,
      matterId,
      matterTypeId,
      schemaVersion: schema.schema_version,
      data: formValues,
    })
    setIsDirty(false)
  }

  // ── Loading / empty states ──

  if (schemaLoading || dataLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!matterTypeId) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Assign a matter type to enable custom fields.
      </div>
    )
  }

  if (!jsonSchema?.properties || Object.keys(jsonSchema.properties).length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No custom fields defined for this matter type.
        <br />
        <span className="text-xs">Configure fields in Settings → Matter Types.</span>
      </div>
    )
  }

  const requiredFields = new Set(jsonSchema.required ?? [])

  // ── Render ──

  return (
    <div className="space-y-4">
      {fieldOrder.map((fieldName) => {
        const fieldDef = jsonSchema.properties[fieldName]
        if (!fieldDef) return null

        const fieldUi = uiSchema?.[fieldName] as UiSchemaField | undefined
        const label = fieldDef.title ?? fieldName
        const isRequired = requiredFields.has(fieldName)
        const value = formValues[fieldName]

        return (
          <div key={fieldName} className="space-y-1.5">
            <Label htmlFor={`cf-${fieldName}`} className="text-sm font-medium">
              {label}
              {isRequired && <span className="text-destructive ml-0.5">*</span>}
            </Label>

            {fieldDef.description && (
              <p className="text-xs text-muted-foreground">{fieldDef.description}</p>
            )}

            {/* String with enum → Select */}
            {fieldDef.type === 'string' && fieldDef.enum ? (
              <Select
                value={(value as string) ?? ''}
                onValueChange={(v) => handleChange(fieldName, v)}
                disabled={readOnly}
              >
                <SelectTrigger id={`cf-${fieldName}`} className="h-9">
                  <SelectValue placeholder={fieldUi?.['ui:placeholder'] ?? 'Select...'} />
                </SelectTrigger>
                <SelectContent>
                  {fieldDef.enum.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : fieldDef.type === 'string' && fieldDef.format === 'date' ? (
              /* Date field */
              <Input
                id={`cf-${fieldName}`}
                type="date"
                value={(value as string) ?? ''}
                onChange={(e) => handleChange(fieldName, e.target.value)}
                disabled={readOnly}
                className="h-9"
              />
            ) : fieldDef.type === 'string' ? (
              /* Plain text field */
              <Input
                id={`cf-${fieldName}`}
                type="text"
                value={(value as string) ?? ''}
                onChange={(e) => handleChange(fieldName, e.target.value)}
                placeholder={fieldUi?.['ui:placeholder'] ?? ''}
                disabled={readOnly}
                className="h-9"
              />
            ) : fieldDef.type === 'number' || fieldDef.type === 'integer' ? (
              /* Number field */
              <Input
                id={`cf-${fieldName}`}
                type="number"
                value={value !== undefined && value !== '' ? String(value) : ''}
                onChange={(e) =>
                  handleChange(
                    fieldName,
                    e.target.value === ''
                      ? ''
                      : fieldDef.type === 'integer'
                        ? parseInt(e.target.value, 10)
                        : parseFloat(e.target.value)
                  )
                }
                disabled={readOnly}
                className="h-9"
              />
            ) : fieldDef.type === 'boolean' ? (
              /* Checkbox */
              <div className="flex items-center gap-2 pt-0.5">
                <Checkbox
                  id={`cf-${fieldName}`}
                  checked={!!value}
                  onCheckedChange={(checked) => handleChange(fieldName, !!checked)}
                  disabled={readOnly}
                />
                <Label htmlFor={`cf-${fieldName}`} className="text-sm font-normal cursor-pointer">
                  {label}
                </Label>
              </div>
            ) : null}

            {validationErrors[fieldName] && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {validationErrors[fieldName]}
              </p>
            )}

            {fieldUi?.['ui:help'] && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {fieldUi['ui:help']}
              </p>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <div className="pt-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || upsertCustomData.isPending}
            className="w-full"
          >
            {upsertCustomData.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Custom Fields
          </Button>
        </div>
      )}
    </div>
  )
}
