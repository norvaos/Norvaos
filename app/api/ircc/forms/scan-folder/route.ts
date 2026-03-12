import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FolderScanItem, FolderScanResult } from '@/lib/types/ircc-forms'

/**
 * POST /api/ircc/forms/scan-folder
 *
 * Scan the local IRCC forms folder (/public/ircc-forms/) and compare
 * against the database to detect new, updated, unchanged, and missing forms.
 *
 * NOTE: This reads from the server filesystem. Works in local development.
 * For production deployments with ephemeral filesystems (Vercel, etc.),
 * this could be adapted to scan a Supabase Storage bucket instead.
 */
export async function POST() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const tenantId = auth.tenantId

    // 1. Read all PDFs from the local folder
    const folderPath = join(process.cwd(), 'public', 'ircc-forms')
    let fileNames: string[]
    try {
      const entries = await readdir(folderPath)
      fileNames = entries.filter((f) => f.toLowerCase().endsWith('.pdf'))
    } catch {
      return NextResponse.json(
        { error: `Folder not found: public/ircc-forms/. Create it and add PDF files.` },
        { status: 400 },
      )
    }

    // 2. Compute checksums and metadata for each file
    const fileInfos: { fileName: string; formCode: string; checksum: string; size: number }[] = []
    for (const fileName of fileNames) {
      const filePath = join(folderPath, fileName)
      const fileBuffer = await readFile(filePath)
      const checksum = createHash('sha256').update(fileBuffer).digest('hex')
      const fileStat = await stat(filePath)
      const formCode = fileName.replace(/\.pdf$/i, '')
      fileInfos.push({ fileName, formCode, checksum, size: fileStat.size })
    }

    // 3. Query existing forms in DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()
    const { data: existingForms, error: dbError } = await supabase
      .from('ircc_forms')
      .select('id, form_code, form_name, checksum_sha256, file_size, current_version, form_date')
      .eq('tenant_id', tenantId)

    if (dbError) {
      return NextResponse.json(
        { error: `Failed to query existing forms: ${(dbError as Error).message}` },
        { status: 500 },
      )
    }

    // Also count fields per form
    const { data: fieldCounts } = await supabase
      .from('ircc_form_fields')
      .select('form_id')
      .in(
        'form_id',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((existingForms ?? []) as any[]).map((f: any) => f.id),
      )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldCountMap = new Map<string, number>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (fieldCounts ?? []) as any[]) {
      fieldCountMap.set(row.form_id, (fieldCountMap.get(row.form_id) ?? 0) + 1)
    }

    // Build lookup map by form_code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbFormMap = new Map<string, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const form of (existingForms ?? []) as any[]) {
      dbFormMap.set(form.form_code, form)
    }

    // 4. Categorize
    const items: FolderScanItem[] = []
    const folderCodes = new Set<string>()

    for (const info of fileInfos) {
      folderCodes.add(info.formCode)
      const dbForm = dbFormMap.get(info.formCode)

      if (!dbForm) {
        items.push({
          fileName: info.fileName,
          formCode: info.formCode,
          fileSizeBytes: info.size,
          checksumSha256: info.checksum,
          status: 'new',
        })
      } else if (dbForm.checksum_sha256 !== info.checksum) {
        items.push({
          fileName: info.fileName,
          formCode: info.formCode,
          fileSizeBytes: info.size,
          checksumSha256: info.checksum,
          status: 'updated',
          existingForm: {
            id: dbForm.id,
            form_code: dbForm.form_code,
            form_name: dbForm.form_name,
            checksum_sha256: dbForm.checksum_sha256,
            file_size: dbForm.file_size,
            field_count: fieldCountMap.get(dbForm.id) ?? 0,
            current_version: dbForm.current_version ?? 1,
            form_date: dbForm.form_date ?? null,
          },
        })
      } else {
        items.push({
          fileName: info.fileName,
          formCode: info.formCode,
          fileSizeBytes: info.size,
          checksumSha256: info.checksum,
          status: 'unchanged',
        })
      }
    }

    // Check for missing forms (in DB but not in folder)
    for (const [code, form] of dbFormMap.entries()) {
      if (!folderCodes.has(code)) {
        items.push({
          fileName: '',
          formCode: code,
          fileSizeBytes: 0,
          checksumSha256: '',
          status: 'missing',
          missingForm: {
            id: form.id,
            form_code: form.form_code,
            form_name: form.form_name,
          },
        })
      }
    }

    // Sort: new first, then updated, then unchanged, then missing
    const statusOrder: Record<string, number> = { new: 0, updated: 1, unchanged: 2, missing: 3 }
    items.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))

    const result: FolderScanResult = {
      folderPath: 'public/ircc-forms/',
      scannedAt: new Date().toISOString(),
      items,
      summary: {
        total: items.length,
        new: items.filter((i) => i.status === 'new').length,
        updated: items.filter((i) => i.status === 'updated').length,
        unchanged: items.filter((i) => i.status === 'unchanged').length,
        missing: items.filter((i) => i.status === 'missing').length,
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/scan-folder] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
