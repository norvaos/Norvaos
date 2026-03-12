'use client'

import { BILLING_TYPES } from '@/lib/utils/constants'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/types/database'

// ── Formatter Functions ───────────────────────────────────────────────────────

type FormatterFn = (value: unknown) => string

const formatters: Record<string, FormatterFn> = {
  string: (v) => String(v ?? ''),
  number: (v) => String(v ?? 0),
  centsToCAD: (v) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(Number(v ?? 0) / 100),
  monthDate: (v) => String(v ?? ''),
  percent: (v) => {
    const n = Number(v ?? 0)
    // If value is already 0-100 (integer percent), display directly
    return n > 1 ? `${n.toFixed(1)}%` : `${(n * 100).toFixed(1)}%`
  },
  billingLabel: (v) => {
    const label = BILLING_TYPES.find((b) => b.value === String(v))?.label
    return label ?? String(v ?? '')
  },
  isoDate: (v) => {
    if (!v) return ''
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? String(v) : d.toISOString().split('T')[0]
  },
}

// ── Column Definition ─────────────────────────────────────────────────────────

export interface ColumnDef {
  key: string
  header: string
  formatter: FormatterFn
}

function col(key: string, header: string, fmt: keyof typeof formatters = 'string'): ColumnDef {
  return { key, header, formatter: formatters[fmt] }
}

// ── Centralized Report Column Schemas ─────────────────────────────────────────

export type ReportKey =
  | 'kpi_summary'
  | 'matters_by_practice_area'
  | 'matters_opened_vs_closed'
  | 'tasks_by_assignee'
  | 'revenue_by_practice_area'
  | 'revenue_by_billing_type'
  | 'revenue_trend'
  | 'matters_by_lawyer'
  | 'task_completion_by_user'

export const REPORT_COLUMN_SCHEMAS: Record<ReportKey, ColumnDef[]> = {
  kpi_summary: [
    col('activeMatterCount', 'Active Matters', 'number'),
    col('newMatterCount', 'New Matters', 'number'),
    col('closedMatterCount', 'Closed Matters', 'number'),
    col('totalBilledInPeriod', 'Revenue', 'centsToCAD'),
    col('openTaskCount', 'Open Tasks', 'number'),
    col('completedTaskCount', 'Completed Tasks', 'number'),
    col('completionRate', 'Task Completion %', 'percent'),
  ],
  matters_by_practice_area: [
    col('practice_area_name', 'Practice Area'),
    col('count', 'Active Matters', 'number'),
  ],
  matters_opened_vs_closed: [
    col('month', 'Month', 'monthDate'),
    col('opened', 'Opened', 'number'),
    col('closed', 'Closed', 'number'),
  ],
  tasks_by_assignee: [
    col('user_name', 'Assignee'),
    col('overdue_count', 'Overdue', 'number'),
    col('open_count', 'Open', 'number'),
    col('completed_count', 'Completed', 'number'),
  ],
  revenue_by_practice_area: [
    col('practice_area_name', 'Practice Area'),
    col('total_billed', 'Revenue', 'centsToCAD'),
  ],
  revenue_by_billing_type: [
    col('billing_type_label', 'Billing Type'),
    col('total_billed', 'Revenue', 'centsToCAD'),
  ],
  revenue_trend: [
    col('month', 'Month', 'monthDate'),
    col('revenue', 'Revenue', 'centsToCAD'),
  ],
  matters_by_lawyer: [
    col('user_name', 'Lawyer'),
    col('active_count', 'Active Matters', 'number'),
  ],
  task_completion_by_user: [
    col('user_name', 'Team Member'),
    col('completed', 'Completed', 'number'),
    col('total', 'Total', 'number'),
    col('completion_rate', 'Completion %', 'percent'),
  ],
}

// ── CSV Builder ───────────────────────────────────────────────────────────────

/**
 * Characters that trigger formula execution in Excel, Google Sheets, LibreOffice
 * when they appear as the first character of a cell value.
 * See OWASP: https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r', '|'])

/**
 * Neutralise Excel/Sheets formula injection.
 * If the value starts with a dangerous character, prefix with a single-quote
 * so spreadsheets treat it as a literal text cell.
 */
function sanitiseFormulaInjection(value: string): string {
  if (value.length > 0 && FORMULA_PREFIXES.has(value[0])) {
    return `'${value}`
  }
  return value
}

/**
 * Escape a CSV cell value according to RFC 4180.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Also neutralises formula injection (OWASP CSV Injection).
 */
function escapeCell(value: string): string {
  const safe = sanitiseFormulaInjection(value)
  if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

/**
 * Convert an array of row objects to a CSV string using a fixed column schema.
 * Uses CRLF line endings per RFC 4180.
 */
export function arrayToCsv(
  rows: Record<string, unknown>[],
  schema: ColumnDef[]
): string {
  const headerLine = schema.map((c) => escapeCell(c.header)).join(',')
  const dataLines = rows.map((row) =>
    schema
      .map((c) => {
        const raw = row[c.key]
        const formatted = c.formatter(raw)
        return escapeCell(formatted)
      })
      .join(',')
  )
  return [headerLine, ...dataLines].join('\r\n') + '\r\n'
}

/**
 * Trigger a browser download with a CSV string.
 * Prepends UTF-8 BOM for Excel compatibility.
 */
export function downloadCsv(csvString: string, filename: string): void {
  // UTF-8 BOM for Excel
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ── Audit Logger ──────────────────────────────────────────────────────────────

export interface ReportExportAuditPayload {
  report_key: ReportKey
  filters_applied: Record<string, string | undefined>
  row_count: number
  period: string
}

async function logReportExport(
  tenantId: string,
  userId: string,
  payload: ReportExportAuditPayload
): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      activity_type: 'report_exported',
      title: `Report exported: ${payload.report_key}`,
      description: `Exported ${payload.row_count} rows from ${payload.report_key} report (${payload.period})`,
      entity_type: 'report',
      entity_id: payload.report_key,
      user_id: userId,
      metadata: payload as unknown as Json,
    })
  } catch {
    // Audit logging should never break the export flow
    console.error('Failed to log report export audit event')
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Export a report as CSV with audit logging.
 * Uses the centralized column schema for the given report key.
 */
export async function exportReport(
  reportKey: ReportKey,
  data: Record<string, unknown>[] | Record<string, unknown>,
  options: {
    tenantId: string
    userId: string
    period: string
    filters?: Record<string, string | undefined>
  }
): Promise<void> {
  const schema = REPORT_COLUMN_SCHEMAS[reportKey]
  if (!schema) {
    console.error(`[CSV Export] BLOCKED: no column schema for report key "${reportKey}"`)
    // Log missing schema as audit event
    try {
      const supabase = createClient()
      await supabase.from('activities').insert({
        tenant_id: options.tenantId,
        activity_type: 'report_export_schema_missing',
        title: `Export blocked: missing schema for ${reportKey}`,
        description: `Attempted CSV export of "${reportKey}" but no column schema is defined. Export was blocked.`,
        entity_type: 'report',
        entity_id: reportKey,
        user_id: options.userId,
        metadata: { report_key: reportKey, period: options.period } as unknown as Json,
      })
    } catch {
      // Audit logging should never break the export flow
    }
    throw new Error(`Export unavailable: no column schema defined for "${reportKey}". Contact your administrator.`)
  }

  // Normalise: single-row data (KPIs) becomes a one-element array
  const rows = Array.isArray(data) ? data : [data]

  const csvString = arrayToCsv(rows as Record<string, unknown>[], schema)
  const filename = `${reportKey}-${options.period.replace(/\s+/g, '-').toLowerCase()}.csv`
  downloadCsv(csvString, filename)

  // Fire-and-forget audit log
  await logReportExport(options.tenantId, options.userId, {
    report_key: reportKey,
    filters_applied: options.filters ?? {},
    row_count: rows.length,
    period: options.period,
  })
}
