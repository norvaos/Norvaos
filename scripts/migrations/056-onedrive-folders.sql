-- Migration: 056-onedrive-folders
-- Description: Add OneDrive folder caching columns for NorvaOS root folder and per-matter subfolders
-- Date: 2026-03-05

BEGIN;

-- Cache the NorvaOS root folder ID on the Microsoft connection
ALTER TABLE microsoft_connections
  ADD COLUMN IF NOT EXISTS onedrive_root_folder_id TEXT;

-- Cache per-matter OneDrive subfolder ID for lazy creation
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS onedrive_folder_id TEXT;

COMMIT;
