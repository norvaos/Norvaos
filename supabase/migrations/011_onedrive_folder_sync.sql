-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 081: OneDrive Folder Sync Support
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds onedrive_folder_id to matter_folders so each DB-level folder can be
-- linked to its corresponding OneDrive subfolder. During lead-to-matter
-- conversion, the system creates the full folder hierarchy in OneDrive
-- (matching matter_folder_templates) and caches each folder's Graph API ID.
--
-- This enables:
--   1. Automatic subfolder creation in OneDrive matching the matter type template
--   2. Document uploads routed to the correct OneDrive subfolder
--   3. Lead document migration into proper folders with proper naming

ALTER TABLE matter_folders
  ADD COLUMN IF NOT EXISTS onedrive_folder_id TEXT;

-- Partial index: only index rows that have an OneDrive folder linked
CREATE INDEX IF NOT EXISTS idx_matter_folders_onedrive
  ON matter_folders(onedrive_folder_id)
  WHERE onedrive_folder_id IS NOT NULL;

COMMENT ON COLUMN matter_folders.onedrive_folder_id IS
  'Microsoft Graph API folder ID for the corresponding OneDrive subfolder. Cached for fast uploads.';
