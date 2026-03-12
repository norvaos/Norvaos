/**
 * Row-level validation engine for imported data.
 *
 * Applies field mappings, transforms, and adapter-level validation
 * to produce validated rows ready for insertion.
 */

import type { EntityAdapter, ColumnMapping, ImportError } from './types'

interface MappedRow {
  rowNumber: number
  data: Record<string, unknown>
  sourceId: string | null
  errors: ImportError[]
}

/**
 * Apply column mapping and transforms to a raw CSV row.
 * Returns the mapped data and any validation errors.
 */
export function mapAndValidateRow(
  rawRow: Record<string, string>,
  rowNumber: number,
  columnMapping: ColumnMapping,
  adapter: EntityAdapter,
): MappedRow {
  const data: Record<string, unknown> = {}
  const errors: ImportError[] = []
  let sourceId: string | null = null

  // Build a lookup from target column → field mapping for transforms and defaults
  const fieldLookup = new Map(
    adapter.fieldMappings.map((f) => [f.targetColumn, f]),
  )

  // Also check for __source_id from any mapped source column
  const sourceIdMapping = adapter.fieldMappings.find(
    (f) => f.targetColumn === '__source_id',
  )
  if (sourceIdMapping) {
    const sourceColName = sourceIdMapping.sourceColumn
    // Check exact column name or aliases
    const possibleNames = [sourceColName, ...(sourceIdMapping.aliases ?? [])]
    for (const name of possibleNames) {
      if (rawRow[name]) {
        sourceId = rawRow[name]
        break
      }
    }
  }

  // Apply column mappings
  for (const [sourceHeader, targetColumn] of Object.entries(columnMapping)) {
    if (targetColumn.startsWith('__')) continue // skip internal fields

    const rawValue = rawRow[sourceHeader] ?? ''
    const fieldDef = fieldLookup.get(targetColumn)

    if (!rawValue && fieldDef?.defaultValue !== undefined) {
      data[targetColumn] = fieldDef.defaultValue
      continue
    }

    if (!rawValue) {
      data[targetColumn] = null
      continue
    }

    // Apply transform if defined
    if (fieldDef?.transform) {
      try {
        data[targetColumn] = fieldDef.transform(rawValue, rawRow)
      } catch {
        errors.push({
          rowNumber,
          field: targetColumn,
          sourceValue: rawValue,
          message: `Failed to transform value "${rawValue}" for field "${targetColumn}".`,
          severity: 'error',
        })
        data[targetColumn] = null
      }
    } else {
      data[targetColumn] = rawValue
    }
  }

  // Apply defaults for unmapped fields
  for (const fieldDef of adapter.fieldMappings) {
    if (fieldDef.targetColumn.startsWith('__')) continue
    if (data[fieldDef.targetColumn] === undefined && fieldDef.defaultValue !== undefined) {
      data[fieldDef.targetColumn] = fieldDef.defaultValue
    }
  }

  // Check required fields
  for (const fieldDef of adapter.fieldMappings) {
    if (fieldDef.targetColumn.startsWith('__')) continue
    if (fieldDef.required && !data[fieldDef.targetColumn]) {
      errors.push({
        rowNumber,
        field: fieldDef.targetColumn,
        message: `Required field "${fieldDef.targetColumn}" is missing.`,
        severity: 'error',
      })
    }
  }

  // Run adapter-level validation
  if (adapter.validate) {
    const adapterErrors = adapter.validate(data)
    for (const msg of adapterErrors) {
      errors.push({ rowNumber, message: msg, severity: 'error' })
    }
  }

  return { rowNumber, data, sourceId, errors }
}

/**
 * Validate an entire batch of CSV rows.
 */
export function validateRows(
  rawRows: Record<string, string>[],
  columnMapping: ColumnMapping,
  adapter: EntityAdapter,
): { validRows: MappedRow[]; invalidRows: MappedRow[]; allErrors: ImportError[] } {
  const validRows: MappedRow[] = []
  const invalidRows: MappedRow[] = []
  const allErrors: ImportError[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapAndValidateRow(rawRows[i], i + 1, columnMapping, adapter)

    if (mapped.errors.length > 0) {
      invalidRows.push(mapped)
      allErrors.push(...mapped.errors)
    } else {
      validRows.push(mapped)
    }
  }

  return { validRows, invalidRows, allErrors }
}
