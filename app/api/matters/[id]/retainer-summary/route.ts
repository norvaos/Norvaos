import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Shared: resolve retainer package for a matter ─────────────────────────────

async function resolveRetainerPackage(
  supabase: Awaited<ReturnType<typeof authenticateRequest>>['supabase'],
  tenantId: string,
  matterId: string,
) {
  // Step 1: Get matter + originating_lead_id
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select('id, originating_lead_id')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (matterErr || !matter) return { error: 'Matter not found', status: 404 }
  if (!matter.originating_lead_id) return { error: 'no_retainer', status: 200 }

  // Step 2: Get the signed/fully_retained retainer package for this lead
  const { data: pkg, error: pkgErr } = await supabase
    .from('lead_retainer_packages')
    .select(
      'id, lead_id, status, payment_status, billing_type, line_items, government_fees, disbursements, hst_applicable, subtotal_cents, tax_amount_cents, total_amount_cents, payment_amount, payment_method, payment_received_at, payment_terms, payment_plan, signed_at',
    )
    .eq('lead_id', matter.originating_lead_id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pkgErr) return { error: 'Failed to fetch retainer package', status: 500 }
  if (!pkg) return { error: 'no_retainer', status: 200 }

  return { pkg, leadId: matter.originating_lead_id }
}

// ── GET /api/matters/[id]/retainer-summary ────────────────────────────────────

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'billing', 'view')

    const result = await resolveRetainerPackage(admin, auth.tenantId, matterId)

    if ('error' in result && result.error === 'no_retainer') {
      return NextResponse.json({ retainerSummary: null })
    }

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { pkg, leadId } = result

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pkg as any
    const totalPaid = Number(p.payment_amount ?? 0)
    const totalOwed = Number(p.total_amount_cents ?? 0)

    return NextResponse.json({
      retainerSummary: {
        id: p.id,
        leadId,
        status: p.status,
        paymentStatus: p.payment_status,
        billingType: p.billing_type,
        lineItems: p.line_items ?? [],
        governmentFees: p.government_fees ?? [],
        disbursements: p.disbursements ?? [],
        hstApplicable: p.hst_applicable ?? false,
        subtotalCents: Number(p.subtotal_cents ?? 0),
        taxAmountCents: Number(p.tax_amount_cents ?? 0),
        totalAmountCents: totalOwed,
        paymentAmount: totalPaid,
        balanceCents: Math.max(totalOwed - totalPaid, 0),
        paymentMethod: p.payment_method ?? null,
        paymentReceivedAt: p.payment_received_at ?? null,
        paymentTerms: p.payment_terms ?? null,
        paymentPlan: p.payment_plan ?? null,
        signedAt: p.signed_at ?? null,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[retainer-summary] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/matters/[id]/retainer-summary ───────────────────────────────────
// Records a payment against the retainer package directly from the matter page.
// The lead has already been converted  -  no conversion logic is triggered here.

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'billing', 'edit')

    const body = await request.json()
    const { amount, paymentMethod, reference } = body as {
      amount: number
      paymentMethod: string
      reference?: string
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount (cents) is required and must be positive' }, { status: 400 })
    }
    if (!paymentMethod) {
      return NextResponse.json({ error: 'paymentMethod is required' }, { status: 400 })
    }

    const result = await resolveRetainerPackage(admin, auth.tenantId, matterId)

    if ('error' in result && result.error === 'no_retainer') {
      return NextResponse.json({ error: 'No retainer package found for this matter' }, { status: 404 })
    }
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { pkg } = result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pkg as any
    const previouslyPaid = Number(p.payment_amount ?? 0)
    const totalPaid = previouslyPaid + amount
    const totalOwed = Number(p.total_amount_cents ?? 0)
    const isFullyPaid = totalOwed > 0 ? totalPaid >= totalOwed : true
    const balance = Math.max(totalOwed - totalPaid, 0)
    const now = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('lead_retainer_packages') as any)
      .update({
        payment_status: isFullyPaid ? 'paid' : 'partial',
        payment_amount: totalPaid,
        payment_method: paymentMethod,
        payment_received_at: now,
        updated_at: now,
      })
      .eq('id', p.id)
      .eq('tenant_id', auth.tenantId)

    // Activity log on the matter
    const amountFmt = `$${(amount / 100).toFixed(2)}`
    const balanceFmt = `$${(balance / 100).toFixed(2)}`

    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      activity_type: 'retainer_payment_recorded',
      title: `Payment recorded: ${amountFmt}${!isFullyPaid ? ` (balance: ${balanceFmt})` : '  -  paid in full'}`,
      description: [
        `Payment: ${amountFmt} via ${paymentMethod}`,
        reference ? `Reference: ${reference}` : null,
        `Total paid: $${(totalPaid / 100).toFixed(2)}`,
        !isFullyPaid ? `Balance remaining: ${balanceFmt}` : null,
      ]
        .filter(Boolean)
        .join('. '),
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: {
        retainer_package_id: p.id,
        amount,
        total_paid: totalPaid,
        total_owed: totalOwed,
        balance,
        payment_method: paymentMethod,
        reference: reference ?? null,
        is_fully_paid: isFullyPaid,
      },
    })

    return NextResponse.json({
      success: true,
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      totalPaid,
      totalOwed,
      balance,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[retainer-summary] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/retainer-summary')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/retainer-summary')

const admin = createAdminClient()