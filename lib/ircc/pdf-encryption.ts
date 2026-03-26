/**
 * PDF Encryption Vault
 *
 * Encrypts generated IRCC form pack PDFs with per-matter AES-256 keys.
 * Uses Node.js crypto for AES-256-CBC encryption at the byte level.
 *
 * The encryption key is stored in `matter_vault_keys` (one key per matter).
 * Only the assigned lawyer or admin can decrypt/download via vault-unlock.
 *
 * Flow:
 *   1. Generate form pack PDF (normal flow)
 *   2. Get or create vault key for the matter (via RPC)
 *   3. Encrypt the PDF bytes with AES-256-CBC
 *   4. Upload encrypted bytes to storage
 *   5. Store IV in form_pack_artifacts.encryption_iv
 *   6. Decrypt on download via vault-unlock route
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EncryptionResult {
  encryptedBytes: Uint8Array
  iv: string  // hex-encoded IV for decryption
}

export interface DecryptionParams {
  encryptedBytes: Uint8Array
  key: string   // hex-encoded 32-byte key
  iv: string    // hex-encoded 16-byte IV
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

/**
 * Encrypt PDF bytes with AES-256-CBC using the matter's vault key.
 *
 * @param pdfBytes - Raw PDF file bytes
 * @param keyHex - 64-char hex string (32 bytes) from matter_vault_keys
 * @returns Encrypted bytes + IV for storage
 */
export function encryptPdf(pdfBytes: Uint8Array, keyHex: string): EncryptionResult {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(16)

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(pdfBytes),
    cipher.final(),
  ])

  return {
    encryptedBytes: new Uint8Array(encrypted),
    iv: iv.toString('hex'),
  }
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypt PDF bytes previously encrypted with encryptPdf.
 *
 * @param params - Encrypted bytes, key, and IV
 * @returns Decrypted PDF bytes
 */
export function decryptPdf(params: DecryptionParams): Uint8Array {
  const key = Buffer.from(params.key, 'hex')
  const iv = Buffer.from(params.iv, 'hex')

  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(params.encryptedBytes)),
    decipher.final(),
  ])

  return new Uint8Array(decrypted)
}

// ── Key Derivation ────────────────────────────────────────────────────────────

/**
 * Derive a display-safe fingerprint of a vault key (for UI/logs).
 * Returns the first 8 chars of SHA-256(key).
 */
export function vaultKeyFingerprint(keyHex: string): string {
  return createHash('sha256').update(keyHex).digest('hex').slice(0, 8)
}
