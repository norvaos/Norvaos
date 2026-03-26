-- ============================================================================
-- Migration 197  -  PII Column-Level Encryption (Norva Vault)
-- ============================================================================
-- Adds AES-256 column-level encryption for PII fields on contacts and leads
-- tables using pgcrypto's PGP symmetric encryption functions.
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
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enable pgcrypto extension
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. Helper function: norva_encrypt
--    Encrypts plaintext using PGP symmetric encryption with AES-256.
--    Returns NULL if plaintext is NULL (preserves nullability semantics).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norva_encrypt(plaintext TEXT, key TEXT)
RETURNS BYTEA
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT pgp_sym_encrypt(plaintext, key, 'cipher-algo=aes256');
$$;

COMMENT ON FUNCTION norva_encrypt(TEXT, TEXT)
  IS 'Norva Vault: encrypts plaintext with AES-256 via pgp_sym_encrypt. Key must be supplied at runtime.';

-- ---------------------------------------------------------------------------
-- 3. Helper function: norva_decrypt
--    Decrypts ciphertext previously encrypted with norva_encrypt.
--    Returns NULL if ciphertext is NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION norva_decrypt(ciphertext BYTEA, key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT pgp_sym_decrypt(ciphertext, key);
$$;

COMMENT ON FUNCTION norva_decrypt(BYTEA, TEXT)
  IS 'Norva Vault: decrypts BYTEA ciphertext with pgp_sym_decrypt. Key must match the one used during encryption.';

-- ---------------------------------------------------------------------------
-- 4. Add encrypted columns to contacts table
-- ---------------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name_encrypted      BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name_encrypted       BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS date_of_birth_encrypted   BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_encrypted         BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS passport_number_encrypted BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_encrypted           BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_encrypted           BYTEA;

COMMENT ON COLUMN contacts.first_name_encrypted      IS 'PGP-AES-256 encrypted first_name. Dual-write phase  -  plaintext column retained until validation complete.';
COMMENT ON COLUMN contacts.last_name_encrypted       IS 'PGP-AES-256 encrypted last_name. Dual-write phase.';
COMMENT ON COLUMN contacts.date_of_birth_encrypted   IS 'PGP-AES-256 encrypted date_of_birth. Dual-write phase.';
COMMENT ON COLUMN contacts.address_encrypted         IS 'PGP-AES-256 encrypted address. Dual-write phase.';
COMMENT ON COLUMN contacts.passport_number_encrypted IS 'PGP-AES-256 encrypted passport_number. Dual-write phase.';
COMMENT ON COLUMN contacts.phone_encrypted           IS 'PGP-AES-256 encrypted phone. Dual-write phase.';
COMMENT ON COLUMN contacts.email_encrypted           IS 'PGP-AES-256 encrypted email. Dual-write phase.';

-- ---------------------------------------------------------------------------
-- 5. Add encrypted columns to leads table
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name_encrypted BYTEA;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name_encrypted  BYTEA;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_encrypted      BYTEA;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_encrypted      BYTEA;

COMMENT ON COLUMN leads.first_name_encrypted IS 'PGP-AES-256 encrypted first_name. Dual-write phase  -  plaintext column retained until validation complete.';
COMMENT ON COLUMN leads.last_name_encrypted  IS 'PGP-AES-256 encrypted last_name. Dual-write phase.';
COMMENT ON COLUMN leads.email_encrypted      IS 'PGP-AES-256 encrypted email. Dual-write phase.';
COMMENT ON COLUMN leads.phone_encrypted      IS 'PGP-AES-256 encrypted phone. Dual-write phase.';

-- ---------------------------------------------------------------------------
-- 6. One-time backfill function: migrate_pii_to_encrypted
--    Encrypts existing plaintext PII into the new encrypted columns.
--    Safe to re-run  -  only processes rows where encrypted column is still NULL.
--    Does NOT drop or modify the original plaintext columns.
--
--    Usage (run once from a secure session):
--      SELECT migrate_pii_to_encrypted('your-encryption-key-here');
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migrate_pii_to_encrypted(encryption_key TEXT)
RETURNS TABLE(contacts_migrated BIGINT, leads_migrated BIGINT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contacts_migrated BIGINT := 0;
  v_leads_migrated    BIGINT := 0;
BEGIN
  -- Contacts: encrypt all PII columns where encrypted counterpart is NULL
  WITH updated AS (
    UPDATE contacts
    SET
      first_name_encrypted      = CASE WHEN first_name_encrypted      IS NULL AND first_name      IS NOT NULL THEN norva_encrypt(first_name,                  encryption_key) ELSE first_name_encrypted      END,
      last_name_encrypted       = CASE WHEN last_name_encrypted       IS NULL AND last_name       IS NOT NULL THEN norva_encrypt(last_name,                   encryption_key) ELSE last_name_encrypted       END,
      date_of_birth_encrypted   = CASE WHEN date_of_birth_encrypted   IS NULL AND date_of_birth   IS NOT NULL THEN norva_encrypt(date_of_birth::TEXT,          encryption_key) ELSE date_of_birth_encrypted   END,
      address_encrypted         = CASE WHEN address_encrypted         IS NULL AND address         IS NOT NULL THEN norva_encrypt(address,                     encryption_key) ELSE address_encrypted         END,
      passport_number_encrypted = CASE WHEN passport_number_encrypted IS NULL AND passport_number IS NOT NULL THEN norva_encrypt(passport_number,             encryption_key) ELSE passport_number_encrypted END,
      phone_encrypted           = CASE WHEN phone_encrypted           IS NULL AND phone           IS NOT NULL THEN norva_encrypt(phone,                       encryption_key) ELSE phone_encrypted           END,
      email_encrypted           = CASE WHEN email_encrypted           IS NULL AND email           IS NOT NULL THEN norva_encrypt(email,                       encryption_key) ELSE email_encrypted           END
    WHERE first_name_encrypted      IS NULL
       OR last_name_encrypted       IS NULL
       OR date_of_birth_encrypted   IS NULL
       OR address_encrypted         IS NULL
       OR passport_number_encrypted IS NULL
       OR phone_encrypted           IS NULL
       OR email_encrypted           IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_contacts_migrated FROM updated;

  -- Leads: encrypt all PII columns where encrypted counterpart is NULL
  WITH updated AS (
    UPDATE leads
    SET
      first_name_encrypted = CASE WHEN first_name_encrypted IS NULL AND first_name IS NOT NULL THEN norva_encrypt(first_name, encryption_key) ELSE first_name_encrypted END,
      last_name_encrypted  = CASE WHEN last_name_encrypted  IS NULL AND last_name  IS NOT NULL THEN norva_encrypt(last_name,  encryption_key) ELSE last_name_encrypted  END,
      email_encrypted      = CASE WHEN email_encrypted      IS NULL AND email      IS NOT NULL THEN norva_encrypt(email,      encryption_key) ELSE email_encrypted      END,
      phone_encrypted      = CASE WHEN phone_encrypted      IS NULL AND phone      IS NOT NULL THEN norva_encrypt(phone,      encryption_key) ELSE phone_encrypted      END
    WHERE first_name_encrypted IS NULL
       OR last_name_encrypted  IS NULL
       OR email_encrypted      IS NULL
       OR phone_encrypted      IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_leads_migrated FROM updated;

  RETURN QUERY SELECT v_contacts_migrated, v_leads_migrated;
END;
$$;

COMMENT ON FUNCTION migrate_pii_to_encrypted(TEXT)
  IS 'One-time backfill: encrypts existing plaintext PII into *_encrypted columns. Safe to re-run (skips already-encrypted rows). Does NOT drop plaintext columns.';

COMMIT;
