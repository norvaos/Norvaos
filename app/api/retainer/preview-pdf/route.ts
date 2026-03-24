import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import type { TemplateBody } from '@/lib/types/document-engine'
import type { RetainerPdfData } from '@/lib/utils/retainer-pdf'

/**
 * POST /api/retainer/preview-pdf
 *
 * Generates a retainer agreement PDF preview for the given lead.
 *
 * Priority:
 *  1. If a published "retainer-agreement" template exists → use template renderer
 *  2. Fallback → use hardcoded retainer PDF generator
 *
 * Returns the PDF as application/pdf bytes.
 *
 * Body: { leadId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')
    const supabase = createAdminClient()

    const { leadId, markAsSent } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    // ── 1. Fetch the latest non-cancelled retainer package ──────────────
    const { data: retainerPkgs, error: retainerErr } = await supabase
      .from('lead_retainer_packages')
      .select('*')
      .eq('lead_id', leadId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)

    if (retainerErr) throw retainerErr
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retainerPkg = (retainerPkgs as any)?.[0] ?? null
    if (!retainerPkg) {
      return NextResponse.json(
        { error: 'No retainer package found for this lead' },
        { status: 404 }
      )
    }

    // ── 2. Fetch lead + contact + matter type + tenant ─────────────────
    const { data: lead } = await supabase
      .from('leads')
      .select('*, contacts!leads_contact_id_fkey(first_name, last_name, email_primary, address_line1, address_line2)')
      .eq('id', leadId)
      .single()

    let matterTypeName: string | null = null
    if (retainerPkg.matter_type_id) {
      const { data: mt } = await supabase
        .from('matter_types')
        .select('name')
        .eq('id', retainerPkg.matter_type_id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matterTypeName = (mt as any)?.name ?? null
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, date_format, settings')
      .eq('id', auth.tenantId)
      .single()

    // ── 3. Fetch responsible lawyer ────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadData = lead as any
    let lawyerName = ''
    let lawyerEmail = ''
    let lawyerLsoNumber = ''
    if (leadData?.responsible_lawyer_id) {
      const { data: lawyer } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', leadData.responsible_lawyer_id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lawyerData = lawyer as any
      lawyerName = lawyerData?.full_name ?? ''
      lawyerEmail = lawyerData?.email ?? ''
    }

    // Build contact data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact = leadData?.contacts as {
      first_name: string
      last_name: string
      email_primary?: string | null
      address_line1?: string | null
      address_line2?: string | null
    } | null
    const clientName = contact
      ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
      : 'Client'
    const clientEmail = contact?.email_primary ?? ''
    const clientAddress = [contact?.address_line1, contact?.address_line2].filter(Boolean).join(', ')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantData = tenant as any

    // ── 4. Verification code ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let verificationCode = (retainerPkg as any).verification_code as string | null
    if (!verificationCode) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      verificationCode = `RET-${code.slice(0, 4)}-${code.slice(4)}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('lead_retainer_packages') as any)
        .update({ verification_code: verificationCode })
        .eq('id', retainerPkg.id)
    }

    // ── 5. Build RetainerPdfData (used by both generators) ────────────
    const retainerPdfData: RetainerPdfData = {
      firmName: tenantData?.name ?? 'Law Firm',
      firmAddress: tenantData?.settings?.address ?? null,
      clientName,
      clientEmail: clientEmail || null,
      matterType: matterTypeName,
      billingType: retainerPkg.billing_type ?? 'flat_fee',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lineItems: (retainerPkg.line_items as any[]) ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      governmentFees: (retainerPkg.government_fees as any[]) ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disbursements: (retainerPkg.disbursements as any[]) ?? [],
      hstApplicable: retainerPkg.hst_applicable ?? false,
      subtotalCents: retainerPkg.subtotal_cents ?? 0,
      taxAmountCents: retainerPkg.tax_amount_cents ?? 0,
      totalAmountCents: retainerPkg.total_amount_cents ?? 0,
      paymentTerms: retainerPkg.payment_terms,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentPlan: retainerPkg.payment_plan as any,
      verificationCode,
      dateFormat: tenantData?.date_format ?? null,
    }

    // ── 6. Try template-driven PDF first ──────────────────────────────
    let pdfBytes: Uint8Array | null = null

    try {
      // Look up the published Retainer Agreement template
      const { data: tmpl } = await supabase
        .from('docgen_templates')
        .select('id, current_version_id')
        .eq('tenant_id', auth.tenantId)
        .eq('template_key', 'retainer-agreement')
        .eq('status', 'published')
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tmplData = tmpl as any
      if (tmplData?.current_version_id) {
        const { data: version } = await supabase
          .from('document_template_versions')
          .select('template_body')
          .eq('id', tmplData.current_version_id)
          .single()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const templateBody = (version as any)?.template_body as TemplateBody | null

        if (templateBody?.sections?.length) {
          // Build merge fields
          const currency = retainerPdfData.currency ?? 'CAD'
          const fmtCents = (c: number) => new Intl.NumberFormat('en-CA', {
            style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
          }).format(c / 100)
          const fmtDollars = (d: number) => new Intl.NumberFormat('en-CA', {
            style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
          }).format(d)

          const profFeeTotal = retainerPdfData.lineItems.reduce(
            (sum, i) => sum + i.quantity * i.unitPrice, 0
          )
          const govFeeTotal = retainerPdfData.governmentFees.reduce(
            (sum, f) => sum + f.amount, 0
          )
          const disbTotal = retainerPdfData.disbursements.reduce(
            (sum, d) => sum + d.amount, 0
          )

          const fields: Record<string, string> = {
            firm_name: tenantData?.name ?? '',
            firm_address: tenantData?.settings?.address ?? '',
            firm_phone: tenantData?.settings?.phone ?? '',
            client_name: clientName,
            client_email: clientEmail,
            client_address: clientAddress,
            matter_title: matterTypeName ?? '',
            lawyer_name: lawyerName,
            lawyer_email: lawyerEmail,
            lawyer_lso_number: lawyerLsoNumber,
            current_date: new Date().toLocaleDateString('en-CA', {
              year: 'numeric', month: 'long', day: 'numeric',
            }),
            professional_fees: fmtDollars(profFeeTotal),
            ircc_fees: fmtDollars(govFeeTotal),
            disbursements: fmtDollars(disbTotal),
            hst_amount: fmtCents(retainerPdfData.taxAmountCents),
            total_amount: fmtCents(retainerPdfData.totalAmountCents),
            hourly_rate: retainerPdfData.billingType === 'hourly'
              ? (retainerPdfData.lineItems[0]?.unitPrice
                ? fmtDollars(retainerPdfData.lineItems[0].unitPrice) + '/hour'
                : '')
              : '',
          }

          // Payment plan installments
          if (retainerPdfData.paymentPlan) {
            for (let i = 0; i < retainerPdfData.paymentPlan.length; i++) {
              const inst = retainerPdfData.paymentPlan[i]
              fields[`installment_${i + 1}_amount`] = fmtDollars(inst.amount)
              fields[`installment_${i + 1}_due`] = inst.dueDate
                ? new Date(inst.dueDate).toLocaleDateString('en-CA', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })
                : inst.milestone || 'TBD'
            }
          }

          // Build conditions
          const conditions: Record<string, boolean> = {
            is_flat_fee: retainerPdfData.billingType === 'flat_fee',
            is_hourly: retainerPdfData.billingType === 'hourly',
            has_payment_schedule: !!(retainerPdfData.paymentPlan?.length),
            has_trust_retainer: false, // Not yet supported
          }

          const { renderTemplateToPdf } = await import('@/lib/utils/template-pdf-renderer')
          pdfBytes = await renderTemplateToPdf({
            templateBody,
            fields,
            conditions,
            retainerData: retainerPdfData,
          })

          console.log('[preview-pdf] Template-driven PDF generated successfully')
        }
      }
    } catch (templateErr) {
      console.warn('[preview-pdf] Template rendering failed, falling back to hardcoded:', templateErr)
      pdfBytes = null
    }

    // ── 7. Fallback: hardcoded retainer PDF ───────────────────────────
    if (!pdfBytes) {
      const { generateRetainerPdf } = await import('@/lib/utils/retainer-pdf')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfBytes = await generateRetainerPdf(retainerPdfData as any)
      console.log('[preview-pdf] Hardcoded PDF generated (no template found or template render failed)')
    }

    // ── 8. Mark as sent if requested (paper-based signing flow) ────────
    if (markAsSent) {
      console.log('[preview-pdf] Attempting to mark retainer as sent, pkg id:', retainerPkg.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sentErr } = await (supabase.from('lead_retainer_packages') as any)
        .update({
          status: 'sent',
          signing_method: 'paper',
          updated_at: new Date().toISOString(),
        })
        .eq('id', retainerPkg.id)

      if (sentErr) {
        console.error('[preview-pdf] Failed to mark as sent:', sentErr)
      } else {
        console.log('[preview-pdf] Retainer package marked as sent (paper signing)')
      }
    }

    // ── 9. Return PDF ─────────────────────────────────────────────────
    const pdfDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    const safeClientName = clientName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
    const safeMatterType = (matterTypeName ?? 'Retainer').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
    const pdfFilename = `${safeClientName} - ${safeMatterType} - ${pdfDate}.pdf`

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdfFilename}"`,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Preview retainer PDF error:', err)
    return NextResponse.json(
      { error: 'Failed to generate retainer PDF' },
      { status: 500 }
    )
  }
}
