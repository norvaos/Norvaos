// ============================================================================
// Folder Engine — Matter Folder Generation from Templates
// ============================================================================
//
// Generates per-matter folder instances from matter_folder_templates when
// a matter is created with a specific matter type. Called by kit-activation
// after document slots are generated.
//
// Public API:
//   generateMatterFolders()   — create folder instances for a matter
//   assignSlotsToFolders()    — assign document slots to their folders
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type FolderTemplateRow = Database['public']['Tables']['matter_folder_templates']['Row']
type MatterFolderInsert = Database['public']['Tables']['matter_folders']['Insert']

export interface GenerateFoldersParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  matterTypeId: string
}

/**
 * Generate folder instances for a matter based on folder templates.
 * Preserves the parent-child hierarchy using a two-pass insertion.
 * Idempotent — skips if folders already exist for the matter.
 */
export async function generateMatterFolders(
  params: GenerateFoldersParams
): Promise<void> {
  const { supabase, tenantId, matterId, matterTypeId } = params

  // 1. Check if folders already exist for this matter (idempotent)
  const { data: existing } = await supabase
    .from('matter_folders')
    .select('id')
    .eq('matter_id', matterId)
    .limit(1)

  if (existing && existing.length > 0) return

  // 2. Fetch active folder templates for this matter type
  const { data: templates, error: templateErr } = await supabase
    .from('matter_folder_templates')
    .select('*')
    .eq('matter_type_id', matterTypeId)
    .eq('is_active', true)
    .order('sort_order')

  if (templateErr || !templates || templates.length === 0) return

  // 3. Separate root templates (no parent) from child templates
  const rootTemplates = templates.filter((t) => t.parent_id === null)
  const childTemplates = templates.filter((t) => t.parent_id !== null)

  // 4. Map template ID → generated folder ID (for parent references)
  const templateToFolderId = new Map<string, string>()

  // 5. Insert root folders first
  for (const template of rootTemplates) {
    const insert: MatterFolderInsert = {
      tenant_id: tenantId,
      matter_id: matterId,
      template_id: template.id,
      parent_id: null,
      name: template.name,
      slug: template.slug,
      sort_order: template.sort_order,
    }

    const { data: folder } = await supabase
      .from('matter_folders')
      .upsert(insert, { onConflict: 'matter_id,slug', ignoreDuplicates: true })
      .select('id')
      .single()

    if (folder) {
      templateToFolderId.set(template.id, folder.id)
    }
  }

  // 6. Insert child folders (can nest further if needed)
  // Sort children so that parents are processed before deeper children
  const sortedChildren = sortChildrenByDepth(childTemplates, templates)

  for (const template of sortedChildren) {
    const parentFolderId = templateToFolderId.get(template.parent_id!)

    if (!parentFolderId) {
      console.warn(
        `[folder-engine] Parent folder not found for template "${template.name}" (parent_id: ${template.parent_id})`
      )
      continue
    }

    const insert: MatterFolderInsert = {
      tenant_id: tenantId,
      matter_id: matterId,
      template_id: template.id,
      parent_id: parentFolderId,
      name: template.name,
      slug: template.slug,
      sort_order: template.sort_order,
    }

    const { data: folder } = await supabase
      .from('matter_folders')
      .upsert(insert, { onConflict: 'matter_id,slug', ignoreDuplicates: true })
      .select('id')
      .single()

    if (folder) {
      templateToFolderId.set(template.id, folder.id)
    }
  }
}

/**
 * Sort child templates so parents appear before children for insertion order.
 * Handles multi-level nesting (e.g., grandchild folders).
 */
function sortChildrenByDepth(
  children: FolderTemplateRow[],
  allTemplates: FolderTemplateRow[]
): FolderTemplateRow[] {
  const parentIds = new Set(allTemplates.filter((t) => !t.parent_id).map((t) => t.id))
  const sorted: FolderTemplateRow[] = []
  const remaining = [...children]

  // Iteratively pick children whose parent is already resolved
  let maxIter = remaining.length + 1
  while (remaining.length > 0 && maxIter-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (parentIds.has(remaining[i].parent_id!)) {
        const [child] = remaining.splice(i, 1)
        sorted.push(child)
        parentIds.add(child.id)
      }
    }
  }

  // Any remaining (orphans) — push anyway
  sorted.push(...remaining)
  return sorted
}

/**
 * Assign existing document slots to their corresponding folders.
 * Called after folder generation AND slot generation.
 *
 * Matching logic:
 *  1. If slot's template has folder_template_id → find folder by template_id
 *  2. Else if any folder template has auto_assign_category matching slot's category → assign
 */
export async function assignSlotsToFolders(
  params: GenerateFoldersParams
): Promise<void> {
  const { supabase, tenantId, matterId, matterTypeId } = params

  // 1. Fetch matter folders with their template info
  const { data: folders } = await supabase
    .from('matter_folders')
    .select('id, template_id')
    .eq('matter_id', matterId)
    .eq('is_active', true)

  if (!folders || folders.length === 0) return

  // 2. Fetch folder templates to get auto_assign_category mappings
  const { data: folderTemplates } = await supabase
    .from('matter_folder_templates')
    .select('id, auto_assign_category')
    .eq('matter_type_id', matterTypeId)
    .eq('is_active', true)

  if (!folderTemplates) return

  // Build maps
  const templateIdToFolderId = new Map<string, string>()
  for (const f of folders) {
    if (f.template_id) {
      templateIdToFolderId.set(f.template_id, f.id)
    }
  }

  const categoryToFolderId = new Map<string, string>()
  for (const ft of folderTemplates) {
    if (ft.auto_assign_category) {
      const folderId = templateIdToFolderId.get(ft.id)
      if (folderId) {
        categoryToFolderId.set(ft.auto_assign_category, folderId)
      }
    }
  }

  // 3. Fetch unassigned slots
  const { data: slots } = await supabase
    .from('document_slots')
    .select('id, category, slot_template_id')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .is('folder_id', null)

  if (!slots || slots.length === 0) return

  // 4. Fetch slot templates to check for folder_template_id
  const slotTemplateIds = [...new Set(slots.filter((s) => s.slot_template_id).map((s) => s.slot_template_id!))]

  let slotTemplateToFolderTemplate = new Map<string, string>()
  if (slotTemplateIds.length > 0) {
    const { data: slotTemplates } = await supabase
      .from('document_slot_templates')
      .select('id, folder_template_id')
      .in('id', slotTemplateIds)

    if (slotTemplates) {
      for (const st of slotTemplates) {
        if (st.folder_template_id) {
          slotTemplateToFolderTemplate.set(st.id, st.folder_template_id)
        }
      }
    }
  }

  // 5. Assign folders to slots
  for (const slot of slots) {
    let folderId: string | null = null

    // Priority 1: Explicit folder_template_id on the slot template
    if (slot.slot_template_id) {
      const folderTemplateId = slotTemplateToFolderTemplate.get(slot.slot_template_id)
      if (folderTemplateId) {
        folderId = templateIdToFolderId.get(folderTemplateId) ?? null
      }
    }

    // Priority 2: Category-based auto-assignment
    if (!folderId && slot.category) {
      folderId = categoryToFolderId.get(slot.category) ?? null
    }

    if (folderId) {
      await supabase
        .from('document_slots')
        .update({ folder_id: folderId })
        .eq('id', slot.id)
    }
  }
}
