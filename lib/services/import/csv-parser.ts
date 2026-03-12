/**
 * CSV parser wrapper around Papa Parse.
 *
 * Handles: RFC 4180 compliance, UTF-8 BOM, auto-delimiter detection,
 * quoted fields with embedded commas/newlines, and preview mode.
 */

import Papa from 'papaparse'
import type { ParsedCsv } from './types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Parse a full CSV string into headers + row objects.
 */
export function parseCSV(content: string): ParsedCsv {
  // Strip UTF-8 BOM if present
  const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    totalRows: result.data.length,
    errors: result.errors.map((e) => ({
      row: e.row ?? -1,
      message: e.message,
    })),
  }
}

/**
 * Parse only the first N rows for preview/header detection.
 * Much faster for large files.
 */
export function parseCSVPreview(content: string, maxRows = 5): ParsedCsv {
  const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    preview: maxRows,
    transformHeader: (h) => h.trim(),
  })

  // Count total rows by counting newlines (approximate but fast)
  const totalRows = cleaned.split('\n').filter((line) => line.trim().length > 0).length - 1 // subtract header

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    totalRows: Math.max(totalRows, result.data.length),
    errors: result.errors.map((e) => ({
      row: e.row ?? -1,
      message: e.message,
    })),
  }
}

/**
 * Validate that a file is a valid CSV before processing.
 * Returns an error message or null if valid.
 */
export function validateCSVFile(file: { name: string; size: number; type?: string }): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'File must be a CSV (.csv) file.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`
  }
  if (file.size === 0) {
    return 'File is empty.'
  }
  return null
}

/**
 * Auto-map CSV headers to adapter field mappings.
 * Uses exact match and alias matching (case-insensitive).
 */
export function autoMapColumns(
  csvHeaders: string[],
  fieldMappings: { sourceColumn: string; targetColumn: string; required: boolean; aliases?: string[] }[],
): { mapped: Record<string, string>; unmapped: string[]; missingRequired: string[] } {
  const mapped: Record<string, string> = {}
  const matchedHeaders = new Set<string>()

  for (const field of fieldMappings) {
    if (field.targetColumn === '__source_id') continue // internal field, not mapped in UI

    // Try exact match first
    const exactMatch = csvHeaders.find(
      (h) => h.toLowerCase() === field.sourceColumn.toLowerCase(),
    )
    if (exactMatch) {
      mapped[exactMatch] = field.targetColumn
      matchedHeaders.add(exactMatch)
      continue
    }

    // Try aliases
    if (field.aliases) {
      const aliasMatch = csvHeaders.find((h) =>
        field.aliases!.some((a) => a.toLowerCase() === h.toLowerCase()),
      )
      if (aliasMatch) {
        mapped[aliasMatch] = field.targetColumn
        matchedHeaders.add(aliasMatch)
      }
    }
  }

  const unmapped = csvHeaders.filter((h) => !matchedHeaders.has(h))

  const mappedTargets = new Set(Object.values(mapped))
  const missingRequired = fieldMappings
    .filter((f) => f.required && f.targetColumn !== '__source_id' && !mappedTargets.has(f.targetColumn))
    .map((f) => f.targetColumn)

  return { mapped, unmapped, missingRequired }
}
