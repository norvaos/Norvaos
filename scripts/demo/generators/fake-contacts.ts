/**
 * fake-contacts.ts
 * Generator for synthetic demo contact records.
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 *
 * Rules enforced:
 *  - Emails: @example.com only
 *  - Phones: 555-xxxx format
 *  - Addresses: fictional Canadian street names
 *  - No real individuals, no real organisations
 */

import { randomUUID } from 'crypto'
import type { Database } from '../../../lib/types/database'

type ContactInsert = Database['public']['Tables']['contacts']['Insert']

// ─── Name pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Alexandra', 'Benjamin', 'Camille', 'Daniel', 'Elena',
  'François', 'Grace', 'Hassan', 'Isabella', 'James',
  'Kiran', 'Lena', 'Marcus', 'Nadia', 'Oliver',
  'Priya', 'Quinn', 'Rafael', 'Sophie', 'Thomas',
]

const LAST_NAMES = [
  'Anderson', 'Bergeron', 'Chen', 'Delacroix', 'Edelstein',
  'Fontaine', 'Greer', 'Hashimi', 'Ivanova', 'Johansson',
  'Kapoor', 'Laurent', 'Moreau', 'Nakamura', 'Okafor',
  'Patel', 'Quinn', 'Rodrigues', 'Singh', 'Tremblay',
]

const COMPANY_NAMES = [
  'Maple Ridge Consulting Ltd.',
  'Northshore Holdings Inc.',
  'Birchwood Ventures Corp.',
  'Lakeview Solutions Inc.',
  'Stonegate Enterprises Ltd.',
]

// ─── Canadian address pools ───────────────────────────────────────────────────

const STREET_NAMES = [
  'Maplewood', 'Lakeview', 'Birchwood', 'Pinecrest', 'Ridgeway',
  'Stonegate', 'Northshore', 'Westmount', 'Cedarhill', 'Riverview',
]

const STREET_TYPES = ['Ave', 'Blvd', 'Dr', 'St', 'Rd', 'Cres', 'Way', 'Ln']

const CITIES: Array<{ city: string; province: string; prefix: string }> = [
  { city: 'Toronto', province: 'ON', prefix: 'M' },
  { city: 'Vancouver', province: 'BC', prefix: 'V' },
  { city: 'Calgary', province: 'AB', prefix: 'T' },
  { city: 'Ottawa', province: 'ON', prefix: 'K' },
  { city: 'Mississauga', province: 'ON', prefix: 'L' },
  { city: 'Edmonton', province: 'AB', prefix: 'T' },
  { city: 'Winnipeg', province: 'MB', prefix: 'R' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function fakePhone(): string {
  const suffix = String(Math.floor(1000 + Math.random() * 9000))
  return `555-${suffix}`
}

function fakePostal(prefix: string): string {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXY'
  const digits = '0123456789'
  const l = (s: string) => s[Math.floor(Math.random() * s.length)]
  return `${prefix}${l(digits)}${l(letters)} ${l(digits)}${l(letters)}${l(digits)}`
}

function fakeStreet(): string {
  const num = Math.floor(100 + Math.random() * 9900)
  return `${num} ${pick(STREET_NAMES)} ${pick(STREET_TYPES)}`
}

function fakeEmailForPerson(first: string, last: string): string {
  const local = `${first.toLowerCase().replace(/[^a-z]/g, '')}.${last.toLowerCase().replace(/[^a-z]/g, '')}`
  return `${local}@example.com`
}

function fakeEmailForCompany(name: string): string {
  const local = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 20)
  return `info@${local}.example.com`
}

// ─── Individual contact generator ────────────────────────────────────────────

function generateIndividual(index: number): ContactInsert {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]
  const last = LAST_NAMES[index % LAST_NAMES.length]
  const location = pick(CITIES)

  return {
    id: randomUUID(),
    contact_type: 'individual',
    first_name: first,
    last_name: last,
    email_primary: fakeEmailForPerson(first, last),
    phone_primary: fakePhone(),
    phone_type_primary: 'mobile',
    address_line1: fakeStreet(),
    city: location.city,
    province_state: location.province,
    postal_code: fakePostal(location.prefix),
    country: 'CA',
    source: 'demo',
    is_active: true,
    is_archived: false,
    email_opt_in: true,
    sms_opt_in: false,
    has_portal_access: false,
    conflict_status: 'clear',
    pipeline_stage: 'active',
    milestone: 'client',
  }
}

// ─── Company contact generator ────────────────────────────────────────────────

function generateCompany(index: number): ContactInsert {
  const name = COMPANY_NAMES[index % COMPANY_NAMES.length]
  const location = pick(CITIES)

  return {
    id: randomUUID(),
    contact_type: 'company',
    organization_name: name,
    email_primary: fakeEmailForCompany(name),
    phone_primary: fakePhone(),
    phone_type_primary: 'work',
    address_line1: fakeStreet(),
    city: location.city,
    province_state: location.province,
    postal_code: fakePostal(location.prefix),
    country: 'CA',
    source: 'demo',
    is_active: true,
    is_archived: false,
    email_opt_in: false,
    sms_opt_in: false,
    has_portal_access: false,
    conflict_status: 'clear',
    pipeline_stage: 'active',
    milestone: 'client',
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns 20 synthetic contacts (15 individuals + 5 companies).
 * All contact IDs are deterministic-random UUIDs generated at call time.
 *
 * ALL DATA IS SYNTHETIC - NOT REAL CLIENT DATA
 */
export function generateFakeContacts(tenantId: string): ContactInsert[] {
  const contacts: ContactInsert[] = []

  // 15 individual contacts
  for (let i = 0; i < 15; i++) {
    contacts.push({ ...generateIndividual(i), tenant_id: tenantId })
  }

  // 5 company contacts
  for (let i = 0; i < 5; i++) {
    contacts.push({ ...generateCompany(i), tenant_id: tenantId })
  }

  return contacts
}
