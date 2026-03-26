import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { logPdfVaultAccess } from '@/lib/services/sentinel-audit'
import { decryptPdf } from '@/lib/ircc/pdf-encryption'

/**
 * POST /api/matters/[id]/vault-unlock
 *
 * Encrypted PDF Vault  -  Only the assigned lawyer or admin can unlock
 * a form pack PDF for download.
 *
 * For encrypted PDFs: downloads, decrypts with the matter's vault key,
 * and returns the decrypted PDF as a binary response.
 *
 * For unencrypted PDFs: returns a time-limited signed URL.
 *
 * Body: { versionId: string, artifactId: string }
 *
 * Security:
 *   - Must be the responsible_lawyer_id on the matter OR admin role
 *   - Every unlock is logged to sentinel_audit_log as PDF_VAULT_ACCESS
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const { id: matterId } = await params
    const body = await request.json()
    const { versionId, artifactId } = body as { versionId: string; artifactId: string }

    if (!versionId || !artifactId) {
      return NextResponse.json(
        { error: 'versionId and artifactId are required' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()

    // ── 1. Verify the user is the assigned lawyer or admin ─────────────

    const { data: matter } = await supabase
      .from('matters')
      .select('responsible_lawyer_id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (!matter) {
      throw new AuthError('Matter not found', 404)
    }

    const isAssignedLawyer = matter.responsible_lawyer_id === auth.userId
    const isAdmin = auth.role?.name &&
      ['admin', 'super_admin', 'superadmin'].includes(auth.role.name.toLowerCase())

    if (!isAssignedLawyer && !isAdmin) {
      logPdfVaultAccess({
        tenantId: auth.tenantId,
        userId: auth.userId,
        matterId,
        versionId,
        action: 'unlock',
      }).catch(() => {})

      throw new AuthError(
        'Only the assigned lawyer or admin can unlock form pack PDFs',
        403,
      )
    }

    // ── 2. Fetch the artifact with encryption metadata ───────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: artifact } = await (supabase as any)
      .from('form_pack_artifacts')
      .select('id, storage_path, file_name, is_final, checksum_sha256, is_encrypted, encryption_iv')
      .eq('id', artifactId)
      .eq('pack_version_id', versionId)
      .maybeSingle()

    if (!artifact) {
      throw new AuthError('Artifact not found', 404)
    }

    // ── 3. Log the vault access to SENTINEL ─────────────────────────────

    logPdfVaultAccess({
      tenantId: auth.tenantId,
      userId: auth.userId,
      matterId,
      versionId,
      action: 'download',
    }).catch(() => {})

    // ── 4. Handle encrypted vs unencrypted PDFs ─────────────────────────

    if (artifact.is_encrypted && artifact.encryption_iv) {
      // Fetch the vault key (admin client to bypass RLS on matter_vault_keys)
      const admin = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: vaultKeyRow } = await (admin as any)
        .from('matter_vault_keys')
        .select('encryption_key')
        .eq('matter_id', matterId)
        .eq('tenant_id', auth.tenantId)
        .order('key_version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!vaultKeyRow?.encryption_key) {
        return NextResponse.json(
          { error: 'Vault key not found  -  cannot decrypt' },
          { status: 500 },
        )
      }

      // Download encrypted bytes from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(artifact.storage_path)

      if (downloadError || !fileData) {
        return NextResponse.json(
          { error: 'Failed to download encrypted PDF' },
          { status: 500 },
        )
      }

      const encryptedBytes = new Uint8Array(await fileData.arrayBuffer())

      // Decrypt
      const decryptedBytes = decryptPdf({
        encryptedBytes,
        key: vaultKeyRow.encryption_key,
        iv: artifact.encryption_iv,
      })

      // Return decrypted PDF as binary response
      return new NextResponse(Buffer.from(decryptedBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${artifact.file_name}"`,
          'Content-Length': String(decryptedBytes.length),
          'X-Vault-Encrypted': 'true',
          'X-Vault-Decrypted': 'true',
        },
      })
    }

    // ── 5. Unencrypted: return signed URL ───────────────────────────────

    const { data: signedUrl, error: signError } = await supabase.storage
      .from('documents')
      .createSignedUrl(artifact.storage_path, 300) // 5 minutes

    if (signError || !signedUrl) {
      console.error('[vault-unlock] Failed to create signed URL:', signError?.message)
      return NextResponse.json(
        { error: 'Failed to generate download link' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      signedUrl: signedUrl.signedUrl,
      fileName: artifact.file_name,
      checksum: artifact.checksum_sha256,
      expiresIn: 300,
      isFinal: artifact.is_final,
      isEncrypted: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[vault-unlock] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/vault-unlock')
