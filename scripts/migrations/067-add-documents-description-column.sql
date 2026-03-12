-- 067: Add missing description column to documents table
-- The column was defined in the original CREATE TABLE migration but was never
-- applied to the live database, causing "Could not find the 'description' column"
-- errors when uploading documents (especially on contacts).

ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
