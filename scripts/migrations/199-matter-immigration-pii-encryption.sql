-- ============================================================================
-- Migration 199 — PII Column-Level Encryption: matter_immigration & appointments
-- ============================================================================
-- Extends the dual-write PII encryption pattern (established in migration 197)
-- to cover the matter_immigration and appointments tables.
--
-- DUAL-WRITE STRATEGY:
-- Phase 1 (this migration): Add encrypted BYTEA columns alongside existing
--   plaintext columns. Provide a one-time backfill function. Application code
--   must be updated to write to BOTH columns on every insert/update.
--   Reads should transition to the encrypted columns once validation confirms
--   parity between plaintext and decrypted values.
-- Phase 2 (future migration): After the application exclusively reads from
--   encrypted columns and dual-write has been validated in production, a
--   follow-up migration will DROP the original plaintext columns and rename
--   the encrypted columns or keep them as-is with updated application queries.
--
-- IMPORTANT: The encryption key is NOT stored in the database. It must be
-- supplied by the application at runtime (e.g. from an environment variable
-- or secrets manager). Never hardcode the key in migration scripts.
--
-- DEPENDENCIES: pgcrypto extension, norva_encrypt/norva_decrypt functions
-- (all created in migration 197 — not recreated here).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add encrypted columns to matter_immigration table
-- ---------------------------------------------------------------------------
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS passport_number_encrypted         BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS date_of_birth_encrypted            BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS uci_number_encrypted               BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS prior_refusal_details_encrypted    BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS criminal_record_details_encrypted  BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS medical_issue_details_encrypted    BYTEA;
ALTER TABLE matter_immigration ADD COLUMN IF NOT EXISTS sponsor_name_encrypted             BYTEA;

COMMENT ON COLUMN matter_immigration.passport_number_encrypted        IS 'PGP-AES-256 encrypted passport_number. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.date_of_birth_encrypted           IS 'PGP-AES-256 encrypted date_of_birth. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.uci_number_encrypted              IS 'PGP-AES-256 encrypted uci_number. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.prior_refusal_details_encrypted   IS 'PGP-AES-256 encrypted prior_refusal_details. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.criminal_record_details_encrypted IS 'PGP-AES-256 encrypted criminal_record_details. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.medical_issue_details_encrypted   IS 'PGP-AES-256 encrypted medical_issue_details. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN matter_immigration.sponsor_name_encrypted            IS 'PGP-AES-256 encrypted sponsor_name. Dual-write phase — plaintext column retained until validation complete.';

-- ---------------------------------------------------------------------------
-- 2. Add encrypted columns to appointments table
-- ---------------------------------------------------------------------------
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guest_name_encrypted  BYTEA;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guest_email_encrypted BYTEA;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guest_phone_encrypted BYTEA;

COMMENT ON COLUMN appointments.guest_name_encrypted  IS 'PGP-AES-256 encrypted guest_name. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN appointments.guest_email_encrypted IS 'PGP-AES-256 encrypted guest_email. Dual-write phase — plaintext column retained until validation complete.';
COMMENT ON COLUMN appointments.guest_phone_encrypted IS 'PGP-AES-256 encrypted guest_phone. Dual-write phase — plaintext column retained until validation complete.';

-- ---------------------------------------------------------------------------
-- 3. One-time backfill function: migrate_matter_pii_to_encrypted
--    Encrypts existing plaintext PII into the new encrypted columns.
--    Safe to re-run — only processes rows where encrypted column is still NULL.
--    Does NOT drop or modify the original plaintext columns.
--
--    Usage (run once from a secure session):
--      SELECT * FROM migrate_matter_pii_to_encrypted('your-encryption-key-here');
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migrate_matter_pii_to_encrypted(encryption_key TEXT)
RETURNS TABLE(matter_immigration_migrated BIGINT, appointments_migrated BIGINT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_matter_immigration_migrated BIGINT := 0;
  v_appointments_migrated       BIGINT := 0;
BEGIN
  -- matter_immigration: encrypt all PII columns where encrypted counterpart is NULL
  WITH updated AS (
    UPDATE matter_immigration
    SET
      passport_number_encrypted        = CASE WHEN passport_number_encrypted        IS NULL AND passport_number        IS NOT NULL THEN norva_encrypt(passport_number,                 encryption_key) ELSE passport_number_encrypted        END,
      date_of_birth_encrypted          = CASE WHEN date_of_birth_encrypted          IS NULL AND date_of_birth          IS NOT NULL THEN norva_encrypt(date_of_birth::TEXT,             encryption_key) ELSE date_of_birth_encrypted          END,
      uci_number_encrypted             = CASE WHEN uci_number_encrypted             IS NULL AND uci_number             IS NOT NULL THEN norva_encrypt(uci_number,                    encryption_key) ELSE uci_number_encrypted             END,
      prior_refusal_details_encrypted  = CASE WHEN prior_refusal_details_encrypted  IS NULL AND prior_refusal_details  IS NOT NULL THEN norva_encrypt(prior_refusal_details,         encryption_key) ELSE prior_refusal_details_encrypted  END,
      criminal_record_details_encrypted = CASE WHEN criminal_record_details_encrypted IS NULL AND criminal_record_details IS NOT NULL THEN norva_encrypt(criminal_record_details,      encryption_key) ELSE criminal_record_details_encrypted END,
      medical_issue_details_encrypted  = CASE WHEN medical_issue_details_encrypted  IS NULL AND medical_issue_details  IS NOT NULL THEN norva_encrypt(medical_issue_details,         encryption_key) ELSE medical_issue_details_encrypted  END,
      sponsor_name_encrypted           = CASE WHEN sponsor_name_encrypted           IS NULL AND sponsor_name           IS NOT NULL THEN norva_encrypt(sponsor_name,                  encryption_key) ELSE sponsor_name_encrypted           END
    WHERE passport_number_encrypted        IS NULL
       OR date_of_birth_encrypted          IS NULL
       OR uci_number_encrypted             IS NULL
       OR prior_refusal_details_encrypted  IS NULL
       OR criminal_record_details_encrypted IS NULL
       OR medical_issue_details_encrypted  IS NULL
       OR sponsor_name_encrypted           IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_matter_immigration_migrated FROM updated;

  -- appointments: encrypt all PII columns where encrypted counterpart is NULL
  WITH updated AS (
    UPDATE appointments
    SET
      guest_name_encrypted  = CASE WHEN guest_name_encrypted  IS NULL AND guest_name  IS NOT NULL THEN norva_encrypt(guest_name,  encryption_key) ELSE guest_name_encrypted  END,
      guest_email_encrypted = CASE WHEN guest_email_encrypted IS NULL AND guest_email IS NOT NULL THEN norva_encrypt(guest_email, encryption_key) ELSE guest_email_encrypted END,
      guest_phone_encrypted = CASE WHEN guest_phone_encrypted IS NULL AND guest_phone IS NOT NULL THEN norva_encrypt(guest_phone, encryption_key) ELSE guest_phone_encrypted END
    WHERE guest_name_encrypted  IS NULL
       OR guest_email_encrypted IS NULL
       OR guest_phone_encrypted IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_appointments_migrated FROM updated;

  RETURN QUERY SELECT v_matter_immigration_migrated, v_appointments_migrated;
END;
$$;

COMMENT ON FUNCTION migrate_matter_pii_to_encrypted(TEXT)
  IS 'One-time backfill: encrypts existing plaintext PII into *_encrypted columns on matter_immigration and appointments. Safe to re-run (skips already-encrypted rows). Does NOT drop plaintext columns.';

COMMIT;
