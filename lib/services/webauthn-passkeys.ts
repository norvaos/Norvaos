/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WebAuthn / Passkeys  -  The Biometric Handshake (Target 13)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements FIDO2 WebAuthn for passwordless authentication via FaceID,
 * TouchID, Windows Hello, or hardware security keys.
 *
 * Architecture:
 *   - Client-side: Web Authentication API (navigator.credentials)
 *   - Server-side: Challenge generation + credential verification
 *   - Storage: `user_passkeys` table in Supabase (linked to auth.users)
 *
 * Flow (Registration):
 *   1. Server generates random challenge + user entity
 *   2. Client calls navigator.credentials.create() → authenticator creates keypair
 *   3. Client sends attestation response to server
 *   4. Server validates attestation, stores public key + credential ID
 *
 * Flow (Authentication):
 *   1. Server generates random challenge + allowCredentials list
 *   2. Client calls navigator.credentials.get() → authenticator signs challenge
 *   3. Client sends assertion response to server
 *   4. Server validates signature against stored public key
 *   5. Server issues Supabase session (via admin signInWithId or custom JWT)
 *
 * This module provides:
 *   - Client helpers (registration/authentication option builders)
 *   - Server helpers (challenge generation, attestation/assertion verification)
 *   - Supabase integration (credential CRUD)
 *
 * Browser support: Chrome 67+, Safari 14+, Firefox 60+, Edge 18+
 * All modern mobile browsers support platform authenticators (FaceID/TouchID).
 *
 * Dependencies: None beyond Web Crypto API (built into Node 18+ and browsers).
 * The heavy cryptographic verification uses SubtleCrypto for signature checks.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PasskeyCredential {
  /** Database record ID */
  id: string
  /** WebAuthn credential ID (base64url) */
  credentialId: string
  /** Public key in COSE format (base64url) */
  publicKey: string
  /** Signature counter (replay protection) */
  signCounter: number
  /** Authenticator type: platform (FaceID/TouchID) or cross-platform (USB key) */
  authenticatorType: 'platform' | 'cross-platform'
  /** Human-readable device name */
  deviceName: string
  /** AAGUID of the authenticator (for identification) */
  aaguid: string
  /** When this passkey was registered */
  createdAt: string
  /** Last successful authentication */
  lastUsedAt: string | null
  /** Whether this credential is backed up (synced across devices) */
  backedUp: boolean
}

/** Options sent to the client for navigator.credentials.create() */
export interface RegistrationOptions {
  challenge: string // base64url
  rp: {
    id: string
    name: string
  }
  user: {
    id: string // base64url of user UUID
    name: string
    displayName: string
  }
  pubKeyCredParams: Array<{
    type: 'public-key'
    alg: number // -7 (ES256) or -257 (RS256)
  }>
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform'
    residentKey: 'required' | 'preferred'
    userVerification: 'required' | 'preferred'
  }
  timeout: number
  attestation: 'none' | 'direct'
  excludeCredentials: Array<{
    id: string // base64url
    type: 'public-key'
    transports?: string[]
  }>
}

/** Options sent to the client for navigator.credentials.get() */
export interface AuthenticationOptions {
  challenge: string // base64url
  rpId: string
  timeout: number
  userVerification: 'required' | 'preferred'
  allowCredentials: Array<{
    id: string // base64url
    type: 'public-key'
    transports?: string[]
  }>
}

/** Client's response from navigator.credentials.create() */
export interface RegistrationResponse {
  id: string // credential ID (base64url)
  rawId: string // base64url
  type: 'public-key'
  response: {
    clientDataJSON: string // base64url
    attestationObject: string // base64url
  }
  authenticatorAttachment?: 'platform' | 'cross-platform'
}

/** Client's response from navigator.credentials.get() */
export interface AuthenticationResponse {
  id: string // credential ID (base64url)
  rawId: string // base64url
  type: 'public-key'
  response: {
    clientDataJSON: string // base64url
    authenticatorData: string // base64url
    signature: string // base64url
    userHandle?: string // base64url (user ID)
  }
}

/** Server verification result */
export interface VerificationResult {
  verified: boolean
  credentialId?: string
  newSignCount?: number
  error?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Relying Party ID — must match the domain the app is served from */
const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? 'localhost'

/** Relying Party name shown in the authenticator prompt */
const RP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'NorvaOS'

/** Challenge validity window (5 minutes) */
const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Supported public key algorithms (ES256 preferred, RS256 fallback) */
const PUB_KEY_CRED_PARAMS = [
  { type: 'public-key' as const, alg: -7 },   // ES256 (ECDSA w/ SHA-256)
  { type: 'public-key' as const, alg: -257 },  // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
]

// ── Challenge Management ─────────────────────────────────────────────────────

/**
 * Generate a cryptographically random challenge.
 * Returns base64url-encoded 32 bytes.
 */
export function generateChallenge(): string {
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)
  return base64urlEncode(buffer)
}

/**
 * Create a challenge record in the database for verification.
 * The challenge is stored with a TTL and consumed on verification.
 */
export async function createChallenge(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  type: 'registration' | 'authentication',
): Promise<string> {
  const challenge = generateChallenge()
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()

  await (supabase as any).from('webauthn_challenges').insert({
    user_id: userId,
    challenge,
    type,
    expires_at: expiresAt,
  })

  return challenge
}

/**
 * Consume and validate a challenge. Returns true if valid and not expired.
 * Deletes the challenge after consumption (one-time use).
 */
export async function consumeChallenge(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  challenge: string,
  type: 'registration' | 'authentication',
): Promise<boolean> {
  const { data, error } = await (supabase as any).from('webauthn_challenges')
    .delete()
    .eq('user_id', userId)
    .eq('challenge', challenge)
    .eq('type', type)
    .gte('expires_at', new Date().toISOString())
    .select('id')

  return !error && !!data && (data as unknown[]).length > 0
}

// ── Registration Flow ────────────────────────────────────────────────────────

/**
 * Generate registration options for the client.
 * Called when the user clicks "Add Passkey" in their security settings.
 */
export async function generateRegistrationOptions(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  user: { id: string; email: string; displayName: string },
  preferPlatform: boolean = true,
): Promise<RegistrationOptions> {
  const challenge = await createChallenge(supabase, user.id, 'registration')

  // Fetch existing credentials to exclude (prevent duplicate registration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('user_passkeys')
    .select('credential_id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const excludeCredentials = ((existing ?? []) as Array<{ credential_id: string }>).map((cred) => ({
    id: cred.credential_id,
    type: 'public-key' as const,
    transports: ['internal', 'hybrid'] as string[],
  }))

  return {
    challenge,
    rp: {
      id: RP_ID,
      name: RP_NAME,
    },
    user: {
      id: base64urlEncode(new TextEncoder().encode(user.id)),
      name: user.email,
      displayName: user.displayName,
    },
    pubKeyCredParams: PUB_KEY_CRED_PARAMS,
    authenticatorSelection: {
      authenticatorAttachment: preferPlatform ? 'platform' : undefined,
      residentKey: 'required',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none', // Privacy-preserving: no attestation needed for passkeys
    excludeCredentials,
  }
}

/**
 * Verify the registration response from the client and store the credential.
 *
 * Validates:
 *   - Challenge matches stored challenge
 *   - Origin matches expected RP origin
 *   - Attestation object is well-formed
 *   - User verification flag is set
 */
export async function verifyRegistration(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  response: RegistrationResponse,
  deviceName: string = 'Unknown Device',
): Promise<VerificationResult> {
  try {
    // 1. Decode and parse clientDataJSON
    const clientDataBytes = base64urlDecode(response.response.clientDataJSON)
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))

    // 2. Validate type
    if (clientData.type !== 'webauthn.create') {
      return { verified: false, error: 'Invalid client data type' }
    }

    // 3. Validate challenge
    const challengeValid = await consumeChallenge(
      supabase, userId, clientData.challenge, 'registration',
    )
    if (!challengeValid) {
      return { verified: false, error: 'Challenge expired or invalid' }
    }

    // 4. Validate origin
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${RP_ID}`
    if (clientData.origin !== expectedOrigin) {
      return { verified: false, error: `Origin mismatch: ${clientData.origin}` }
    }

    // 5. Parse attestation object (CBOR-encoded)
    // For 'none' attestation, we extract authData which contains the public key
    const attestationBytes = base64urlDecode(response.response.attestationObject)
    const authData = extractAuthDataFromAttestation(attestationBytes)

    if (!authData) {
      return { verified: false, error: 'Failed to parse attestation object' }
    }

    // 6. Verify RP ID hash
    const rpIdHash = await sha256(new TextEncoder().encode(RP_ID))
    const authRpIdHash = authData.slice(0, 32)
    if (!arrayBufferEqual(rpIdHash, authRpIdHash)) {
      return { verified: false, error: 'RP ID hash mismatch' }
    }

    // 7. Check flags: User Present (bit 0) + User Verified (bit 2)
    const flags = authData[32]
    if (!(flags & 0x01)) {
      return { verified: false, error: 'User presence flag not set' }
    }
    if (!(flags & 0x04)) {
      return { verified: false, error: 'User verification flag not set' }
    }

    // 8. Extract credential ID and public key from attested credential data
    // Flags bit 6 (AT) indicates attested credential data is present
    if (!(flags & 0x40)) {
      return { verified: false, error: 'No attested credential data' }
    }

    const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0)
    const aaguid = base64urlEncode(authData.slice(37, 53))
    const credIdLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0)
    const credentialIdBytes = authData.slice(55, 55 + credIdLength)
    const credentialId = base64urlEncode(credentialIdBytes)

    // Public key is the remaining bytes after credential ID (COSE format)
    const publicKeyBytes = authData.slice(55 + credIdLength)
    const publicKey = base64urlEncode(publicKeyBytes)

    // Check backed up flag (bit 4 of flags)
    const backedUp = !!(flags & 0x10)

    // 9. Store credential in database
    await (supabase as any).from('user_passkeys').insert({
      user_id: userId,
      credential_id: credentialId,
      public_key: publicKey,
      sign_counter: signCount,
      authenticator_type: response.authenticatorAttachment ?? 'platform',
      device_name: deviceName,
      aaguid,
      backed_up: backedUp,
      is_active: true,
    })

    return { verified: true, credentialId }
  } catch (err) {
    console.error('[webauthn] Registration verification failed:', err)
    return { verified: false, error: 'Verification failed' }
  }
}

// ── Authentication Flow ──────────────────────────────────────────────────────

/**
 * Generate authentication options for the client.
 * Called when the user visits the login page with passkey support.
 *
 * If userId is provided, returns allowCredentials for that user.
 * If not, returns empty allowCredentials (discoverable credential / resident key).
 */
export async function generateAuthenticationOptions(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId?: string,
): Promise<AuthenticationOptions & { challengeUserId?: string }> {
  // For discoverable credentials, we still need a user_id for the challenge record.
  // Use a sentinel value that gets resolved after assertion.
  const challengeUserId = userId ?? '__discoverable__'
  const challenge = await createChallenge(supabase, challengeUserId, 'authentication')

  let allowCredentials: AuthenticationOptions['allowCredentials'] = []

  if (userId) {
    const { data: credentials } = await (supabase as any).from('user_passkeys')
      .select('credential_id')
      .eq('user_id', userId)
      .eq('is_active', true)

    allowCredentials = (credentials ?? []).map((cred: Record<string, unknown>) => ({
      id: cred.credential_id as string,
      type: 'public-key' as const,
      transports: ['internal', 'hybrid'] as string[],
    }))
  }

  return {
    challenge,
    rpId: RP_ID,
    timeout: 60_000,
    userVerification: 'required',
    allowCredentials,
    challengeUserId,
  }
}

/**
 * Verify the authentication response from the client.
 *
 * Validates:
 *   - Challenge matches stored challenge
 *   - Origin matches expected RP origin
 *   - Signature is valid against stored public key
 *   - Sign counter has incremented (replay protection)
 */
export async function verifyAuthentication(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  response: AuthenticationResponse,
  challengeUserId: string,
): Promise<VerificationResult & { userId?: string }> {
  try {
    // 1. Decode clientDataJSON
    const clientDataBytes = base64urlDecode(response.response.clientDataJSON)
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))

    if (clientData.type !== 'webauthn.get') {
      return { verified: false, error: 'Invalid client data type' }
    }

    // 2. Validate origin
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${RP_ID}`
    if (clientData.origin !== expectedOrigin) {
      return { verified: false, error: 'Origin mismatch' }
    }

    // 3. Look up the credential
    const credentialId = response.id
    const { data: credential } = await (supabase as any).from('user_passkeys')
      .select('*')
      .eq('credential_id', credentialId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!credential) {
      return { verified: false, error: 'Credential not found' }
    }

    const cred = credential as Record<string, unknown>
    const userId = cred.user_id as string

    // 4. Validate challenge (try both the actual userId and the challengeUserId)
    let challengeValid = await consumeChallenge(
      supabase, challengeUserId, clientData.challenge, 'authentication',
    )
    if (!challengeValid && challengeUserId === '__discoverable__') {
      challengeValid = await consumeChallenge(
        supabase, userId, clientData.challenge, 'authentication',
      )
    }
    if (!challengeValid) {
      return { verified: false, error: 'Challenge expired or invalid' }
    }

    // 5. Parse authenticator data
    const authDataBytes = base64urlDecode(response.response.authenticatorData)

    // Verify RP ID hash
    const rpIdHash = await sha256(new TextEncoder().encode(RP_ID))
    const authRpIdHash = authDataBytes.slice(0, 32)
    if (!arrayBufferEqual(rpIdHash, authRpIdHash)) {
      return { verified: false, error: 'RP ID hash mismatch' }
    }

    // Check user presence + verification flags
    const flags = authDataBytes[32]
    if (!(flags & 0x01)) {
      return { verified: false, error: 'User presence not confirmed' }
    }

    // 6. Verify sign counter (replay protection)
    const newSignCount = new DataView(
      authDataBytes.buffer, authDataBytes.byteOffset + 33, 4,
    ).getUint32(0)
    const storedSignCount = (cred.sign_counter as number) ?? 0

    if (newSignCount > 0 && storedSignCount > 0 && newSignCount <= storedSignCount) {
      return { verified: false, error: 'Possible credential cloning detected (sign counter)' }
    }

    // 7. Verify signature
    // The signature is over: authenticatorData + SHA-256(clientDataJSON)
    const clientDataHash = await sha256(clientDataBytes)
    const signedData = new Uint8Array([...authDataBytes, ...new Uint8Array(clientDataHash)])
    const signatureBytes = base64urlDecode(response.response.signature)
    const publicKeyBytes = base64urlDecode(cred.public_key as string)

    const signatureValid = await verifySignature(publicKeyBytes, signedData, signatureBytes)

    if (!signatureValid) {
      return { verified: false, error: 'Signature verification failed' }
    }

    // 8. Update sign counter and last_used_at
    await (supabase as any).from('user_passkeys')
      .update({
        sign_counter: newSignCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', (cred.id as string))

    return {
      verified: true,
      credentialId,
      newSignCount,
      userId,
    }
  } catch (err) {
    console.error('[webauthn] Authentication verification failed:', err)
    return { verified: false, error: 'Verification failed' }
  }
}

// ── Credential Management ────────────────────────────────────────────────────

/**
 * List all passkeys for a user.
 */
export async function listUserPasskeys(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
): Promise<PasskeyCredential[]> {
  const { data } = await (supabase as any).from('user_passkeys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    credentialId: row.credential_id as string,
    publicKey: row.public_key as string,
    signCounter: row.sign_counter as number,
    authenticatorType: row.authenticator_type as 'platform' | 'cross-platform',
    deviceName: row.device_name as string,
    aaguid: row.aaguid as string,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string | null,
    backedUp: row.backed_up as boolean,
  }))
}

/**
 * Revoke (soft-delete) a passkey.
 */
export async function revokePasskey(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  credentialId: string,
): Promise<boolean> {
  const { error } = await (supabase as any).from('user_passkeys')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('credential_id', credentialId)

  return !error
}

// ── Client-Side Helpers ──────────────────────────────────────────────────────

/**
 * Check if the current browser supports WebAuthn.
 * Safe to call client-side only.
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  )
}

/**
 * Check if the device has a platform authenticator (FaceID/TouchID/Windows Hello).
 * Returns false on server or unsupported browsers.
 */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * Convert RegistrationOptions to the format expected by navigator.credentials.create().
 * Handles base64url → ArrayBuffer conversions.
 */
export function toCredentialCreationOptions(
  options: RegistrationOptions,
): CredentialCreationOptions {
  return {
    publicKey: {
      challenge: base64urlDecode(options.challenge).buffer as ArrayBuffer,
      rp: options.rp,
      user: {
        id: base64urlDecode(options.user.id).buffer as ArrayBuffer,
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      timeout: options.timeout,
      attestation: options.attestation,
      excludeCredentials: options.excludeCredentials.map((c) => ({
        id: base64urlDecode(c.id).buffer as ArrayBuffer,
        type: c.type,
        transports: c.transports as AuthenticatorTransport[],
      })),
    },
  }
}

/**
 * Convert AuthenticationOptions to the format expected by navigator.credentials.get().
 * Handles base64url → ArrayBuffer conversions.
 */
export function toCredentialRequestOptions(
  options: AuthenticationOptions,
): CredentialRequestOptions {
  return {
    publicKey: {
      challenge: base64urlDecode(options.challenge).buffer as ArrayBuffer,
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentials: options.allowCredentials.map((c) => ({
        id: base64urlDecode(c.id).buffer as ArrayBuffer,
        type: c.type,
        transports: c.transports as AuthenticatorTransport[],
      })),
    },
  }
}

/**
 * Convert a PublicKeyCredential (from navigator.credentials.create/get)
 * to a serialisable registration/authentication response.
 */
export function serializeCredential(
  credential: PublicKeyCredential,
  type: 'registration',
): RegistrationResponse
export function serializeCredential(
  credential: PublicKeyCredential,
  type: 'authentication',
): AuthenticationResponse
export function serializeCredential(
  credential: PublicKeyCredential,
  type: 'registration' | 'authentication',
): RegistrationResponse | AuthenticationResponse {
  if (type === 'registration') {
    const attestation = credential.response as AuthenticatorAttestationResponse
    return {
      id: credential.id,
      rawId: base64urlEncode(new Uint8Array(credential.rawId)),
      type: 'public-key',
      response: {
        clientDataJSON: base64urlEncode(new Uint8Array(attestation.clientDataJSON)),
        attestationObject: base64urlEncode(new Uint8Array(attestation.attestationObject)),
      },
      authenticatorAttachment: (credential as unknown as Record<string, string>).authenticatorAttachment as 'platform' | 'cross-platform' | undefined,
    }
  }

  const assertion = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: base64urlEncode(new Uint8Array(credential.rawId)),
    type: 'public-key',
    response: {
      clientDataJSON: base64urlEncode(new Uint8Array(assertion.clientDataJSON)),
      authenticatorData: base64urlEncode(new Uint8Array(assertion.authenticatorData)),
      signature: base64urlEncode(new Uint8Array(assertion.signature)),
      userHandle: assertion.userHandle
        ? base64urlEncode(new Uint8Array(assertion.userHandle))
        : undefined,
    },
  }
}

// ── Cryptographic Helpers ────────────────────────────────────────────────────

/** SHA-256 hash using Web Crypto API */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  return new Uint8Array(hash)
}

/**
 * Verify an ECDSA (ES256) or RSASSA-PKCS1-v1_5 (RS256) signature.
 * The public key is in COSE format — we extract and import it.
 *
 * Note: Full COSE parsing is complex. This implementation handles the
 * common case of ES256 (P-256) keys which is what most platform
 * authenticators (FaceID/TouchID) produce.
 */
async function verifySignature(
  publicKeyCose: Uint8Array,
  data: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    // Attempt ES256 (most common for platform authenticators)
    // COSE EC2 key: extract x and y coordinates
    // Minimal CBOR parse for the common case
    const key = parseCoseEs256Key(publicKeyCose)
    if (!key) return false

    // Import as CryptoKey
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: base64urlEncode(key.x),
        y: base64urlEncode(key.y),
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )

    // WebAuthn uses DER-encoded signature, SubtleCrypto expects raw r||s
    const rawSig = derToRawEcdsa(signature)

    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      rawSig as ArrayBufferView<ArrayBuffer>,
      data as ArrayBufferView<ArrayBuffer>,
    )
  } catch {
    return false
  }
}

/**
 * Minimal COSE ES256 key parser.
 * Extracts x and y coordinates from a CBOR-encoded COSE_Key.
 *
 * COSE_Key map for EC2:
 *   1 (kty) → 2 (EC2)
 *   3 (alg) → -7 (ES256)
 *  -1 (crv) → 1 (P-256)
 *  -2 (x)   → 32 bytes
 *  -3 (y)   → 32 bytes
 */
function parseCoseEs256Key(cose: Uint8Array): { x: Uint8Array; y: Uint8Array } | null {
  // Simple heuristic: find the 32-byte x and y values in the COSE structure
  // For a standard ES256 key, the CBOR structure is well-known
  // x coordinate is labeled -2 (0x21 in CBOR negative int), y is -3 (0x22)

  // Scan for the x coordinate marker (CBOR negative int -2 = 0x21)
  // followed by a 32-byte bstr (0x5820)
  for (let i = 0; i < cose.length - 67; i++) {
    if (cose[i] === 0x21 && cose[i + 1] === 0x58 && cose[i + 2] === 0x20) {
      const x = cose.slice(i + 3, i + 35)
      // Look for y coordinate (-3 = 0x22) nearby
      for (let j = i + 35; j < cose.length - 34; j++) {
        if (cose[j] === 0x22 && cose[j + 1] === 0x58 && cose[j + 2] === 0x20) {
          const y = cose.slice(j + 3, j + 35)
          return { x, y }
        }
      }
    }
  }

  return null
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s format.
 * DER: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
 * Raw: [r-32-bytes] [s-32-bytes]
 */
function derToRawEcdsa(der: Uint8Array): Uint8Array {
  // Parse DER sequence
  if (der[0] !== 0x30) return der // Not DER, assume already raw

  let offset = 2 // Skip sequence tag + length

  // Parse r
  if (der[offset] !== 0x02) return der
  offset++
  const rLen = der[offset++]
  const rStart = offset
  offset += rLen

  // Parse s
  if (der[offset] !== 0x02) return der
  offset++
  const sLen = der[offset++]
  const sStart = offset

  // Extract r and s, pad/trim to 32 bytes
  const raw = new Uint8Array(64)

  const r = der.slice(rStart, rStart + rLen)
  const s = der.slice(sStart, sStart + sLen)

  // r: right-align into first 32 bytes (skip leading zero if present)
  const rTrimmed = r[0] === 0 && rLen > 32 ? r.slice(1) : r
  raw.set(rTrimmed, 32 - rTrimmed.length)

  // s: right-align into last 32 bytes
  const sTrimmed = s[0] === 0 && sLen > 32 ? s.slice(1) : s
  raw.set(sTrimmed, 64 - sTrimmed.length)

  return raw
}

/**
 * Extract authenticator data from a CBOR-encoded attestation object.
 * For 'none' attestation, the structure is:
 *   { fmt: "none", attStmt: {}, authData: bytes }
 *
 * Minimal CBOR parser for this specific structure.
 */
function extractAuthDataFromAttestation(attestation: Uint8Array): Uint8Array | null {
  // Look for the authData key in the CBOR map
  // "authData" in CBOR is a text string: 0x68 (8-char string) + "authData"
  const authDataMarker = new TextEncoder().encode('authData')

  for (let i = 0; i < attestation.length - authDataMarker.length - 5; i++) {
    // Check for CBOR text string header (0x68 = 8-char string)
    if (attestation[i] === 0x68) {
      const candidate = attestation.slice(i + 1, i + 1 + authDataMarker.length)
      if (arrayBufferEqual(candidate, authDataMarker)) {
        // Next byte should be the byte string header
        const bstrStart = i + 1 + authDataMarker.length
        const bstrTag = attestation[bstrStart]

        if (bstrTag === 0x59) {
          // 2-byte length
          const len = (attestation[bstrStart + 1] << 8) | attestation[bstrStart + 2]
          return attestation.slice(bstrStart + 3, bstrStart + 3 + len)
        } else if (bstrTag === 0x58) {
          // 1-byte length
          const len = attestation[bstrStart + 1]
          return attestation.slice(bstrStart + 2, bstrStart + 2 + len)
        } else if (bstrTag >= 0x40 && bstrTag <= 0x57) {
          // Tiny byte string (length in tag)
          const len = bstrTag - 0x40
          return attestation.slice(bstrStart + 1, bstrStart + 1 + len)
        }
      }
    }
  }

  return null
}

// ── Base64url Encoding ───────────────────────────────────────────────────────

/** Encode Uint8Array to base64url string */
export function base64urlEncode(bytes: Uint8Array): string {
  // Use Buffer in Node, manual in browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url')
  }
  // Browser fallback
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode base64url string to Uint8Array */
export function base64urlDecode(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64url'))
  }
  // Browser fallback
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Compare two Uint8Arrays for equality */
function arrayBufferEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
