/**
 * Seed script: populate tenant_document_library from hardcoded presets.
 *
 * Run ONCE after migration 086:
 *   npx tsx scripts/seed-tenant-document-library.ts
 *
 * What it does:
 *   1. Deduplicates all preset entries across all bundles by slot_slug
 *   2. Inserts them into tenant_document_library for every tenant
 *   3. Backfills library_slot_id on existing document_slot_templates rows
 *      that match by slug + tenant (links legacy seeded templates to library)
 *   4. Safe to re-run — uses ON CONFLICT DO NOTHING for inserts
 */

import { createClient } from '@supabase/supabase-js'
import { DOCUMENT_PRESETS } from '../lib/utils/document-slot-presets'
import type { Database } from '../lib/types/database'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

async function main() {
  console.log('Seeding tenant_document_library...\n')

  // 1. Fetch all tenants
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name')
  if (tenantsError) throw tenantsError
  console.log(`Found ${tenants.length} tenant(s)`)

  // 2. Build deduplicated library from all presets.
  //    Same slot_slug appearing in multiple bundles → one entry with merged tags.
  const libraryMap = new Map<
    string,
    {
      slot_name: string
      slot_slug: string
      description: string
      description_fr: string
      category: string
      person_role_scope: string | null
      is_required: boolean
      accepted_file_types: string[]
      tags: string[]
      jurisdiction_code: string
    }
  >()

  for (const preset of DOCUMENT_PRESETS) {
    for (const slot of preset.presets) {
      const slug = toSlug(slot.slot_name)
      if (libraryMap.has(slug)) {
        // Merge tags — slot appears in multiple bundles
        const existing = libraryMap.get(slug)!
        if (!existing.tags.includes(preset.id)) {
          existing.tags.push(preset.id)
        }
      } else {
        libraryMap.set(slug, {
          slot_name: slot.slot_name,
          slot_slug: slug,
          description: slot.description,
          description_fr: slot.description_fr,
          category: slot.category,
          person_role_scope: slot.person_role_scope,
          is_required: slot.is_required,
          accepted_file_types: slot.accepted_file_types,
          tags: [preset.id],
          jurisdiction_code: 'CA',
        })
      }
    }
  }

  const libraryEntries = Array.from(libraryMap.values())
  console.log(`Deduplicated library: ${libraryEntries.length} unique entries (from ${
    DOCUMENT_PRESETS.reduce((sum, p) => sum + p.presets.length, 0)
  } total preset slots)\n`)

  // 3. Insert into each tenant's library
  for (const tenant of tenants) {
    console.log(`Processing tenant: ${tenant.name} (${tenant.id})`)

    const inserts = libraryEntries.map((entry, i) => ({
      ...entry,
      tenant_id: tenant.id,
      sort_order: i,
    }))

    // Insert in batches of 50 to avoid payload limits
    let inserted = 0
    for (let i = 0; i < inserts.length; i += 50) {
      const batch = inserts.slice(i, i + 50)
      const { error } = await supabase
        .from('tenant_document_library')
        .upsert(batch, { onConflict: 'tenant_id,slot_slug', ignoreDuplicates: true })
      if (error) {
        console.error(`  Batch error at index ${i}:`, error.message)
      } else {
        inserted += batch.length
      }
    }
    console.log(`  Inserted/skipped ${inserted} library entries`)

    // 4. Backfill library_slot_id on existing document_slot_templates
    //    Matches by tenant_id + slot_slug
    const { data: libraryRows } = await supabase
      .from('tenant_document_library')
      .select('id, slot_slug')
      .eq('tenant_id', tenant.id)

    if (libraryRows && libraryRows.length > 0) {
      const slugToLibraryId = new Map(libraryRows.map((r) => [r.slot_slug, r.id]))

      // Fetch existing templates for this tenant that have no library_slot_id yet
      const { data: templates } = await supabase
        .from('document_slot_templates')
        .select('id, slot_slug')
        .eq('tenant_id', tenant.id)
        .is('library_slot_id', null)

      let backfilled = 0
      for (const tmpl of templates ?? []) {
        const libraryId = slugToLibraryId.get(tmpl.slot_slug)
        if (libraryId) {
          await supabase
            .from('document_slot_templates')
            .update({ library_slot_id: libraryId })
            .eq('id', tmpl.id)
          backfilled++
        }
      }
      console.log(`  Backfilled library_slot_id on ${backfilled} existing template(s)`)
    }
  }

  console.log('\nDone. tenant_document_library is seeded.')
  console.log('You can now safely remove DOCUMENT_PRESETS usage from the UI.')
  console.log('The file lib/utils/document-slot-presets.ts can be deleted once this seed has run.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
