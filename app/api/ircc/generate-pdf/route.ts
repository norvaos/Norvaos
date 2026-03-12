import { NextResponse } from 'next/server'
import { readFile, mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PDFDocument } from 'pdf-lib'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { fillIRCCForm } from '@/lib/ircc/pdf-filler'
import { fillXFAFormFromDB } from '@/lib/ircc/xfa-filler-db-server'
import { checkTenantLimit, rateLimitResponse } from '@/lib/middleware/tenant-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/ircc/generate-pdf
 *
 * Generates a filled IRCC PDF for a given contact and form code.
 *
 * Body: { contactId: string, formCode: string }
 *
 * Form code is validated against ircc_forms in the DB — any active form the
 * tenant has uploaded is accepted (not a hardcoded allow-list).
 *
 * Template loading order:
 *   1. public/ircc-forms/<formCode>.pdf  (local, for dev convenience)
 *   2. Supabase Storage via ircc_forms.storage_path  (production path)
 *
 * IMPORTANT: This route has ZERO silent fallbacks.
 * - If the template PDF is missing from both local and storage → 500
 * - If the XFA fill engine fails → 502
 *
 * For the controlled form pack workflow (versioning, approval, watermark),
 * use the Action Executor via POST /api/actions/generate_form_pack instead.
 */
async function handlePost(request: Request) {
  try {
    // 1. Authenticate
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')

    const limit = await checkTenantLimit(auth.tenantId, 'ircc/generate-pdf')
    if (!limit.allowed) return rateLimitResponse(limit)

    // 2. Parse + validate body
    const body = await request.json()
    const { contactId, formCode } = body as {
      contactId?: string
      formCode?: string
    }

    if (!contactId || typeof contactId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'contactId is required' },
        { status: 400 },
      )
    }

    if (!formCode || typeof formCode !== 'string') {
      return NextResponse.json(
        { success: false, error: 'formCode is required' },
        { status: 400 },
      )
    }

    // 3. Validate form code against DB — any active form for this tenant is valid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dbForm, error: dbFormError } = await (auth.supabase as any)
      .from('ircc_forms')
      .select('id, form_code, storage_path, is_xfa')
      .eq('form_code', formCode)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (dbFormError || !dbForm) {
      return NextResponse.json(
        {
          success: false,
          error: `Form "${formCode}" not found. Upload and activate it in Settings → IRCC Form Library first.`,
          formCode,
        },
        { status: 404 },
      )
    }

    // 4. Fetch contact's immigration_data and the current user's name for signature
    const { data: contact, error: contactError } = await auth.supabase
      .from('contacts')
      .select('id, first_name, last_name, immigration_data')
      .eq('id', contactId)
      .single()

    // Fetch current user's name for the "Use of Representative" signature
    const { data: currentUser } = await auth.supabase
      .from('users')
      .select('first_name, last_name')
      .eq('auth_user_id', auth.userId)
      .single()
    const representativeName = currentUser
      ? [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ')
      : ''

    if (contactError || !contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 },
      )
    }

    const profile =
      (contact.immigration_data as Record<string, unknown>) ?? {}

    // 5. Load blank PDF template
    //    Try local public/ircc-forms/ first (dev convenience), then Supabase Storage.
    let pdfBytes: Uint8Array
    let tmpDir: string | null = null

    const localTemplatePath = join(
      process.cwd(),
      'public',
      'ircc-forms',
      `${formCode}.pdf`,
    )

    let resolvedTemplatePath: string
    let blankPdfBytes: Uint8Array

    try {
      const buf = await readFile(localTemplatePath)
      blankPdfBytes = new Uint8Array(buf)
      resolvedTemplatePath = localTemplatePath
    } catch {
      // Local file missing — download from Supabase Storage
      const { data: storageBlob, error: storageErr } = await auth.supabase.storage
        .from('documents')
        .download(dbForm.storage_path)

      if (storageErr || !storageBlob) {
        console.error(`[generate-pdf] Template not found locally or in storage for ${formCode}`)
        return NextResponse.json(
          {
            success: false,
            error: `Template for ${formCode} not found in storage. Re-upload the form in Settings → IRCC Form Library.`,
            formCode,
          },
          { status: 500 },
        )
      }

      blankPdfBytes = new Uint8Array(await (storageBlob as Blob).arrayBuffer())
      tmpDir = await mkdtemp(join(tmpdir(), 'ircc-gen-'))
      resolvedTemplatePath = join(tmpDir, `${formCode}.pdf`)
      await writeFile(resolvedTemplatePath, blankPdfBytes)
    }

    try {
      // Check if the PDF has standard AcroForm fields (XFA forms won't have these)
      const testDoc = await PDFDocument.load(blankPdfBytes, { ignoreEncryption: true })
      const fieldCount = testDoc.getForm().getFields().length

      if (fieldCount > 0) {
        // Template has fillable AcroForm fields — fill them with pdf-lib
        pdfBytes = await fillIRCCForm(blankPdfBytes, profile, formCode)
      } else {
        // Template is XFA-based — fill via DB-driven XFA engine (pikepdf/Python)
        // CRITICAL: No fallback to summary PDF for IRCC forms.
        console.log(
          `[generate-pdf] ${formCode} is XFA. Using DB-driven fill (form id: ${dbForm.id})`,
        )

        const xfaResult = await fillXFAFormFromDB(
          resolvedTemplatePath, dbForm.id, profile, auth.supabase, representativeName,
        )
        if (xfaResult) {
          pdfBytes = xfaResult.bytes
        } else {
          console.error(`[generate-pdf] XFA fill engine returned null for ${formCode}. No fallback.`)
          return NextResponse.json(
            {
              success: false,
              error: 'IRCC form generation failed. The XFA fill engine did not produce output. ' +
                     'Ensure Python 3 and pikepdf are available in the runtime environment.',
              formCode,
            },
            { status: 502 },
          )
        }
      }
    } finally {
      // Clean up temp dir if we created one for the storage download
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }

    // 6. Build filename
    const clientName = [contact.first_name, contact.last_name]
      .filter(Boolean)
      .join('_')
      .replace(/\s+/g, '_') || 'client'
    const dateStamp = new Date().toISOString().split('T')[0]
    const filename = `${formCode}_${clientName}_${dateStamp}.pdf`

    // 7. Return PDF response
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[generate-pdf] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/ircc/generate-pdf')
