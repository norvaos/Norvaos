-- Migration 189: Snippet Chain-of-Custody Support
-- Adds RPC for incrementing snippet use_count (used by AI draft engine).
-- The actual chain-of-custody hashing is done in Node.js (context-builder.ts).

-- ── RPC: increment_snippet_use_count ────────────────────────────────────────
-- Called fire-and-forget when a snippet is referenced in an AI draft.
CREATE OR REPLACE FUNCTION increment_snippet_use_count(snippet_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE wiki_snippets
  SET use_count = COALESCE(use_count, 0) + 1,
      updated_at = now()
  WHERE id = snippet_id
    AND is_active = true;
$$;
