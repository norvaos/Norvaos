/**
 * Migration 184 — Add AI-Usage Disclosure flag to retainer_agreements
 *
 * Per 2026 Federal Court guidelines, retainer agreements may include
 * an AI-usage disclosure statement. This boolean tracks whether the
 * lawyer opted in at generation time.
 */

ALTER TABLE retainer_agreements
  ADD COLUMN IF NOT EXISTS include_ai_disclosure BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN retainer_agreements.include_ai_disclosure
  IS 'Whether to include Norva Audit-Mirror AI-usage disclosure in the retainer document';
