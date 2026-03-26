import { describe, it, expect } from 'vitest'
import { arrayToCsv, type ColumnDef } from '../csv-export'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a CSV string back into a 2-D array of cell values (no unescaping). */
function csvLines(csv: string): string[][] {
  return csv
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(','))
}

// ── Minimal schema for testing ───────────────────────────────────────────────

const SCHEMA: ColumnDef[] = [
  { key: 'name', header: 'Name', formatter: (v) => String(v ?? '') },
  { key: 'value', header: 'Value', formatter: (v) => String(v ?? '') },
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CSV Export – formula injection defence', () => {
  it('prefixes =SUM(1,1) with a single quote', () => {
    const rows = [{ name: '=SUM(1,1)', value: 'safe' }]
    const csv = arrayToCsv(rows, SCHEMA)
    const cells = csvLines(csv)

    // Header row
    expect(cells[0]).toEqual(['Name', 'Value'])

    // Data row: the dangerous cell must be neutralised with a leading '
    // Because the sanitised value "'=SUM(1,1)" contains a comma (from
    // the formula arguments), escapeCell will also wrap it in double-quotes.
    const nameCell = cells[1][0]
    // After CSV quoting: "=SUM(1   -  but we need the raw cell. Let's verify
    // on the raw CSV string instead for precision.
    expect(csv).toContain("\"'=SUM(1,1)\"")
  })

  it('prefixes cells starting with + - @ \\t \\r |', () => {
    const dangerous = ['+cmd', '-cmd', '@cmd', '\tcmd', '\rcmd', '|cmd']
    for (const val of dangerous) {
      const rows = [{ name: val, value: 'ok' }]
      const csv = arrayToCsv(rows, SCHEMA)
      // Each dangerous cell must be prefixed with '
      expect(csv).toContain(`'${val}`)
    }
  })

  it('does NOT prefix normal text', () => {
    const rows = [{ name: 'Alice', value: '100' }]
    const csv = arrayToCsv(rows, SCHEMA)
    expect(csv).toContain('Alice')
    expect(csv).not.toContain("'Alice")
  })

  it('uses CRLF line endings per RFC 4180', () => {
    const rows = [{ name: 'a', value: 'b' }]
    const csv = arrayToCsv(rows, SCHEMA)
    expect(csv).toContain('\r\n')
    // No bare \n without preceding \r
    const withoutCRLF = csv.replace(/\r\n/g, '')
    expect(withoutCRLF).not.toContain('\n')
  })

  it('escapes double-quotes inside cell values', () => {
    const rows = [{ name: 'He said "hi"', value: 'ok' }]
    const csv = arrayToCsv(rows, SCHEMA)
    // RFC 4180: double-quotes inside a quoted field are escaped by doubling
    expect(csv).toContain('"He said ""hi"""')
  })

  it('handles empty data gracefully', () => {
    const csv = arrayToCsv([], SCHEMA)
    const lines = csv.trimEnd().split('\r\n')
    // Only the header line
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Name,Value')
  })
})
