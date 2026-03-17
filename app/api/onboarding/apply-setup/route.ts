import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInternalEmail } from '@/lib/services/email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'
import type { Json } from '@/lib/types/database'

const schema = z.object({
  firmName:          z.string().min(1),
  logoUrl:           z.string().url().nullable().optional(),
  practiceAreas:     z.array(z.string()).optional(),
  currency:          z.enum(['CAD', 'USD']).optional(),
  flatFeeDefault:    z.number().nullable().optional(),
  hourlyRateDefault: z.number().nullable().optional(),
  primaryColour:     z.string().optional(),
  emailFooter:       z.string().optional(),
  seedMatterTypes:   z.boolean().optional(),
  lawyerFirstName:   z.string().optional(),
  lawyerLastName:    z.string().optional(),
  lawyerEmail:       z.string().email().optional(),
  lawyerBarNumber:   z.string().optional(),
})

type ApplySetupBody = z.infer<typeof schema>

const j = (v: Record<string, unknown>): Json => v as unknown as Json

/**
 * POST /api/onboarding/apply-setup
 *
 * Applies the 7-step simplified onboarding answers to the tenant record.
 *
 * Actions:
 *  1. Update tenants row (name, logo_url, primary_color, currency, settings)
 *  2. Enable selected practice areas (upsert)
 *  3. Seed 3 default Immigration matter types if seedMatterTypes = true
 *  4. Create/invite first lawyer if email differs from current user
 *
 * Idempotent — safe to call multiple times.
 */
async function handlePost(request: Request) {
  try {
    const auth  = await authenticateRequest()
    const admin = createAdminClient()

    const body   = await request.json() as unknown
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const data: ApplySetupBody = parsed.data

    // ── 1. Update tenant row ────────────────────────────────────────────────

    // Fetch current settings to merge
    const { data: tenantRow } = await admin
      .from('tenants')
      .select('settings, name')
      .eq('id', auth.tenantId)
      .single()

    const currentSettings = (tenantRow?.settings as Record<string, unknown>) ?? {}

    const billingConfig: Record<string, unknown> = {
      ...(currentSettings.billing_config as Record<string, unknown> ?? {}),
      billing_enabled:           true,
      trust_accounting_enabled:  false,
      default_payment_term_days: 30,
    }
    if (data.currency) billingConfig.currency = data.currency
    if (data.flatFeeDefault != null)    billingConfig.flat_fee_default     = data.flatFeeDefault
    if (data.hourlyRateDefault != null) billingConfig.hourly_rate_default  = data.hourlyRateDefault

    const updatedSettings: Record<string, unknown> = {
      ...currentSettings,
      billing_config: billingConfig,
    }

    if (data.emailFooter) {
      updatedSettings.email_footer = data.emailFooter
    }

    const tenantUpdate: Record<string, unknown> = {
      name:     data.firmName,
      settings: j(updatedSettings),
    }
    if (data.logoUrl)       tenantUpdate.logo_url      = data.logoUrl
    if (data.currency)      tenantUpdate.currency      = data.currency
    if (data.primaryColour) tenantUpdate.primary_color = data.primaryColour

    const { error: tenantErr } = await admin
      .from('tenants')
      .update(tenantUpdate as never)
      .eq('id', auth.tenantId)

    if (tenantErr) throw tenantErr

    // ── 2. Enable practice areas ────────────────────────────────────────────

    if (data.practiceAreas && data.practiceAreas.length > 0) {
      for (const areaName of data.practiceAreas) {
        const { error: paErr } = await admin
          .from('practice_areas')
          .upsert(
            {
              tenant_id:  auth.tenantId,
              name:       areaName,
              color:      '#6366f1',
              is_enabled: true,
            } as never,
            { onConflict: 'tenant_id,name', ignoreDuplicates: false }
          )
        if (paErr) {
          // Log but don't fail — practice areas may need to be set up later
          console.error('[apply-setup] Failed to upsert practice area:', paErr.message)
        }
      }
    }

    // ── 3. Seed immigration matter types ────────────────────────────────────

    if (data.seedMatterTypes) {
      const DEFAULT_MATTER_TYPES = [
        { name: 'Study Permit',   description: 'Temporary resident permit for students studying in Canada.' },
        { name: 'Work Permit',    description: 'Permit authorising foreign nationals to work in Canada.' },
        { name: 'PR Application', description: 'Permanent Residency application under Express Entry or Provincial Nominee Program.' },
      ]

      // Find or create Immigration practice area
      const { data: immigrationPA } = await admin
        .from('practice_areas')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .ilike('name', 'Immigration')
        .maybeSingle()

      if (immigrationPA?.id) {
        for (const mt of DEFAULT_MATTER_TYPES) {
          // Check if matter type already exists
          const { data: existingMT } = await admin
            .from('matter_types')
            .select('id')
            .eq('tenant_id', auth.tenantId)
            .ilike('name', mt.name)
            .maybeSingle()

          if (existingMT) continue // idempotent

          const { data: newMT, error: mtErr } = await admin
            .from('matter_types')
            .insert({
              tenant_id:        auth.tenantId,
              practice_area_id: immigrationPA.id,
              name:             mt.name,
              color:            '#6366f1',
              is_active:        true,
              sort_order:       DEFAULT_MATTER_TYPES.indexOf(mt) + 1,
            } as never)
            .select('id')
            .single()

          if (mtErr || !newMT?.id) continue

          // Create default pipeline
          const { data: pipeline, error: plErr } = await admin
            .from('matter_stage_pipelines')
            .insert({
              tenant_id:     auth.tenantId,
              matter_type_id: newMT.id,
              name:          'Default',
              is_default:    true,
              is_active:     true,
            } as never)
            .select('id')
            .single()

          if (plErr || !pipeline?.id) continue

          // Create 3 starter stages
          await admin.from('matter_stages').insert([
            { tenant_id: auth.tenantId, pipeline_id: pipeline.id, name: 'Intake', color: '#64748b', sort_order: 1, is_terminal: false, auto_close_matter: false },
            { tenant_id: auth.tenantId, pipeline_id: pipeline.id, name: 'Active', color: '#3b82f6', sort_order: 2, is_terminal: false, auto_close_matter: false },
            { tenant_id: auth.tenantId, pipeline_id: pipeline.id, name: 'Closed', color: '#10b981', sort_order: 3, is_terminal: true,  auto_close_matter: true  },
          ] as never)
        }
      }
    }

    // ── 4. Invite first lawyer ──────────────────────────────────────────────

    if (data.lawyerEmail && data.lawyerFirstName && data.lawyerLastName) {
      // Check if the email matches the current user — no invite needed
      const { data: currentUser } = await admin
        .from('users')
        .select('email')
        .eq('id', auth.userId)
        .single()

      const isSelf = currentUser?.email?.toLowerCase() === data.lawyerEmail.toLowerCase()

      if (!isSelf) {
        // Check for duplicates
        const [{ data: existingUser }, { data: existingInvite }] = await Promise.all([
          admin.from('users').select('id').eq('tenant_id', auth.tenantId).ilike('email', data.lawyerEmail).maybeSingle(),
          admin.from('user_invites').select('id').eq('tenant_id', auth.tenantId).ilike('email', data.lawyerEmail).eq('status', 'pending').maybeSingle(),
        ])

        if (!existingUser && !existingInvite) {
          // Find lawyer role
          const { data: lawyerRole } = await admin
            .from('roles')
            .select('id')
            .eq('tenant_id', auth.tenantId)
            .ilike('name', 'Lawyer')
            .maybeSingle()

          const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`

          await admin.from('user_invites').insert({
            tenant_id:  auth.tenantId,
            email:      data.lawyerEmail,
            first_name: data.lawyerFirstName,
            last_name:  data.lawyerLastName,
            role_id:    lawyerRole?.id ?? null,
            token,
            invited_by: auth.userId,
          } as never)

          // Store bar number in invite metadata via settings (best-effort)
          if (data.lawyerBarNumber) {
            const { data: freshSettings } = await admin
              .from('tenants')
              .select('settings')
              .eq('id', auth.tenantId)
              .single()
            const settings = (freshSettings?.settings as Record<string, unknown>) ?? {}
            const pendingLawyers = (settings.pending_lawyer_bar_numbers as Record<string, string> ?? {})
            pendingLawyers[data.lawyerEmail] = data.lawyerBarNumber
            settings.pending_lawyer_bar_numbers = pendingLawyers
            await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
          }

          // Send invite email
          const { data: tenantInfo } = await admin.from('tenants').select('name').eq('id', auth.tenantId).single()
          const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const acceptUrl = `${baseUrl}/invite/${token}`

          sendInternalEmail({
            supabase:       admin,
            tenantId:       auth.tenantId,
            recipientEmail: data.lawyerEmail,
            recipientName:  `${data.lawyerFirstName} ${data.lawyerLastName}`,
            title:          `You've been invited to ${tenantInfo?.name ?? 'a firm'}`,
            message:        `You have been invited to join ${tenantInfo?.name ?? 'the firm'} as Lawyer. Click the link below to set up your account.`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entityType is a string union but we pass a literal
            entityType:     'invite' as any,
            entityId:       acceptUrl,
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/apply-setup')
