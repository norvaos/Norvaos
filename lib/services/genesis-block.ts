/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Genesis Block Service  -  Directive 015 / 015.1: Sovereign Birth Certificate
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The "Digital Notary" of NorvaOS. When a Lead becomes a Client, the Genesis
 * Protocol permanently seals a compliance snapshot capturing:
 *
 *   • Conflict Check clearance (scan ID, global search ID, justification)
 *   • KYC/Identity verification (status, SHA-256 of ID, verified_at timestamp)
 *   • Retainer Agreement hash (SHA-256 of signed PDF)
 *   • Initial trust balance ($0.00 or deposit parity)
 *   • Last trust audit hash (chain-link to firm's financial history)
 *
 * 015.1 Enhancements:
 *   • Idempotent  -  cannot overwrite, only revoke with Partner-level audit trail
 *   • Sequence violation detection (conflict check after retainer = amber)
 *   • Revocation requires Partner/Admin role + documented reason
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────────────

type GenesisMetadataRow = Database['public']['Tables']['matter_genesis_metadata']['Row']

export interface GenesisBlockResult {
  success: boolean
  data?: GenesisMetadataRow
  error?: string
}

export interface GenesisBlockStatus {
  exists: boolean
  genesis: GenesisMetadataRow | null
  isCompliant: boolean
  hasSequenceViolation: boolean
  isRevoked: boolean
  complianceNotes: string | null
  generatedAt: string | null
  genesisHash: string | null
}

// ─── Table accessor ─────────────────────────────────────────────────────────

const from = {
  genesis: (c: SupabaseClient<Database>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as SupabaseClient<any>).from('matter_genesis_metadata'),
}

// ─── Generate Genesis Block ─────────────────────────────────────────────────

/**
 * Generates the immutable genesis block for a matter via the PostgreSQL RPC.
 * Idempotent: raises error if genesis already exists (use revocation first).
 */
export async function generateGenesisBlock(params: {
  tenantId: string
  matterId: string
  userId: string
  conflictSearchId: string  // Directive 032: mandatory conflict clearance link
}): Promise<GenesisBlockResult> {
  const { tenantId, matterId, userId, conflictSearchId } = params

  try {
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as SupabaseClient<any>).rpc(
      'fn_generate_matter_genesis_block',
      {
        p_matter_id: matterId,
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_conflict_search_id: conflictSearchId,
      },
    )

    if (error) {
      if (error.message?.includes('already exists')) {
        return { success: false, error: 'Genesis block already exists for this matter. Use revocation to regenerate.' }
      }
      return { success: false, error: error.message }
    }

    return { success: true, data: data as GenesisMetadataRow }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error generating genesis block'
    return { success: false, error: message }
  }
}

// ─── Revoke Genesis Block (Partner-Level) ───────────────────────────────────

/**
 * Revokes a genesis block via the PostgreSQL RPC. Requires Partner/Admin role.
 * The block is not deleted  -  it is marked as revoked with an audit trail.
 * After revocation, a new genesis block can be generated.
 */
export async function revokeGenesisBlock(params: {
  tenantId: string
  matterId: string
  userId: string
  reason: string
}): Promise<GenesisBlockResult> {
  const { tenantId, matterId, userId, reason } = params

  if (!reason || reason.trim().length < 10) {
    return { success: false, error: 'Revocation reason must be at least 10 characters.' }
  }

  try {
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as SupabaseClient<any>).rpc(
      'fn_revoke_genesis_block',
      {
        p_matter_id: matterId,
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_reason: reason.trim(),
      },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as GenesisMetadataRow }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error revoking genesis block'
    return { success: false, error: message }
  }
}

// ─── Get Genesis Block ──────────────────────────────────────────────────────

/**
 * Fetches the genesis block for a matter. Uses the user's RLS-scoped client.
 */
export async function getGenesisBlock(
  supabase: SupabaseClient<Database>,
  matterId: string,
): Promise<GenesisBlockStatus> {
  const { data, error } = await from.genesis(supabase)
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (error) {
    console.error('[genesis-block] Fetch error:', error)
    return {
      exists: false,
      genesis: null,
      isCompliant: false,
      hasSequenceViolation: false,
      isRevoked: false,
      complianceNotes: null,
      generatedAt: null,
      genesisHash: null,
    }
  }

  const genesis = data as GenesisMetadataRow | null

  if (!genesis) {
    return {
      exists: false,
      genesis: null,
      isCompliant: false,
      hasSequenceViolation: false,
      isRevoked: false,
      complianceNotes: null,
      generatedAt: null,
      genesisHash: null,
    }
  }

  return {
    exists: true,
    genesis,
    isCompliant: genesis.is_compliant,
    hasSequenceViolation: genesis.has_sequence_violation,
    isRevoked: genesis.is_revoked,
    complianceNotes: genesis.compliance_notes,
    generatedAt: genesis.generated_at,
    genesisHash: genesis.genesis_hash,
  }
}

// ─── Verify Genesis Block Integrity ─────────────────────────────────────────

/**
 * Recomputes the SHA-256 hash of the stored genesis_payload and compares
 * it to the stored genesis_hash. Returns true if the block is untampered.
 */
export async function verifyGenesisBlockIntegrity(
  supabase: SupabaseClient<Database>,
  matterId: string,
): Promise<{ valid: boolean; storedHash: string | null; computedHash: string | null }> {
  const { data, error } = await from.genesis(supabase)
    .select('genesis_payload, genesis_hash')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (error || !data) {
    return { valid: false, storedHash: null, computedHash: null }
  }

  const genesis = data as { genesis_payload: Record<string, unknown>; genesis_hash: string }

  let computedHash: string

  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const encoder = new TextEncoder()
    const payload = encoder.encode(JSON.stringify(genesis.genesis_payload))
    const hashBuffer = await crypto.subtle.digest('SHA-256', payload)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } else {
    const { createHash } = await import('crypto')
    computedHash = createHash('sha256').update(JSON.stringify(genesis.genesis_payload)).digest('hex')
  }

  return {
    valid: computedHash === genesis.genesis_hash,
    storedHash: genesis.genesis_hash,
    computedHash,
  }
}
