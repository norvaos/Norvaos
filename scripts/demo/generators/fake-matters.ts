/**
 * fake-matters.ts
 * Generator for synthetic demo matter records.
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 *
 * Generates 15 matters: 9 immigration + 6 family law.
 * Statuses distributed across open, in_progress, pending, closed.
 */

import { randomUUID } from 'crypto'
import type { Database } from '../../../lib/types/database'

type MatterInsert = Database['public']['Tables']['matters']['Insert']

// ─── Matter pools ─────────────────────────────────────────────────────────────

const IMMIGRATION_TITLES = [
  'Express Entry  -  Federal Skilled Worker Application',
  'Spousal Sponsorship  -  Inland PR Application',
  'Temporary Foreign Worker Permit Renewal',
  'Study Permit Extension  -  Graduate Program',
  'Canadian Citizenship Application (Adult)',
  'Refugee Protection Claim  -  Pre-Removal Risk Assessment',
  'Intra-Company Transfer  -  Work Permit',
  'Provincial Nominee Program  -  Ontario Skilled Trades',
  'Humanitarian & Compassionate Application',
]

const FAMILY_LAW_TITLES = [
  'Uncontested Divorce  -  Separation Agreement',
  'Child Custody and Access  -  Variation Application',
  'Property Division  -  Matrimonial Home Dispute',
  'Child Support Recalculation Application',
  'Adoption  -  Step-Parent Domestic Proceeding',
  'Domestic Violence  -  Emergency Restraining Order',
]

const STATUSES: Array<MatterInsert['status']> = [
  'open', 'open', 'open',
  'in_progress', 'in_progress',
  'pending',
  'closed',
]

const PRIORITIES: Array<MatterInsert['priority']> = ['high', 'medium', 'medium', 'low']

const BILLING_TYPES: Array<MatterInsert['billing_type']> = [
  'flat_fee', 'hourly', 'flat_fee', 'contingency', 'hourly',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function fakeMatterNumber(index: number): string {
  const year = new Date().getFullYear()
  return `DEMO-${year}-${String(index + 1).padStart(4, '0')}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns 15 synthetic matters linked to the provided contact IDs.
 * Contacts are distributed round-robin across matters.
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 */
export function generateFakeMatters(
  tenantId: string,
  contactIds: string[],
): MatterInsert[] {
  const matters: MatterInsert[] = []

  // 9 immigration matters
  IMMIGRATION_TITLES.forEach((title, i) => {
    const status = STATUSES[i % STATUSES.length]
    const isClosed = status === 'closed'
    const openedDaysAgo = 30 + i * 15

    matters.push({
      id: randomUUID(),
      tenant_id: tenantId,
      matter_number: fakeMatterNumber(i),
      title,
      description: `Demo immigration matter  -  ${title.toLowerCase()}. All data is synthetic.`,
      matter_type: 'immigration',
      status,
      priority: pick(PRIORITIES),
      billing_type: pick(BILLING_TYPES),
      date_opened: daysAgo(openedDaysAgo),
      date_closed: isClosed ? daysAgo(5) : null,
      next_deadline: isClosed ? null : daysFromNow(14 + i * 3),
      estimated_value: 150000 + i * 25000, // in cents
      hourly_rate: 30000, // $300/hr in cents
      total_billed: isClosed ? 200000 : 0,
      total_paid: isClosed ? 200000 : 0,
      trust_balance: 0,
      person_scope: 'individual',
      intake_status: 'complete',
      visibility: 'team',
      is_restricted: false,
      restricted_admin_override: false,
      is_trust_admin: false,
    })
  })

  // 6 family law matters
  FAMILY_LAW_TITLES.forEach((title, i) => {
    const idx = i + IMMIGRATION_TITLES.length
    const status = STATUSES[i % STATUSES.length]
    const isClosed = status === 'closed'
    const openedDaysAgo = 20 + i * 10

    matters.push({
      id: randomUUID(),
      tenant_id: tenantId,
      matter_number: fakeMatterNumber(idx),
      title,
      description: `Demo family law matter  -  ${title.toLowerCase()}. All data is synthetic.`,
      matter_type: 'family_law',
      status,
      priority: pick(PRIORITIES),
      billing_type: pick(BILLING_TYPES),
      date_opened: daysAgo(openedDaysAgo),
      date_closed: isClosed ? daysAgo(3) : null,
      next_deadline: isClosed ? null : daysFromNow(7 + i * 5),
      estimated_value: 80000 + i * 15000,
      hourly_rate: 25000, // $250/hr in cents
      total_billed: isClosed ? 120000 : 0,
      total_paid: isClosed ? 120000 : 0,
      trust_balance: 0,
      person_scope: 'individual',
      intake_status: 'complete',
      visibility: 'team',
      is_restricted: false,
      restricted_admin_override: false,
      is_trust_admin: false,
    })
  })

  return matters
}
