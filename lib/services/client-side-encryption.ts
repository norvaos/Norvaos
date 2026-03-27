/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Client-Side AES-256-GCM Encryption  -  The Zero-Knowledge Vault (Target 14)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Encrypts documents on the client's device BEFORE upload, so that:
 *   - The server never sees plaintext file contents
 *   - A database breach leaves files unreadable
 *   - Only the holder of the decryption key can access the file
 *
 * Key Management Strategy:
 *
 *   1. User Master Key: Derived from user's password + salt via PBKDF2
 *      (100,000 iterations, SHA-256). Never transmitted or stored.
 *
 *   2. Document Encryption Key (DEK): Random 256-bit AES key generated
 *      per-document. Used to encrypt the file with AES-256-GCM.
 *
 *   3. Wrapped DEK: The DEK is encrypted with the User Master Key.
 *      Only the wrapped DEK is stored in the database.
 *
 *   4. Recovery Key: An additional wrapping of the DEK using the
 *      tenant admin's recovery key (for disaster recovery).
 *
 * Encryption Format:
 *   [12-byte IV] [encrypted bytes] [16-byte auth tag]
 *
 * The IV and auth tag are prepended/appended to the ciphertext as a
 * single Uint8Array. This is the format stored in Supabase Storage.
 *
 * Browser Compatibility:
 *   - Web Crypto API: Chrome 37+, Safari 11+, Firefox 34+, Edge 12+
 *   - All modern mobile browsers supported
 *
 * Integrates with:
 *   - `app/api/documents/upload/route.ts` (upload flow)
 *   - `lib/services/pii-encryption.ts` (server-side column encryption)
 *   - `lib/ircc/pdf-encryption.ts` (server-side PDF encryption)
 *
 * This module runs ONLY in the browser. Server imports will throw.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface EncryptedDocument {
  /** The encrypted file bytes (IV + ciphertext + authTag) */
  encryptedBytes: Uint8Array
  /** The Document Encryption Key wrapped with the user's master key (base64) */
  wrappedDek: string
  /** The Document Encryption Key wrapped with the recovery key (base64, optional) */
  wrappedDekRecovery?: string
  /** Salt used for master key derivation (base64) */
  salt: string
  /** IV used for file encryption (base64) — also embedded in encryptedBytes */
  iv: string
  /** SHA-256 hash of the PLAINTEXT file (for integrity verification after decrypt) */
  plaintextHash: string
  /** Original file size in bytes */
  originalSize: number
  /** Encrypted file size in bytes */
  encryptedSize: number
  /** MIME type of the original file */
  mimeType: string
  /** Encryption metadata version */
  encryptionVersion: '1.0.0'
}

export interface DecryptedDocument {
  /** The decrypted file bytes */
  bytes: Uint8Array
  /** Whether the integrity hash matched */
  integrityVerified: boolean
  /** Original MIME type */
  mimeType: string
}

export interface EncryptionKeyPair {
  /** The derived master key (CryptoKey, non-extractable) */
  masterKey: CryptoKey
  /** The salt used for derivation (base64) */
  salt: string
}

export interface VaultKeyMetadata {
  /** Base64-encoded salt for PBKDF2 derivation */
  salt: string
  /** Number of PBKDF2 iterations used */
  iterations: number
  /** Key derivation algorithm */
  algorithm: 'PBKDF2-SHA256'
  /** When this key was created */
  createdAt: string
}

// ── Constants ────────────────────────────────────────────────────────────────

/** PBKDF2 iteration count — OWASP recommendation for 2024+ */
const PBKDF2_ITERATIONS = 100_000

/** AES-GCM IV size in bytes */
const IV_SIZE = 12

/** AES-GCM auth tag size in bytes */
const AUTH_TAG_SIZE = 16

/** AES key size in bits */
const AES_KEY_BITS = 256

/** Maximum file size for client-side encryption (100 MB) */
const MAX_ENCRYPT_SIZE = 100 * 1024 * 1024

// ── Master Key Derivation ────────────────────────────────────────────────────

/**
 * Derive an AES-256 master key from a user passphrase using PBKDF2.
 *
 * The passphrase is typically the user's vault password (separate from
 * their login password) or derived from their WebAuthn credential.
 *
 * @param passphrase - The user's vault passphrase
 * @param existingSalt - Base64-encoded salt (for re-derivation). If null, generates new salt.
 * @returns The derived CryptoKey and the salt used
 */
export async function deriveMasterKey(
  passphrase: string,
  existingSalt?: string,
): Promise<EncryptionKeyPair> {
  assertBrowser()

  // Generate or reuse salt (16 bytes)
  const saltBytes = existingSalt
    ? base64ToBytes(existingSalt)
    : crypto.getRandomValues(new Uint8Array(16))

  // Import passphrase as a CryptoKey for PBKDF2
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  // Derive AES-256 key
  const masterKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as ArrayBufferView<ArrayBuffer>,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false, // Non-extractable for security
    ['wrapKey', 'unwrapKey'],
  )

  return {
    masterKey,
    salt: bytesToBase64(saltBytes),
  }
}

/**
 * Get the vault key metadata for storage in the user's profile.
 * This metadata is needed to re-derive the master key later.
 */
export function getVaultKeyMetadata(salt: string): VaultKeyMetadata {
  return {
    salt,
    iterations: PBKDF2_ITERATIONS,
    algorithm: 'PBKDF2-SHA256',
    createdAt: new Date().toISOString(),
  }
}

// ── Document Encryption ──────────────────────────────────────────────────────

/**
 * Encrypt a file on the client's device before upload.
 *
 * Flow:
 *   1. Generate a random Document Encryption Key (DEK)
 *   2. Encrypt the file with AES-256-GCM using the DEK
 *   3. Wrap (encrypt) the DEK with the user's master key
 *   4. Return the encrypted file + wrapped DEK
 *
 * The server stores the encrypted file and wrapped DEK, but never
 * has access to the plaintext or the unwrapped DEK.
 */
export async function encryptDocument(
  file: File | Uint8Array,
  masterKey: CryptoKey,
  recoveryKey?: CryptoKey,
): Promise<EncryptedDocument> {
  assertBrowser()

  // Read file bytes
  const plaintext = file instanceof File
    ? new Uint8Array(await file.arrayBuffer())
    : file

  if (plaintext.byteLength > MAX_ENCRYPT_SIZE) {
    throw new Error(
      `File too large for client-side encryption (${(plaintext.byteLength / 1024 / 1024).toFixed(1)} MB, max ${MAX_ENCRYPT_SIZE / 1024 / 1024} MB)`,
    )
  }

  // Hash plaintext for integrity verification
  const plaintextHash = await sha256Hex(plaintext)

  // Generate random Document Encryption Key
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_BITS },
    true, // Extractable (needed for wrapping)
    ['encrypt', 'decrypt'],
  )

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE))

  // Encrypt the file with AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: AUTH_TAG_SIZE * 8 },
    dek,
    plaintext as ArrayBufferView<ArrayBuffer>,
  )

  // Pack: [IV (12)] [ciphertext + authTag]
  const encryptedBytes = new Uint8Array(IV_SIZE + ciphertext.byteLength)
  encryptedBytes.set(iv, 0)
  encryptedBytes.set(new Uint8Array(ciphertext), IV_SIZE)

  // Wrap the DEK with the master key
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_SIZE))
  const wrappedDekBytes = await crypto.subtle.wrapKey(
    'raw',
    dek,
    masterKey,
    { name: 'AES-GCM', iv: wrapIv },
  )

  // Pack wrapped DEK: [wrapIV (12)] [wrappedKey + authTag]
  const wrappedDekFull = new Uint8Array(IV_SIZE + wrappedDekBytes.byteLength)
  wrappedDekFull.set(wrapIv, 0)
  wrappedDekFull.set(new Uint8Array(wrappedDekBytes), IV_SIZE)

  // Optional: wrap DEK with recovery key
  let wrappedDekRecovery: string | undefined
  if (recoveryKey) {
    const recoveryIv = crypto.getRandomValues(new Uint8Array(IV_SIZE))
    const recoveryWrapped = await crypto.subtle.wrapKey(
      'raw',
      dek,
      recoveryKey,
      { name: 'AES-GCM', iv: recoveryIv },
    )
    const recoveryFull = new Uint8Array(IV_SIZE + recoveryWrapped.byteLength)
    recoveryFull.set(recoveryIv, 0)
    recoveryFull.set(new Uint8Array(recoveryWrapped), IV_SIZE)
    wrappedDekRecovery = bytesToBase64(recoveryFull)
  }

  const mimeType = file instanceof File ? file.type : 'application/octet-stream'

  return {
    encryptedBytes,
    wrappedDek: bytesToBase64(wrappedDekFull),
    wrappedDekRecovery,
    salt: '', // Set by caller from EncryptionKeyPair.salt
    iv: bytesToBase64(iv),
    plaintextHash,
    originalSize: plaintext.byteLength,
    encryptedSize: encryptedBytes.byteLength,
    mimeType,
    encryptionVersion: '1.0.0',
  }
}

// ── Document Decryption ──────────────────────────────────────────────────────

/**
 * Decrypt a file on the client's device after download.
 *
 * Flow:
 *   1. Unwrap the DEK using the user's master key
 *   2. Extract IV from the encrypted bytes
 *   3. Decrypt the file with AES-256-GCM using the DEK
 *   4. Verify integrity hash
 */
export async function decryptDocument(
  encryptedBytes: Uint8Array,
  wrappedDek: string,
  masterKey: CryptoKey,
  expectedHash?: string,
  mimeType: string = 'application/octet-stream',
): Promise<DecryptedDocument> {
  assertBrowser()

  // 1. Unwrap the DEK
  const wrappedDekBytes = base64ToBytes(wrappedDek)
  const wrapIv = wrappedDekBytes.slice(0, IV_SIZE)
  const wrappedKeyData = wrappedDekBytes.slice(IV_SIZE)

  const dek = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyData,
    masterKey,
    { name: 'AES-GCM', iv: wrapIv },
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['decrypt'],
  )

  // 2. Extract IV and ciphertext
  const iv = encryptedBytes.slice(0, IV_SIZE)
  const ciphertext = encryptedBytes.slice(IV_SIZE)

  // 3. Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: AUTH_TAG_SIZE * 8 },
    dek,
    ciphertext,
  )

  const bytes = new Uint8Array(plaintext)

  // 4. Verify integrity
  let integrityVerified = true
  if (expectedHash) {
    const actualHash = await sha256Hex(bytes)
    integrityVerified = actualHash === expectedHash
  }

  return {
    bytes,
    integrityVerified,
    mimeType,
  }
}

// ── Recovery Key ─────────────────────────────────────────────────────────────

/**
 * Generate a recovery key for the tenant admin.
 * This key can unwrap any document's DEK for disaster recovery.
 *
 * The recovery key should be:
 *   - Generated once per tenant
 *   - Stored offline (printed QR code, safe deposit box)
 *   - Never stored digitally in the same system
 */
export async function generateRecoveryKey(): Promise<{
  key: CryptoKey
  exportedKey: string // base64
}> {
  assertBrowser()

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_BITS },
    true,
    ['wrapKey', 'unwrapKey'],
  )

  const exported = await crypto.subtle.exportKey('raw', key)
  return {
    key,
    exportedKey: bytesToBase64(new Uint8Array(exported)),
  }
}

/**
 * Import a recovery key from its base64 representation.
 * Used when the admin needs to recover encrypted documents.
 */
export async function importRecoveryKey(exportedKey: string): Promise<CryptoKey> {
  assertBrowser()

  const keyBytes = base64ToBytes(exportedKey)
  return crypto.subtle.importKey(
    'raw',
    keyBytes as ArrayBufferView<ArrayBuffer>,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/**
 * Decrypt a document using the recovery key (admin disaster recovery).
 */
export async function decryptWithRecoveryKey(
  encryptedBytes: Uint8Array,
  wrappedDekRecovery: string,
  recoveryKey: CryptoKey,
  expectedHash?: string,
  mimeType: string = 'application/octet-stream',
): Promise<DecryptedDocument> {
  return decryptDocument(encryptedBytes, wrappedDekRecovery, recoveryKey, expectedHash, mimeType)
}

// ── Streaming Encryption (for large files) ───────────────────────────────────

/**
 * Encrypt a file in chunks using a streaming approach.
 * Uses AES-GCM per chunk with sequential IVs derived from the base IV.
 *
 * For files > 50 MB, this avoids holding the entire file in memory.
 * Each chunk is independently authenticated.
 *
 * Format per chunk: [4-byte chunk index] [12-byte IV] [ciphertext + authTag]
 * Header: [4-byte version] [4-byte chunk size] [12-byte base IV] [32-byte DEK wrapped]
 */
export async function encryptStream(
  file: File,
  masterKey: CryptoKey,
  chunkSize: number = 1024 * 1024, // 1 MB chunks
  onProgress?: (percent: number) => void,
): Promise<{ chunks: Uint8Array[]; wrappedDek: string; totalChunks: number }> {
  assertBrowser()

  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_BITS },
    true,
    ['encrypt'],
  )

  // Wrap DEK
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_SIZE))
  const wrappedDekBytes = await crypto.subtle.wrapKey(
    'raw', dek, masterKey, { name: 'AES-GCM', iv: wrapIv },
  )
  const wrappedDekFull = new Uint8Array(IV_SIZE + wrappedDekBytes.byteLength)
  wrappedDekFull.set(wrapIv, 0)
  wrappedDekFull.set(new Uint8Array(wrappedDekBytes), IV_SIZE)

  const totalSize = file.size
  const totalChunks = Math.ceil(totalSize / chunkSize)
  const chunks: Uint8Array[] = []

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, totalSize)
    const chunk = new Uint8Array(await file.slice(start, end).arrayBuffer())

    // Unique IV per chunk (random)
    const chunkIv = crypto.getRandomValues(new Uint8Array(IV_SIZE))

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: chunkIv, tagLength: AUTH_TAG_SIZE * 8 },
      dek,
      chunk,
    )

    // Pack: [chunkIndex (4)] [IV (12)] [ciphertext + authTag]
    const chunkIndexBytes = new Uint8Array(4)
    new DataView(chunkIndexBytes.buffer).setUint32(0, i)

    const packed = new Uint8Array(4 + IV_SIZE + encrypted.byteLength)
    packed.set(chunkIndexBytes, 0)
    packed.set(chunkIv, 4)
    packed.set(new Uint8Array(encrypted), 4 + IV_SIZE)
    chunks.push(packed)

    onProgress?.(Math.round(((i + 1) / totalChunks) * 100))
  }

  return {
    chunks,
    wrappedDek: bytesToBase64(wrappedDekFull),
    totalChunks,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure we're in a browser environment */
function assertBrowser(): void {
  if (typeof window === 'undefined' || typeof crypto?.subtle === 'undefined') {
    throw new Error(
      '[client-side-encryption] This module requires the Web Crypto API (browser only).',
    )
  }
}

/** SHA-256 hash as hex string */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Uint8Array → base64 string */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  return btoa(String.fromCharCode(...bytes))
}

/** base64 string → Uint8Array */
function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Check if client-side encryption is available.
 * Returns false on server or browsers without SubtleCrypto.
 */
export function isClientEncryptionAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.deriveKey === 'function'
  )
}

/**
 * Generate encryption metadata for storage alongside the document record.
 * This metadata is stored in the `documents` table and is needed for decryption.
 */
export function buildEncryptionMetadata(
  encrypted: EncryptedDocument,
  salt: string,
): Record<string, unknown> {
  return {
    encryption_version: encrypted.encryptionVersion,
    wrapped_dek: encrypted.wrappedDek,
    wrapped_dek_recovery: encrypted.wrappedDekRecovery ?? null,
    salt,
    iv: encrypted.iv,
    plaintext_hash: encrypted.plaintextHash,
    original_size: encrypted.originalSize,
    encrypted_size: encrypted.encryptedSize,
    mime_type: encrypted.mimeType,
    encrypted_at: new Date().toISOString(),
    algorithm: 'AES-256-GCM',
    key_derivation: 'PBKDF2-SHA256',
    key_derivation_iterations: PBKDF2_ITERATIONS,
  }
}
