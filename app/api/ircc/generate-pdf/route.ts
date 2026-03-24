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
import { createAdminClient } from '@/lib/supabase/admin'

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
    const admin = createAdminClient()
    requirePermission(auth, 'form_packs', 'create')

    const limit = await checkTenantLimit(auth.tenantId, 'ircc/generate-pdf')
    if (!limit.allowed) return rateLimitResponse(limit)

    // 2. Parse + validate body
    const body = await request.json()
    const { contactId, matterId, personRole = 'principal_applicant', formCode } = body as {
      contactId?: string
      matterId?: string   // preferred — reads matter-scoped profile
      personRole?: string // which person in the matter (default: principal_applicant)
      formCode?: string
    }

    if (!contactId && !matterId) {
      return NextResponse.json(
        { success: false, error: 'Either contactId or matterId is required' },
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
    const { data: dbForm, error: dbFormError } = await (admin as any)
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

    // 4. Resolve profile — matter-scoped takes priority over contact canonical
    //
    //   Path A (preferred): matterId provided → read matter_people.profile_data
    //     for the specified person_role. This is the matter-scoped snapshot.
    //
    //   Path B (legacy fallback): only contactId provided → read
    //     contacts.immigration_data. Kept for backward compatibility.

    let profile: Record<string, unknown> = {}
    let contactFirstName = ''
    let contactLastName = ''

    // Fetch current user's name for the "Use of Representative" signature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentUser } = await (admin as any)
      .from('users')
      .select('first_name, last_name')
      .eq('auth_user_id', auth.userId)
      .single() as { data: { first_name: string | null; last_name: string | null } | null; error: unknown }
    const representativeName = currentUser
      ? [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ')
      : ''

    if (matterId) {
      // Path A0: Try instance-based resolution first (new engine)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: formInstance } = await (admin as any)
        .from('matter_form_instances')
        .select('id, answers')
        .eq('matter_id', matterId)
        .eq('form_id', dbForm.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (formInstance?.id && formInstance.answers && Object.keys(formInstance.answers as object).length > 0) {
        // Use instance answers — flatten AnswerMap to profile shape
        const instanceAnswers = formInstance.answers as Record<string, { value: unknown }>
        for (const [path, record] of Object.entries(instanceAnswers)) {
          if (record?.value !== null && record?.value !== undefined) {
            profile[path] = record.value
          }
        }
      }

      // Path A1: matter-scoped profile (person.profile_data)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: person, error: personError } = await (admin as any)
        .from('matter_people')
        .select('id, first_name, last_name, profile_data, is_locked, contact_id')
        .eq('matter_id', matterId)
        .eq('person_role', personRole)
        .eq('is_active', true)
        .maybeSingle() as {
          data: { id: string; first_name: string; last_name: string; profile_data: Record<string, unknown> | null; is_locked: boolean; contact_id: string | null } | null
          error: Error | null
        }

      if (personError || !person) {
        return NextResponse.json(
          {
            success: false,
            error: `No ${personRole} found in matter ${matterId}. Add the person to the matter first.`,
          },
          { status: 404 },
        )
      }

      contactFirstName = person.first_name
      contactLastName  = person.last_name

      // If instance answers didn't populate profile, try person.profile_data
      if (Object.keys(profile).length === 0) {
        profile = (person.profile_data as Record<string, unknown>) ?? {}
      }

      // If profile_data is also empty but a contact_id exists, fall back to
      // contacts.immigration_data as a last resort. Staff should
      // run snapshot_contact_profile_to_matter to populate properly.
      if (Object.keys(profile).length === 0 && person.contact_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fallback } = await (admin as any)
          .from('contacts')
          .select('immigration_data')
          .eq('id', person.contact_id)
          .single() as { data: { immigration_data: Record<string, unknown> | null } | null; error: unknown }
        if (fallback?.immigration_data) {
          profile = fallback.immigration_data
        }
      }
    } else {
      // Path B: legacy — contact-level canonical profile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contact, error: contactError } = await (admin as any)
        .from('contacts')
        .select('id, first_name, last_name, immigration_data')
        .eq('id', contactId as string)
        .single() as {
          data: { id: string; first_name: string | null; last_name: string | null; immigration_data: Record<string, unknown> | null } | null
          error: Error | null
        }

      if (contactError || !contact) {
        return NextResponse.json(
          { success: false, error: 'Contact not found' },
          { status: 404 },
        )
      }

      profile          = contact.immigration_data ?? {}
      contactFirstName = contact.first_name ?? ''
      contactLastName  = contact.last_name  ?? ''
    }

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
      const { data: storageBlob, error: storageErr } = await admin.storage
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
          resolvedTemplatePath, dbForm.id, profile, admin, representativeName,
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
    const clientName = [contactFirstName, contactLastName]
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
