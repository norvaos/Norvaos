import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { graphFetch, GraphError } from '@/lib/services/microsoft-graph'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OneDriveItem {
  id: string
  name: string
  size: number | null
  mimeType: string | null
  webUrl: string
  isFolder: boolean
  lastModifiedDateTime: string
  createdBy: { displayName: string } | null
}

interface MsDriveItem {
  id: string
  name: string
  size?: number
  webUrl: string
  lastModifiedDateTime: string
  createdBy?: { user?: { displayName?: string } }
  folder?: { childCount: number }
  file?: { mimeType?: string }
}

// ─── Browse OneDrive ─────────────────────────────────────────────────────────

export async function browseOneDrive(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  path?: string
): Promise<OneDriveItem[]> {
  const endpoint = path
    ? `me/drive/root:/${encodeURIComponent(path)}:/children`
    : 'me/drive/root/children'

  const response = await graphFetch<{ value: MsDriveItem[] }>(
    connectionId,
    adminClient,
    endpoint,
    {
      params: {
        $select: 'id,name,size,webUrl,lastModifiedDateTime,createdBy,folder,file',
        $orderby: 'name asc',
        $top: '100',
      },
    }
  )

  return response.value.map((item) => ({
    id: item.id,
    name: item.name,
    size: item.size ?? null,
    mimeType: item.file?.mimeType ?? null,
    webUrl: item.webUrl,
    isFolder: !!item.folder,
    lastModifiedDateTime: item.lastModifiedDateTime,
    createdBy: item.createdBy?.user?.displayName
      ? { displayName: item.createdBy.user.displayName }
      : null,
  }))
}

// ─── Link OneDrive File ──────────────────────────────────────────────────────

export async function linkOneDriveFile(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    tenantId: string
    userId: string
    oneDriveItemId: string
    matterId?: string
    contactId?: string
    category?: string
  }
) {
  // Fetch full item metadata from Graph
  const item = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    `me/drive/items/${params.oneDriveItemId}`,
    { params: { $select: 'id,name,size,webUrl,file,lastModifiedDateTime' } }
  )

  // Insert into documents table
  const { data, error } = await adminClient
    .from('documents')
    .insert({
      tenant_id: params.tenantId,
      uploaded_by: params.userId,
      file_name: item.name,
      file_type: item.file?.mimeType || null,
      file_size: item.size || null,
      storage_path: '', // No local storage — linked by reference
      external_id: item.id,
      external_provider: 'microsoft_onedrive',
      onedrive_item_id: item.id,
      onedrive_web_url: item.webUrl,
      matter_id: params.matterId || null,
      contact_id: params.contactId || null,
      category: params.category || 'general',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Upload to OneDrive ──────────────────────────────────────────────────────

export async function uploadToOneDrive(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    file: Buffer
    fileName: string
    folderPath?: string
  }
): Promise<{ oneDriveItemId: string; webUrl: string }> {
  const path = params.folderPath
    ? `me/drive/root:/${params.folderPath}/${params.fileName}:/content`
    : `me/drive/root:/${params.fileName}:/content`

  // For files under 4MB, use simple upload
  // For larger files, resumable upload would be needed (future enhancement)
  const { getValidAccessToken } = await import('@/lib/services/microsoft-graph')
  const accessToken = await getValidAccessToken(connectionId, adminClient)

  const res = await fetch(`https://graph.microsoft.com/v1.0/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(params.file),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`OneDrive upload failed: ${err.error?.message || res.statusText}`)
  }

  const item = (await res.json()) as MsDriveItem
  return {
    oneDriveItemId: item.id,
    webUrl: item.webUrl,
  }
}

// ─── NorvaOS Root Folder ──────────────────────────────────────────────────────

/**
 * Ensures the "NorvaOS" root folder exists in the user's OneDrive.
 * Creates it if missing and caches the folder ID on the connection row.
 */
export async function ensureNorvaOSRootFolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<string> {
  console.log('[onedrive] ensureNorvaOSRootFolder called for connection:', connectionId)

  // 1. Check cached folder ID
  const { data: conn, error: connError } = await adminClient
    .from('microsoft_connections')
    .select('onedrive_root_folder_id')
    .eq('id', connectionId)
    .single()

  if (connError) {
    console.error('[onedrive] Failed to fetch connection:', connError)
    throw new Error(`Failed to fetch connection: ${connError.message}`)
  }

  if (conn?.onedrive_root_folder_id) {
    console.log('[onedrive] Using cached root folder ID:', conn.onedrive_root_folder_id)
    return conn.onedrive_root_folder_id
  }

  // 2. Try to find existing "NorvaOS" folder in root
  try {
    console.log('[onedrive] Looking for existing NorvaOS folder...')
    const existing = await graphFetch<MsDriveItem>(
      connectionId,
      adminClient,
      'me/drive/root:/NorvaOS',
      { params: { $select: 'id,name,webUrl' } }
    )
    console.log('[onedrive] Found existing NorvaOS folder:', existing.id)
    await adminClient
      .from('microsoft_connections')
      .update({ onedrive_root_folder_id: existing.id })
      .eq('id', connectionId)
    return existing.id
  } catch (err) {
    // 404 means folder doesn't exist — proceed to create
    if (err instanceof GraphError && err.status === 404) {
      console.log('[onedrive] NorvaOS folder not found (404), will create it')
    } else {
      console.error('[onedrive] Unexpected error looking up NorvaOS folder:', err)
      throw err
    }
  }

  // 3. Create the folder
  console.log('[onedrive] Creating NorvaOS folder in OneDrive root...')
  const created = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    'me/drive/root/children',
    {
      method: 'POST',
      body: {
        name: 'NorvaOS',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    }
  )
  console.log('[onedrive] NorvaOS folder created with ID:', created.id)

  // 4. Cache the folder ID
  await adminClient
    .from('microsoft_connections')
    .update({ onedrive_root_folder_id: created.id })
    .eq('id', connectionId)

  return created.id
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/**
 * Sanitize a string for use as an OneDrive folder name.
 * OneDrive forbids: " * : < > ? / \ |
 */
function sanitizeFolderName(name: string): string {
  return name.replace(/["*:<>?/\\|]/g, '_').trim() || 'Unnamed'
}

function buildMatterFolderName(matterNumber: string | null, title: string): string {
  if (matterNumber) {
    return sanitizeFolderName(`${matterNumber} - ${title}`)
  }
  return sanitizeFolderName(title)
}

/**
 * Ensures a category folder exists under NorvaOS (e.g. NorvaOS/Contacts/).
 * Returns the Graph folder ID.
 */
async function ensureCategoryFolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  categoryName: string
): Promise<string> {
  // 1. Ensure root exists
  const rootFolderId = await ensureNorvaOSRootFolder(connectionId, adminClient)

  // 2. Try to find existing category folder
  try {
    const existing = await graphFetch<MsDriveItem>(
      connectionId,
      adminClient,
      `me/drive/root:/NorvaOS/${encodeURIComponent(categoryName)}`,
      { params: { $select: 'id,name' } }
    )
    return existing.id
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 404)) throw err
  }

  // 3. Create the category folder
  const created = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    `me/drive/items/${rootFolderId}/children`,
    {
      method: 'POST',
      body: {
        name: categoryName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    }
  )

  return created.id
}

/**
 * Generic helper: ensures a named subfolder exists inside a category folder.
 * e.g. NorvaOS/Contacts/Waseer Zia/
 * Returns { folderId, folderPath }.
 */
async function ensureEntitySubfolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  categoryName: string,
  entityFolderName: string
): Promise<{ folderId: string; folderPath: string }> {
  const safeName = sanitizeFolderName(entityFolderName)
  const folderPath = `NorvaOS/${categoryName}/${safeName}`

  // 1. Try to find existing folder
  try {
    const existing = await graphFetch<MsDriveItem>(
      connectionId,
      adminClient,
      `me/drive/root:/${encodeURIComponent(folderPath)}`,
      { params: { $select: 'id,name' } }
    )
    return { folderId: existing.id, folderPath }
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 404)) throw err
  }

  // 2. Ensure category folder exists (e.g. NorvaOS/Contacts/)
  const categoryFolderId = await ensureCategoryFolder(connectionId, adminClient, categoryName)

  // 3. Create the entity subfolder
  const created = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    `me/drive/items/${categoryFolderId}/children`,
    {
      method: 'POST',
      body: {
        name: safeName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    }
  )

  return { folderId: created.id, folderPath }
}

// ─── Matter Subfolder ─────────────────────────────────────────────────────────

/**
 * Ensures a matter-specific subfolder exists under NorvaOS/Matters/ in OneDrive.
 * Structure: NorvaOS/Matters/{MatterNumber} - {MatterTitle}/
 * Caches the subfolder ID on the matter row.
 */
export async function ensureMatterSubfolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    matterId: string
    matterNumber: string | null
    matterTitle: string
  }
): Promise<{ folderId: string; folderPath: string }> {
  const folderName = buildMatterFolderName(params.matterNumber, params.matterTitle)

  // 1. Check cached folder ID on matter
  const { data: matter } = await adminClient
    .from('matters')
    .select('onedrive_folder_id')
    .eq('id', params.matterId)
    .single()

  if (matter?.onedrive_folder_id) {
    return { folderId: matter.onedrive_folder_id, folderPath: `NorvaOS/Matters/${folderName}` }
  }

  // 2. Create under NorvaOS/Matters/{folderName}
  const result = await ensureEntitySubfolder(connectionId, adminClient, 'Matters', folderName)

  // 3. Cache on the matter
  await adminClient
    .from('matters')
    .update({ onedrive_folder_id: result.folderId })
    .eq('id', params.matterId)

  return result
}

// ─── Contact Subfolder ────────────────────────────────────────────────────────

/**
 * Ensures a contact-specific subfolder exists under NorvaOS/Contacts/ in OneDrive.
 * Structure: NorvaOS/Contacts/{First Last}/
 */
export async function ensureContactSubfolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    contactId: string
    contactName: string
  }
): Promise<{ folderId: string; folderPath: string }> {
  return ensureEntitySubfolder(connectionId, adminClient, 'Contacts', params.contactName)
}

// ─── Lead Subfolder ───────────────────────────────────────────────────────────

/**
 * Ensures a lead-specific subfolder exists under NorvaOS/Leads/ in OneDrive.
 * Structure: NorvaOS/Leads/{Lead Name}/
 */
export async function ensureLeadSubfolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    leadId: string
    leadName: string
  }
): Promise<{ folderId: string; folderPath: string }> {
  return ensureEntitySubfolder(connectionId, adminClient, 'Leads', params.leadName)
}

// ─── Task Subfolder ───────────────────────────────────────────────────────────

/**
 * Ensures a task-specific subfolder exists under NorvaOS/Tasks/ in OneDrive.
 * Structure: NorvaOS/Tasks/{Task Title}/
 */
export async function ensureTaskSubfolder(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    taskId: string
    taskTitle: string
  }
): Promise<{ folderId: string; folderPath: string }> {
  return ensureEntitySubfolder(connectionId, adminClient, 'Tasks', params.taskTitle)
}

// ─── OneDrive Subfolder Structure Sync ──────────────────────────────────────

/**
 * Creates a subfolder inside a known parent folder by its Graph API ID.
 * Idempotent: checks for existing child folder with the same name first.
 * Returns the OneDrive folder ID of the (existing or created) subfolder.
 */
async function createSubfolderByParentId(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const safeName = sanitizeFolderName(folderName)

  // Try to find existing folder by listing children and filtering by name
  try {
    const response = await graphFetch<{ value: MsDriveItem[] }>(
      connectionId,
      adminClient,
      `me/drive/items/${parentFolderId}/children`,
      {
        params: {
          $filter: `name eq '${safeName.replace(/'/g, "''")}'`,
          $select: 'id,name',
          $top: '1',
        },
      }
    )
    if (response.value && response.value.length > 0) {
      return response.value[0].id
    }
  } catch (err) {
    // If $filter is not supported (personal OneDrive), fall through to create
    if (!(err instanceof GraphError && (err.status === 400 || err.status === 501))) throw err
  }

  // Create the subfolder
  const created = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    `me/drive/items/${parentFolderId}/children`,
    {
      method: 'POST',
      body: {
        name: safeName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    }
  )

  return created.id
}

/**
 * Creates OneDrive subfolders matching the matter_folders hierarchy.
 * Called after generateMatterFolders() has populated the DB rows.
 * Each created folder's OneDrive ID is cached on matter_folders.onedrive_folder_id.
 *
 * Structure example:
 *   NorvaOS/Matters/MAT-001 - Smith/
 *   ├── Account/
 *   ├── Client Information/
 *   │   ├── Principal Applicant/
 *   │   ├── Relationship/
 *   │   └── Sponsor/
 *   └── IRCC Forms/
 */
export async function syncMatterFoldersToOneDrive(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    matterId: string
    matterOneDriveFolderId: string
  }
): Promise<void> {
  // 1. Fetch all active matter_folders for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: folders } = await (adminClient as any)
    .from('matter_folders')
    .select('id, parent_id, name, slug, sort_order, onedrive_folder_id')
    .eq('matter_id', params.matterId)
    .eq('is_active', true)
    .order('sort_order')

  if (!folders || folders.length === 0) return

  // 2. Separate roots and children, sort children by depth (parents before children)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootFolders = folders.filter((f: any) => f.parent_id === null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childFolders = folders.filter((f: any) => f.parent_id !== null)

  // Sort children: iteratively pick children whose parent is already resolved
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolved = new Set(rootFolders.map((f: any) => f.id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedChildren: any[] = []
  const remaining = [...childFolders]
  let maxIter = remaining.length + 1
  while (remaining.length > 0 && maxIter-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (resolved.has(remaining[i].parent_id)) {
        const [child] = remaining.splice(i, 1)
        sortedChildren.push(child)
        resolved.add(child.id)
      }
    }
  }
  // Push any orphans at the end
  sortedChildren.push(...remaining)

  const orderedFolders = [...rootFolders, ...sortedChildren]

  // 3. Create each folder in OneDrive, tracking DB → OneDrive ID mapping
  const dbToOneDrive = new Map<string, string>()

  for (const folder of orderedFolders) {
    // Skip if already synced to OneDrive
    if (folder.onedrive_folder_id) {
      dbToOneDrive.set(folder.id, folder.onedrive_folder_id)
      continue
    }

    // Determine the OneDrive parent: root folders go under the matter folder,
    // child folders go under their parent's OneDrive folder
    const parentOneDriveId = folder.parent_id
      ? dbToOneDrive.get(folder.parent_id)
      : params.matterOneDriveFolderId

    if (!parentOneDriveId) {
      console.warn(`[onedrive-sync] No OneDrive parent for folder "${folder.name}" (parent_id: ${folder.parent_id})`)
      continue
    }

    try {
      // Create the subfolder in OneDrive
      const oneDriveFolderId = await createSubfolderByParentId(
        connectionId,
        adminClient,
        parentOneDriveId,
        folder.name
      )

      // Cache the OneDrive ID on the DB row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from('matter_folders')
        .update({ onedrive_folder_id: oneDriveFolderId })
        .eq('id', folder.id)

      dbToOneDrive.set(folder.id, oneDriveFolderId)
    } catch (err) {
      console.warn(`[onedrive-sync] Failed to create OneDrive subfolder "${folder.name}":`, err)
      // Continue with other folders — partial sync is better than none
    }
  }
}

/**
 * Moves an existing OneDrive item to a different folder.
 * Optionally renames the item during the move.
 */
export async function moveOneDriveItem(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  itemId: string,
  targetFolderId: string,
  newFileName?: string
): Promise<{ id: string; webUrl: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    parentReference: { id: targetFolderId },
  }
  if (newFileName) {
    body.name = newFileName
  }

  const result = await graphFetch<MsDriveItem>(
    connectionId,
    adminClient,
    `me/drive/items/${itemId}`,
    {
      method: 'PATCH',
      body,
    }
  )

  return { id: result.id, webUrl: result.webUrl }
}

/**
 * Migrates lead documents to OneDrive subfolders during conversion.
 *
 * For each document linked to the matter:
 *   - Already in OneDrive → moved to correct subfolder
 *   - In Supabase Storage → downloaded + uploaded to correct OneDrive subfolder
 *
 * Subfolder selection is by document category → folder template auto_assign_category.
 * Documents without a match go to the root matter folder.
 *
 * Per-document failures are non-fatal.
 */
export async function migrateLeadDocumentsToOneDrive(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  params: {
    matterId: string
    leadId: string
    matterOneDriveFolderId: string
    matterNumber: string | null
  }
): Promise<void> {
  // 1. Fetch all documents linked to the matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: documents } = await (adminClient as any)
    .from('documents')
    .select('id, file_name, file_type, file_size, storage_path, storage_bucket, category, onedrive_item_id, onedrive_web_url, external_provider')
    .eq('matter_id', params.matterId)
    .order('created_at')

  if (!documents || documents.length === 0) return

  // 2. Build category → OneDrive folder ID mapping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: folders } = await (adminClient as any)
    .from('matter_folders')
    .select('id, template_id, onedrive_folder_id')
    .eq('matter_id', params.matterId)
    .eq('is_active', true)
    .not('onedrive_folder_id', 'is', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: folderTemplates } = await (adminClient as any)
    .from('matter_folder_templates')
    .select('id, auto_assign_category')

  const categoryToOneDriveFolderId = new Map<string, string>()
  if (folders && folderTemplates) {
    const templateCategoryMap = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ft of folderTemplates as any[]) {
      if (ft.auto_assign_category) {
        templateCategoryMap.set(ft.id, ft.auto_assign_category)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const folder of folders as any[]) {
      if (folder.template_id && folder.onedrive_folder_id) {
        const category = templateCategoryMap.get(folder.template_id)
        if (category) {
          categoryToOneDriveFolderId.set(category, folder.onedrive_folder_id)
        }
      }
    }
  }

  // 3. Process each document
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of documents as any[]) {
    try {
      // Determine target subfolder (by category match or root matter folder)
      const targetFolderId = (doc.category && categoryToOneDriveFolderId.get(doc.category))
        || params.matterOneDriveFolderId

      if (doc.onedrive_item_id && doc.external_provider === 'microsoft_onedrive') {
        // ── Document already in OneDrive → move to correct subfolder ──
        const { id, webUrl } = await moveOneDriveItem(
          connectionId, adminClient, doc.onedrive_item_id, targetFolderId
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (adminClient as any)
          .from('documents')
          .update({ onedrive_item_id: id, onedrive_web_url: webUrl })
          .eq('id', doc.id)

      } else if (doc.storage_path) {
        // ── Document in Supabase Storage → download + upload to OneDrive ──
        const bucket = doc.storage_bucket || 'documents'
        const { data: fileData, error: dlError } = await adminClient
          .storage
          .from(bucket)
          .download(doc.storage_path)

        if (dlError || !fileData) {
          console.warn(`[doc-migration] Failed to download "${doc.file_name}": ${dlError?.message}`)
          continue
        }

        const buffer = Buffer.from(await fileData.arrayBuffer())

        // Skip files larger than 4MB (simple upload limit)
        if (buffer.length > 4 * 1024 * 1024) {
          console.warn(`[doc-migration] Skipping "${doc.file_name}" — exceeds 4MB simple upload limit (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`)
          continue
        }

        // Build a clean filename: {MatterNumber}_{original_name}
        const matterPrefix = params.matterNumber ? `${params.matterNumber}_` : ''
        const cleanName = `${matterPrefix}${doc.file_name}`

        // Upload to the target subfolder using Graph API folder-ID-based path
        const { getValidAccessToken } = await import('@/lib/services/microsoft-graph')
        const accessToken = await getValidAccessToken(connectionId, adminClient)
        const encodedName = encodeURIComponent(cleanName)

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/drive/items/${targetFolderId}:/${encodedName}:/content`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: new Uint8Array(buffer),
          }
        )

        if (res.ok) {
          const item = (await res.json()) as MsDriveItem
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (adminClient as any)
            .from('documents')
            .update({
              onedrive_item_id: item.id,
              onedrive_web_url: item.webUrl,
              external_id: item.id,
              external_provider: 'microsoft_onedrive',
            })
            .eq('id', doc.id)
        } else {
          const err = await res.json().catch(() => ({}))
          console.warn(`[doc-migration] OneDrive upload failed for "${doc.file_name}": ${err?.error?.message || res.statusText}`)
        }
      }
    } catch (err) {
      // Per-document failure is non-fatal
      console.warn(`[doc-migration] Failed to migrate "${doc.file_name}":`, err)
    }
  }
}
