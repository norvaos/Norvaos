/**
 * Shared OAuth token encryption utilities (AES-256-GCM).
 *
 * Extracted from microsoft-graph.ts to be shared across all platform integrations.
 * Tokens stored as: `{iv}:{authTag}:{ciphertext}` in hex.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function getEncryptionKey(): Buffer {
  const key =
    process.env.PLATFORM_TOKEN_ENCRYPTION_KEY ??
    process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY

  if (!key) {
    throw new Error(
      'Token encryption key not configured. Set PLATFORM_TOKEN_ENCRYPTION_KEY or MICROSOFT_TOKEN_ENCRYPTION_KEY.',
    )
  }

  return Buffer.from(key, 'hex')
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey()
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

export function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Sign an OAuth state payload with HMAC for CSRF protection.
 * Expires in 10 minutes.
 */
export function signState(payload: Record<string, unknown>, secret: string): string {
  const data = JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })
  const encoded = Buffer.from(data).toString('base64url')
  const sig = createHash('sha256')
    .update(encoded + secret)
    .digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyState(state: string, secret: string): Record<string, unknown> {
  const [encoded, sig] = state.split('.')
  const expectedSig = createHash('sha256')
    .update(encoded + secret)
    .digest('base64url')
  if (sig !== expectedSig) {
    throw new Error('Invalid state signature')
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  if (payload.exp < Date.now()) {
    throw new Error('State has expired')
  }
  return payload
}
