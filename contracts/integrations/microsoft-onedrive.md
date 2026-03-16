# Integration Contract: Microsoft OneDrive

**Integration ID:** `microsoft-onedrive`
**Module:** Team 3 / Module 1
**Status:** Draft — Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `lib/services/microsoft-onedrive.ts`
- `lib/services/microsoft-graph.ts`
- `app/api/integrations/microsoft/onedrive/` (directory exists; route files not individually audited)

---

## 1. Integration Purpose and Scope

The Microsoft OneDrive integration allows NorvaOS to browse, link, and upload files to a connected user's OneDrive account using the Microsoft Graph API. It creates and maintains a structured folder hierarchy under a `NorvaOS/` root folder in the user's personal or organisational OneDrive.

**Core operations:**
1. **Browse** — List contents of a OneDrive folder path
2. **Link** — Register an existing OneDrive item as a NorvaOS document record (by reference, no copy)
3. **Upload** — Upload a file buffer to a specific OneDrive path or folder (simple PUT, max 4 MB)
4. **Folder management** — Idempotent creation of `NorvaOS/`, `NorvaOS/Matters/`, `NorvaOS/Contacts/`, `NorvaOS/Leads/`, `NorvaOS/Tasks/` hierarchy
5. **Matter folder sync** — Mirror `matter_folders` database rows into OneDrive subfolders; cache OneDrive folder IDs
6. **Document migration** — During lead-to-matter conversion, move OneDrive-linked documents and upload Supabase-stored documents to the correct matter subfolder

All OneDrive operations share the same OAuth connection and token infrastructure as the Microsoft 365 Email integration (`microsoft_connections` table, `getValidAccessToken()`, `graphFetch()`).

---

## 2. Credential Handling

OneDrive uses the exact same credential mechanism as the Microsoft 365 Email integration. See [microsoft-365-email.md § 2](microsoft-365-email.md) for full detail.

**Relevant scopes for OneDrive:** `Files.ReadWrite.All` (included in `MICROSOFT_SCOPES` array).

**Connection lookup:** All OneDrive functions receive a `connectionId` (a `microsoft_connections.id` UUID) and call `getValidAccessToken(connectionId, adminClient)`. This handles expiry checking and automatic refresh.

**Folder ID caching:**
- `microsoft_connections.onedrive_root_folder_id` — cached Graph item ID for the `NorvaOS/` root folder
- `matters.onedrive_folder_id` — cached Graph item ID for the matter's OneDrive subfolder
- `matter_folders.onedrive_folder_id` — cached Graph item ID per folder template row

These caches prevent repeated Graph API lookups on every operation.

---

## 3. Retry Behaviour

### Folder Existence Checks

`ensureNorvaOSRootFolder()`, `ensureCategoryFolder()`, `ensureEntitySubfolder()`, and `createSubfolderByParentId()` all follow the same pattern:
1. Attempt to GET the folder via Graph API
2. On 404: proceed to create the folder
3. On any other error: rethrow

This is idempotent but not retried. If the GET or POST fails for a non-404 reason, the error propagates to the caller.

### File Upload (`uploadToOneDrive`)

Uses a direct `fetch()` PUT call (not `graphFetch()`). There is no retry logic. If the PUT fails, an error is thrown immediately.

**IDENTIFIED GAP — No upload retry:** Upload failures are terminal. There is no retry, backoff, or partial-upload recovery mechanism. For flaky network conditions or brief Graph API errors, uploads will fail silently with a `console.warn` in `migrateLeadDocumentsToOneDrive()`.

### Move Operation (`moveOneDriveItem`)

Uses `graphFetch()` with `method: 'PATCH'`. Inherits the 429 rate-limit handling from `graphFetch()` (recursive retry, unbounded — see Microsoft 365 Email contract for this shared gap).

### Document Migration (`migrateLeadDocumentsToOneDrive`)

Per-document failures are explicitly caught and logged with `console.warn`. The migration continues for remaining documents. Partial migration is considered better than none.

---

## 4. Idempotency Guarantees

### Folder Creation

Folder creation is idempotent by design:
- `ensureNorvaOSRootFolder()` checks `microsoft_connections.onedrive_root_folder_id` cache first; if populated, returns immediately
- If cache miss: tries to GET `me/drive/root:/NorvaOS`; if 404, creates it; uses `@microsoft.graph.conflictBehavior: 'rename'` on POST
- `ensureCategoryFolder()` and `ensureEntitySubfolder()` follow the same try-GET-then-POST pattern
- `createSubfolderByParentId()` lists children filtered by name before creating (falls back to create if `$filter` unsupported on personal OneDrive)

**Note on `conflictBehavior: 'rename'`:** If a folder with the same name exists due to a race condition or cache miss, OneDrive will rename the newly created folder (e.g., `NorvaOS 1`) rather than error. The returned folder ID is cached, so subsequent calls will use the correct folder. However, this can result in multiple `NorvaOS` folders if called concurrently — no mutex or distributed lock is in place.

### File Upload

**IDENTIFIED GAP — Upload is not idempotent:** `uploadToOneDrive()` uses `me/drive/root:/{path}:/content` with `PUT`. If called twice with the same filename and path, OneDrive will overwrite the first file (or create a conflict-renamed version depending on OneDrive configuration). There is no deduplication check before upload.

### Link Operation

`linkOneDriveFile()` inserts into the `documents` table without checking for an existing record with the same `external_id` / `onedrive_item_id`. Calling it twice with the same OneDrive item ID will create a duplicate document row.

**IDENTIFIED GAP — No upsert on link:** `linkOneDriveFile()` uses `insert()` not `upsert()`. Duplicate document rows can be created if the user links the same OneDrive file twice.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | Behaviour |
|---|---|
| Connection not found or inactive | `getValidAccessToken()` throws; operation fails |
| Token refresh failure | `refreshAccessToken()` throws; operation fails |
| Graph 404 on folder lookup | Treated as "not found" — folder creation proceeds |
| Graph 404 on item lookup (not folder) | Error propagates to caller |
| Graph 429 | Recursive retry (unbounded — shared gap with email integration) |
| Graph other 4xx/5xx | `GraphError` thrown with status and code |
| Upload > 4 MB | `migrateLeadDocumentsToOneDrive()` skips file with `console.warn`; no error thrown |
| Download failure from Supabase Storage | Skipped with `console.warn`; migration continues |
| Per-document migration failure | `console.warn` logged; migration continues for remaining documents |
| `matter_folders` sync failure per folder | `console.warn` logged; other folders continue |
| DB insert failure on `documents` | Error thrown to caller |
| `onedrive_root_folder_id` cache stale (folder deleted from OneDrive) | `ensureNorvaOSRootFolder()` will return the cached ID, and subsequent Graph operations on children will fail with 404. There is no cache invalidation path. |

**IDENTIFIED GAP — No stale cache recovery:** If the `NorvaOS` root folder is deleted from OneDrive after the ID is cached, operations will fail with a 404 but `onedrive_root_folder_id` will not be cleared. Recovery requires manual database update.

---

## 6. Observability

### Logging

`microsoft-onedrive.ts` uses `console.log`, `console.error`, and `console.warn` directly — not the structured `log` utility from `lib/utils/logger.ts`.

Specific log points:
- `[onedrive] ensureNorvaOSRootFolder called` — informational, every call
- `[onedrive] Using cached root folder ID` — on cache hit
- `[onedrive] Looking for existing NorvaOS folder...` — on cache miss
- `[onedrive] Found existing NorvaOS folder` / `NorvaOS folder not found (404), will create it` / `NorvaOS folder created`
- `[onedrive] Failed to fetch connection` — on DB error
- `[onedrive-sync] No OneDrive parent for folder` — on orphaned folder in sync
- `[onedrive-sync] Failed to create OneDrive subfolder` — per-folder failure during matter sync
- `[doc-migration] Failed to download / Skipping / OneDrive upload failed / Failed to migrate` — per-document migration events

**IDENTIFIED GAP — Unstructured logging:** All OneDrive log output uses `console.*` without `tenant_id` or structured context. This is inconsistent with `lib/utils/logger.ts` and will not be parseable by the JSON log aggregator.

### Database Audit Trail

- `microsoft_connections.onedrive_root_folder_id` — set when root folder is first resolved
- `matters.onedrive_folder_id` — set when matter subfolder is first resolved
- `matter_folders.onedrive_folder_id` — set per folder row after sync
- `documents` rows — created with `external_id`, `external_provider: 'microsoft_onedrive'`, `onedrive_item_id`, `onedrive_web_url` for linked/uploaded files

**IDENTIFIED GAP — No sync event log:** There is no `onedrive_sync_events` or similar table recording when folder sync or document migration ran, how many items were processed, or whether the run succeeded. Operational state is only visible by inspecting individual row fields.

---

## 7. Data Classification

| Data | Classification | Stored Where |
|---|---|---|
| OAuth access token | Secret | `microsoft_connections.access_token_encrypted` (AES-256-GCM) |
| OAuth refresh token | Secret | `microsoft_connections.refresh_token_encrypted` (AES-256-GCM) |
| OneDrive folder IDs (Graph item IDs) | Low sensitivity | `microsoft_connections.onedrive_root_folder_id`, `matters.onedrive_folder_id`, `matter_folders.onedrive_folder_id` |
| File name | Potentially PII | `documents.file_name` |
| File content (uploaded documents) | Confidential / client data | Stored in OneDrive (not in NorvaOS DB); `documents` row holds only a reference |
| OneDrive web URL | Low sensitivity | `documents.onedrive_web_url` (URL accessible only with OneDrive permissions) |
| Contact/matter names (used in folder names) | PII | Appear in folder paths; sanitised before use |

**Note:** NorvaOS does not store file content for OneDrive-linked documents. Files remain in the user's OneDrive; NorvaOS stores metadata references only. For files uploaded via `uploadToOneDrive()`, the file content is transmitted to OneDrive but not retained in NorvaOS storage.

---

## 8. Tenant Isolation

- All `documents` inserts include `tenant_id` sourced from function parameters
- `linkOneDriveFile()` requires `tenantId` as an explicit parameter
- `microsoft_connections` lookup is by `connectionId` (a UUID), so connection ownership is enforced by the caller providing the correct ID
- RLS on `documents` table enforces tenant scope for reads

**IDENTIFIED GAP — No tenant validation on connection:** `browseOneDrive()`, `uploadToOneDrive()`, and other functions accept `connectionId` without verifying it belongs to the calling user's tenant. If a malicious caller provides a valid `connectionId` from another tenant, they could browse that tenant's OneDrive. This must be enforced by the calling API route (which should validate ownership before passing the `connectionId`).

---

## 9. Known Limitations

1. **4 MB upload limit:** `uploadToOneDrive()` uses simple PUT upload. Files larger than 4 MB are skipped in `migrateLeadDocumentsToOneDrive()` with a log warning. Microsoft Graph supports resumable upload sessions for larger files, but this is not implemented.
2. **100-item browse limit:** `browseOneDrive()` requests `$top: '100'` items. Folders with more than 100 items will return only the first 100; there is no pagination loop.
3. **Personal OneDrive `$filter` limitation:** `createSubfolderByParentId()` catches 400/501 errors from the `$filter` query and falls back to create (with `conflictBehavior: 'rename'`). This may create duplicate folders on personal OneDrive accounts.
4. **No folder rename tracking:** If a matter's title changes, the OneDrive folder name does not update. The `onedrive_folder_id` cache continues to point to the old folder.
5. **No delete propagation:** Deleting a document from NorvaOS does not delete the corresponding OneDrive file.
6. **No sync for files added directly to OneDrive:** Files added directly to OneDrive outside NorvaOS are not discovered or linked automatically.

---

## 10. Acceptance Criteria

- [ ] Authenticated user can browse their OneDrive root via the API
- [ ] `NorvaOS/` root folder is created on first use and the ID is cached
- [ ] Linking an existing OneDrive file creates a `documents` row with `external_provider = 'microsoft_onedrive'`
- [ ] Uploading a file under 4 MB succeeds and returns `oneDriveItemId` and `webUrl`
- [ ] `ensureMatterSubfolder()` returns the cached folder ID on subsequent calls without a Graph API call
- [ ] Matter folder sync creates the correct subfolder hierarchy in OneDrive matching `matter_folders` rows
- [ ] Document migration during lead conversion processes each document without aborting on individual failures
- [ ] Token refresh works transparently during a long-running folder sync

**GAP items requiring remediation before production:**
- [ ] Structured logger (`log.*`) used instead of `console.*`
- [ ] Upload retry logic implemented (or gap accepted with documented SLA)
- [ ] 4 MB limit surfaced in the UI with a clear error message (not just a log skip)
- [ ] `linkOneDriveFile()` changed to upsert or duplicate check added
- [ ] Stale folder ID cache recovery path documented in runbook
- [ ] `connectionId` ownership validated in calling API routes
