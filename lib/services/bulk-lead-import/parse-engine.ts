/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Bulk Lead Import  -  CSV Parse Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Parses CSV files into typed rows with auto-column-mapping.
 * Uses PapaParse (already installed). Excel support can be added later.
 */

import Papa from 'papaparse'
import { BULK_LEAD_FIELDS, type ParsedLeadRow, type BulkLeadFieldDef } from './types'

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[]
  rows: ParsedLeadRow[]
  totalRows: number
  suggestedMapping: Record<string, string>
  unmappedHeaders: string[]
  missingRequired: string[]
}

/**
 * Parse a CSV string and return typed rows with auto-mapped columns.
 */
export function parseCSVForLeadImport(
  csvContent: string,
  columnMapping?: Record<string, string>
): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers = parsed.meta.fields ?? []
  const mapping = columnMapping ?? autoMapLeadColumns(headers)

  // Determine unmapped and missing
  const mappedKeys = new Set(Object.values(mapping))
  const unmappedHeaders = headers.filter((h) => !mapping[h])
  const missingRequired = BULK_LEAD_FIELDS
    .filter((f) => f.required && !mappedKeys.has(f.key))
    .map((f) => f.label)

  // Transform rows
  const rows: ParsedLeadRow[] = parsed.data.map((row, idx) => {
    const mapped: Record<string, string | undefined> = {}
    for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
      if (row[csvHeader] !== undefined && row[csvHeader] !== '') {
        mapped[fieldKey] = row[csvHeader]
      }
    }

    return {
      rowNumber: idx + 1,
      first_name: mapped.first_name,
      last_name: mapped.last_name,
      email: mapped.email?.toLowerCase().trim(),
      phone: mapped.phone,
      date_of_birth: mapped.date_of_birth,
      nationality: mapped.nationality,
      country_of_birth: mapped.country_of_birth,
      passport_number: mapped.passport_number?.trim(),
      raw_jurisdiction: mapped.raw_jurisdiction,
      matter_type_name: mapped.matter_type_name,
      temperature: mapped.temperature,
      estimated_value: mapped.estimated_value ? parseFloat(mapped.estimated_value) : undefined,
      notes: mapped.notes,
      source_tag: mapped.source_tag,
      campaign_tag: mapped.campaign_tag,
      utm_source: mapped.utm_source,
      utm_medium: mapped.utm_medium,
      utm_campaign: mapped.utm_campaign,
      source_data: row,
    }
  })

  return {
    headers,
    rows,
    totalRows: rows.length,
    suggestedMapping: mapping,
    unmappedHeaders,
    missingRequired,
  }
}

/**
 * Auto-map CSV headers to bulk lead field keys using aliases.
 */
export function autoMapLeadColumns(
  csvHeaders: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const usedKeys = new Set<string>()

  for (const header of csvHeaders) {
    const normalised = header.toLowerCase().trim().replace(/[_\-]/g, ' ')
    let bestMatch: BulkLeadFieldDef | undefined

    // Exact key match
    bestMatch = BULK_LEAD_FIELDS.find(
      (f) => !usedKeys.has(f.key) && f.key.replace(/_/g, ' ') === normalised
    )

    // Alias match
    if (!bestMatch) {
      bestMatch = BULK_LEAD_FIELDS.find(
        (f) => !usedKeys.has(f.key) && f.aliases.some((a) => a.toLowerCase() === normalised)
      )
    }

    // Label match
    if (!bestMatch) {
      bestMatch = BULK_LEAD_FIELDS.find(
        (f) => !usedKeys.has(f.key) && f.label.toLowerCase() === normalised
      )
    }

    if (bestMatch) {
      mapping[header] = bestMatch.key
      usedKeys.add(bestMatch.key)
    }
  }

  return mapping
}

/**
 * Parse only headers and a preview for the upload step.
 */
export function parseCSVPreview(
  csvContent: string,
  previewRows = 5
): { headers: string[]; preview: Record<string, string>[]; totalRows: number } {
  const lines = csvContent.split('\n').filter((l) => l.trim())
  const totalRows = Math.max(0, lines.length - 1)

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    preview: previewRows,
    transformHeader: (h) => h.trim(),
  })

  return {
    headers: parsed.meta.fields ?? [],
    preview: parsed.data,
    totalRows,
  }
}
