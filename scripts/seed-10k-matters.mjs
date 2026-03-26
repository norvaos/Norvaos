#!/usr/bin/env node
/**
 * 10k Ghost Matter Seeder
 * Generates 10,000 test matters for stress-testing virtualization and search.
 * Uses the Supabase REST API with service role key (bypasses RLS).
 */

const SUPABASE_URL = 'https://ztsjvsutlrfisnrwdwfl.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TENANT_ID = 'bb15e3c2-cb50-4cc4-8b89-f7f0dd0b6fc1'

const MATTER_TYPES = [
  { id: '39c0add4-5faf-4eb2-b039-af3ab37acabe', name: 'Study Permit' },
  { id: '0b676a6a-e934-4037-acad-5c0d12cae1ee', name: 'Work Permit' },
  { id: 'baeac916-3a00-470b-aca8-c6e088fcb5b2', name: 'Express Entry' },
  { id: 'dd99fa52-3ea7-43a3-ab97-d3b04bec9b7a', name: 'PR Application' },
  { id: 'ea0e35d9-f407-42f8-a1bc-e8878902d063', name: 'Visitor Visa  -  Inside Canada' },
  { id: 'bea9a5e7-2e90-4b52-a80e-21150bde953f', name: 'Visitor Visa  -  Outside Canada' },
  { id: '966db7c5-1d38-4f11-9c46-2f70ac018296', name: 'PGWP' },
  { id: '2ad0bb84-fce3-419d-90d1-fb3cdaa61721', name: 'Spousal Sponsorship  -  Inside' },
  { id: '02da5696-3e19-47aa-92c5-a66243e1e5ed', name: 'Spousal Sponsorship  -  Outside' },
  { id: 'a56520f5-6da7-402d-9fdc-2c1bb4d5e253', name: 'General Matter' },
]

const STATUSES = ['intake', 'active', 'on_hold', 'closed_won', 'closed_lost', 'closed_withdrawn']
const PRIORITIES = ['high', 'medium', 'low', 'urgent']

const FIRST_NAMES = [
  'Ahmed', 'Fatima', 'Wei', 'Priya', 'Carlos', 'Olga', 'Dmitri', 'Yuki',
  'Hassan', 'Mei', 'Ravi', 'Elena', 'Omar', 'Sofia', 'Jin', 'Amara',
  'Tariq', 'Lena', 'Kenji', 'Nadia', 'Sanjay', 'Marta', 'Ali', 'Aiko',
  'Ibrahim', 'Chen', 'Deepa', 'Viktor', 'Layla', 'Hiroshi', 'Zara', 'Pavel',
  'Ananya', 'Marco', 'Hana', 'Sergei', 'Rina', 'Diego', 'Yara', 'Takeshi',
]

const LAST_NAMES = [
  'Khan', 'Zhang', 'Patel', 'Garcia', 'Ivanov', 'Tanaka', 'Al-Rashid', 'Wang',
  'Singh', 'Petrov', 'Yamamoto', 'Lopez', 'Ahmed', 'Li', 'Sharma', 'Kozlov',
  'Sato', 'Martinez', 'Hussain', 'Wu', 'Gupta', 'Sokolov', 'Suzuki', 'Hernandez',
  'Ali', 'Liu', 'Das', 'Volkov', 'Ito', 'Gonzalez', 'Rahman', 'Zhou',
  'Rao', 'Rossi', 'Kim', 'Popov', 'Nakamura', 'Silva', 'Malik', 'Hayashi',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateMatterNumber(i) {
  const year = 2024 + Math.floor(Math.random() * 3) // 2024-2026
  return `NRV-${year}-${String(i).padStart(5, '0')}`
}

function generateMatter(i) {
  const mt = pick(MATTER_TYPES)
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const title = `[GHOST] ${firstName} ${lastName}  -  ${mt.name}`

  return {
    tenant_id: TENANT_ID,
    title,
    matter_number: generateMatterNumber(i),
    matter_type_id: mt.id,
    status: pick(STATUSES),
    priority: pick(PRIORITIES),
  }
}

async function insertBatch(matters, batchNum, totalBatches) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matters`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(matters),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Batch ${batchNum}/${totalBatches} failed: ${res.status} ${text}`)
  }

  process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} inserted (${batchNum * matters.length} rows)`)
}

async function main() {
  if (!SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var')
    process.exit(1)
  }

  const TOTAL = 10_000
  const BATCH_SIZE = 500
  const totalBatches = Math.ceil(TOTAL / BATCH_SIZE)

  console.log(`\n🔧 Seeding ${TOTAL} ghost matters in ${totalBatches} batches of ${BATCH_SIZE}...\n`)

  const start = Date.now()

  for (let b = 0; b < totalBatches; b++) {
    const batch = []
    for (let i = 0; i < BATCH_SIZE && (b * BATCH_SIZE + i) < TOTAL; i++) {
      batch.push(generateMatter(b * BATCH_SIZE + i + 1))
    }
    await insertBatch(batch, b + 1, totalBatches)
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n\n✅ Done! ${TOTAL} ghost matters seeded in ${elapsed}s`)
  console.log(`   To clean up later: DELETE FROM matters WHERE title LIKE '[GHOST]%';`)
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
