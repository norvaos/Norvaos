/**
 * fake-time-entries.ts
 * Generator for synthetic demo time entry records.
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 */

import { randomUUID } from 'crypto'

export interface FakeTimeEntry {
  id: string
  tenant_id: string
  matter_id: string
  description: string
  hours: number
  hourly_rate_cents: number
  amount_cents: number
  is_billable: boolean
  is_billed: boolean
  entry_date: string
}

const DESCRIPTIONS = [
  'Review client documents and prepare notes',
  'Draft cover letter for application submission',
  'Telephone conference with client  -  status update',
  'Research current IRCC processing times',
  'Prepare procedural fairness letter response',
  'Review and annotate opposing party disclosure',
  'Attend court hearing and take notes',
  'Draft separation agreement  -  initial version',
  'Email correspondence with opposing counsel',
  'Prepare invoice and trust account reconciliation',
  'File application package with court registry',
  'Attend IRB hearing  -  full day',
  'Client intake meeting  -  collect instructions',
  'Review biometrics confirmation letter',
  'Prepare statutory declaration',
  'Correspond with IRCC officer re: file status',
  'Legal research  -  family law property division',
  'Prepare child support calculation worksheet',
  'Review and execute retainer agreement',
  'Close matter and prepare final reporting letter',
  'Attend mediation session',
  'Review police clearance certificates',
  'Prepare employer support letter',
  'File notice of appearance',
  'Attend settlement conference',
]

export function generateFakeTimeEntries(
  tenantId: string,
  matterIds: string[],
  count = 25,
): FakeTimeEntry[] {
  const entries: FakeTimeEntry[] = []

  for (let i = 0; i < count; i++) {
    const matterId = matterIds[i % matterIds.length]
    const description = DESCRIPTIONS[i % DESCRIPTIONS.length]
    const isBillable = i % 4 !== 0
    const hourlyRateCents = i % 3 === 0 ? 25000 : 30000 // $250 or $300/hr
    const hours = 0.5 + (i % 8) * 0.5 // 0.5 to 4.0 hours
    const amountCents = isBillable ? Math.round(hours * hourlyRateCents) : 0
    const isBilled = isBillable && i % 5 === 0

    const daysAgo = i * 3
    const entryDate = new Date(Date.now() - daysAgo * 86_400_000)
      .toISOString()
      .split('T')[0]

    entries.push({
      id: randomUUID(),
      tenant_id: tenantId,
      matter_id: matterId,
      description,
      hours,
      hourly_rate_cents: hourlyRateCents,
      amount_cents: amountCents,
      is_billable: isBillable,
      is_billed: isBilled,
      entry_date: entryDate,
    })
  }

  return entries
}
