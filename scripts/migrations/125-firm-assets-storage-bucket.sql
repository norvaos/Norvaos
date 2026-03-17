-- Migration 125: firm-assets Storage Bucket
-- Creates the Supabase Storage bucket used by the onboarding wizard
-- for firm logo uploads (POST /api/onboarding/upload-logo).
-- Bucket is public so logo URLs can be embedded in emails and portal pages.
--
-- Run manually in Supabase dashboard SQL editor.
-- 2026-03-17 — Agent 2 (Onboarding Wizard)

-- ── 1. Create bucket (idempotent) ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firm-assets',
  'firm-assets',
  true,
  2097152,  -- 2 MB in bytes
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS: service role can upload (handled by createServiceRoleClient) ─────
-- The upload route uses the service role key which bypasses RLS entirely.
-- Public read is handled by the bucket's public flag above.
-- No additional RLS policies are required.
