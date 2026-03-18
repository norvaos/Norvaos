import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import type { WizardAnswers, Json } from '@/lib/types/database'

const j = (v: Record<string, unknown>): Json => v as unknown as Json

/**
 * POST /api/onboarding/wizard/default
 *
 * Applies a safe, opinionated baseline configuration without requiring
 * the firm to complete the full custom wizard. Designed to make the
 * tenant usable immediately after account creation.
 *
 * This endpoint:
 *   1. Writes the default preset answers into tenant_onboarding_wizard
 *   2. Calls the activate logic inline (same idempotency guarantees)
 *   3. Marks the wizard as default_applied
 *
 * Idempotent — safe to call more than once.
 */

const DEFAULT_PRESET: WizardAnswers = {
  // Firm profile: leave existing name/colours; just set sensible defaults
  // (a specific firm name isn't assumed here)
  practiceModel: {
    // Immigration is the primary practice area — all automation, pipelines,
    // and deadline types are built for it. Other practice areas can be added
    // later from Settings → Practice Areas, but no automation is seeded for them.
    practiceAreas: [{ name: 'Immigration', colour: '#6366f1' }],
  },
  matterNumbering: {
    prefix: 'M',
    format: 'PREFIX-YEAR-SEQ',
    startingNumber: 1,
    separator: '-',
  },
  rolesSetup: {
    useStandardRoles: true,
    standardRoles: ['Lawyer', 'Paralegal', 'Receptionist', 'Billing'],
  },
  emailSetup: {
    emailSignatureEnabled: false,
  },
  calendarSetup: {
    workingDays:              ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    workingHoursStart:        '09:00',
    workingHoursEnd:          '17:00',
    appointmentBufferMinutes: 15,
  },
  storageSetup: {
    retentionYears:          7,
    defaultFolderStructure:  'matter-based',
  },
  workflowSetup: {
    autoCreateTasksOnStageAdvance:  true,
    autoCloseMatterOnTerminalStage: true,
    deadlineReminderDays:           [7, 3, 1],
  },
  documentTemplates: {
    seedTemplates: false,
    templateSet:   'none',
  },
  customFields: {
    enableCustomFields: false,
  },
  portalSetup: {
    enabled: true,
  },
  notificationSetup: {
    emailNotificationsEnabled: true,
    deadlineReminderDays:      [7, 3, 1],
    taskDueReminderEnabled:    true,
  },
  billingSetup: {
    billingEnabled:           true,
    trustAccountingEnabled:   false,
    currency:                 'CAD',
    defaultPaymentTermDays:   30,
    invoicePrefix:            'INV',
  },
  dataImport: {
    importIntent: 'none',
  },
}

const STANDARD_ROLE_PRESETS: Record<string, Record<string, Record<string, boolean>>> = {
  Lawyer: {
    contacts:       { view: true, create: true, edit: true },
    matters:        { view: true, create: true, edit: true },
    leads:          { view: true, create: true, edit: true },
    tasks:          { view: true, create: true, edit: true, delete: true },
    documents:      { view: true, create: true, edit: true },
    communications: { view: true, create: true, edit: true },
    reports:        { view: true },
    conflicts:      { view: true, create: true, approve: true },
    form_packs:     { view: true, create: true, approve: true },
  },
  Paralegal: {
    contacts:       { view: true, create: true, edit: true },
    matters:        { view: true, edit: true },
    tasks:          { view: true, create: true, edit: true },
    documents:      { view: true, create: true, edit: true },
    communications: { view: true, create: true },
    conflicts:      { view: true, create: true },
    form_packs:     { view: true, create: true },
  },
  Receptionist: {
    contacts:   { view: true, create: true },
    matters:    { view: true },
    leads:      { view: true },
    tasks:      { view: true, create: true },
    front_desk: { view: true, create: true, edit: true },
    check_ins:  { view: true, create: true },
  },
  Billing: {
    billing:          { view: true, create: true, edit: true, delete: true },
    reports:          { view: true, export: true },
    trust_accounting: { view: true, create: true, edit: true },
    analytics:        { view: true },
  },
}

async function handlePost() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Guard: if already activated, return early
    const existingRes = await admin
      .from('tenant_onboarding_wizard')
      .select('status')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle() as unknown as { data: { status: string } | null }
    const existing = existingRes.data

    if (existing?.status === 'activated' || existing?.status === 'default_applied') {
      return NextResponse.json({ success: true, status: existing.status, skipped: true })
    }

    // Write default answers
    const { error: upsertErr } = await admin
      .from('tenant_onboarding_wizard')
      .upsert(
        {
          tenant_id:    auth.tenantId,
          mode:         'default',
          status:       'draft',
          current_step: 14,
          answers:      DEFAULT_PRESET as never,
        } as never,
        { onConflict: 'tenant_id' }
      )
    if (upsertErr) throw upsertErr

    // ── Apply configuration inline ────────────────────────────────────────────

    const getTenantSettings = async (): Promise<Record<string, unknown>> => {
      const res = await admin.from('tenants').select('settings').eq('id', auth.tenantId).single()
      const data = (res as unknown as { data: { settings: unknown } | null }).data
      return (data?.settings as Record<string, unknown>) ?? {}
    }

    const getTenantFeatureFlags = async (): Promise<Record<string, unknown>> => {
      const res = await admin.from('tenants').select('feature_flags').eq('id', auth.tenantId).single()
      const data = (res as unknown as { data: { feature_flags: unknown } | null }).data
      return (data?.feature_flags as Record<string, unknown>) ?? {}
    }

    const errors: string[] = []

    // Practice areas
    try {
      for (const pa of DEFAULT_PRESET.practiceModel!.practiceAreas) {
        const { error: paErr } = await admin.from('practice_areas').upsert(
          { tenant_id: auth.tenantId, name: pa.name, color: pa.colour, is_enabled: true } as never,
          { onConflict: 'tenant_id,name', ignoreDuplicates: false }
        )
        if (paErr) throw paErr
      }
    } catch { errors.push('practice_areas') }

    // Default matter type + pipeline + stages per practice area
    try {
      const paRes = await admin
        .from('practice_areas')
        .select('id, name, color')
        .eq('tenant_id', auth.tenantId)
        .eq('is_enabled', true)
      const paRows = (paRes as unknown as { data: Array<{id: string; name: string; color: string}> | null }).data ?? []

      for (const pa of paRows) {
        const existingMTRes = await admin
          .from('matter_types')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('practice_area_id', pa.id)
          .limit(1)
          .maybeSingle()
        const existingMT = (existingMTRes as unknown as { data: {id: string} | null }).data
        if (existingMT) continue

        const mtRes = await admin
          .from('matter_types')
          .insert({
            tenant_id: auth.tenantId,
            practice_area_id: pa.id,
            name: `${pa.name} Matter`,
            color: pa.color ?? '#6366f1',
            is_active: true,
            sort_order: 1,
          } as never)
          .select('id')
          .single()
        const mtData = (mtRes as unknown as { data: {id: string} | null }).data
        if (!mtData?.id) continue

        const plRes = await admin
          .from('matter_stage_pipelines')
          .insert({
            tenant_id: auth.tenantId,
            matter_type_id: mtData.id,
            name: 'Default',
            is_default: true,
            is_active: true,
          } as never)
          .select('id')
          .single()
        const plData = (plRes as unknown as { data: {id: string} | null }).data
        if (!plData?.id) continue

        await admin.from('matter_stages').insert([
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Intake', color: '#64748b', sort_order: 1, is_terminal: false, auto_close_matter: false },
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Active', color: '#3b82f6', sort_order: 2, is_terminal: false, auto_close_matter: false },
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Closed', color: '#10b981', sort_order: 3, is_terminal: true,  auto_close_matter: true  },
        ] as never)
      }
    } catch { errors.push('matter_types') }

    // Starter deadline types per practice area
    try {
      const paRes = await admin
        .from('practice_areas')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('is_enabled', true)
      const paRows = (paRes as unknown as { data: Array<{id: string}> | null }).data ?? []

      for (const pa of paRows) {
        const existingRes = await admin
          .from('deadline_types')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('practice_area_id', pa.id)
          .limit(1)
          .maybeSingle()
        const existing = (existingRes as unknown as { data: {id: string} | null }).data
        if (existing) continue

        await admin.from('deadline_types').insert([
          { tenant_id: auth.tenantId, practice_area_id: pa.id, name: 'Court Date',      is_hard: true,  is_active: true, sort_order: 1 },
          { tenant_id: auth.tenantId, practice_area_id: pa.id, name: 'Filing Deadline', is_hard: true,  is_active: true, sort_order: 2 },
          { tenant_id: auth.tenantId, practice_area_id: pa.id, name: 'Response Due',    is_hard: true,  is_active: true, sort_order: 3 },
          { tenant_id: auth.tenantId, practice_area_id: pa.id, name: 'Internal Review', is_hard: false, is_active: true, sort_order: 4, default_days_offset: 7 },
        ] as never)
      }
    } catch { errors.push('deadline_types') }

    // Matter numbering
    try {
      const settings = await getTenantSettings()
      const mn = DEFAULT_PRESET.matterNumbering!
      settings.matter_numbering = {
        prefix: mn.prefix, format: mn.format,
        starting_number: mn.startingNumber, separator: mn.separator, next_sequence: mn.startingNumber,
      }
      await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
    } catch { errors.push('matter_numbering') }

    // Standard roles
    try {
      for (const roleName of DEFAULT_PRESET.rolesSetup!.standardRoles) {
        const permissions = STANDARD_ROLE_PRESETS[roleName] ?? {}
        const { data: exists } = await admin
          .from('roles').select('id').eq('tenant_id', auth.tenantId).eq('name', roleName).maybeSingle()
        if (!exists) {
          await admin.from('roles').insert({ tenant_id: auth.tenantId, name: roleName, permissions: j(permissions), is_system: true } as never)
        }
      }
    } catch { errors.push('roles') }

    // Calendar, storage, workflow, portal, notifications, billing — batch settings update
    try {
      const settings = await getTenantSettings()
      const flags = await getTenantFeatureFlags()

      const cs = DEFAULT_PRESET.calendarSetup!
      settings.calendar_config = {
        working_days: cs.workingDays, working_hours_start: cs.workingHoursStart,
        working_hours_end: cs.workingHoursEnd, appointment_buffer_minutes: cs.appointmentBufferMinutes,
      }
      const ss = DEFAULT_PRESET.storageSetup!
      settings.storage_config = { retention_years: ss.retentionYears, default_folder_structure: ss.defaultFolderStructure }

      const ws = DEFAULT_PRESET.workflowSetup!
      settings.workflow_config = {
        auto_create_tasks_on_stage_advance: ws.autoCreateTasksOnStageAdvance,
        auto_close_matter_on_terminal_stage: ws.autoCloseMatterOnTerminalStage,
        deadline_reminder_days: ws.deadlineReminderDays,
      }
      settings.document_templates_config = { seed_templates: false, template_set: 'none' }
      settings.custom_fields_config = { enable_custom_fields: false }

      const ns = DEFAULT_PRESET.notificationSetup!
      settings.notification_defaults = {
        email_notifications_enabled: ns.emailNotificationsEnabled,
        deadline_reminder_days: ns.deadlineReminderDays,
        task_due_reminder_enabled: ns.taskDueReminderEnabled,
      }
      const bs = DEFAULT_PRESET.billingSetup!
      settings.billing_config = {
        billing_enabled: bs.billingEnabled, trust_accounting_enabled: bs.trustAccountingEnabled,
        default_payment_term_days: bs.defaultPaymentTermDays, invoice_prefix: bs.invoicePrefix,
      }

      flags.portal_enabled            = true
      flags.billing_enabled           = true
      flags.trust_accounting_enabled  = false
      flags.custom_fields_enabled     = false
      flags.front_desk_mode           = true

      await admin.from('tenants').update({ settings: j(settings), feature_flags: j(flags), currency: 'CAD' } as never).eq('id', auth.tenantId)
    } catch { errors.push('tenant_settings_batch') }

    // Data import intent
    try {
      await admin.from('tenant_setup_log').upsert(
        { tenant_id: auth.tenantId, action: 'onboarding_data_import_intent', applied_by: auth.userId, result: j({ import_intent: 'none' }) } as never,
        { onConflict: 'tenant_id,action' }
      )
    } catch { errors.push('data_import_intent') }

    const success = errors.length === 0
    const status  = success ? 'default_applied' : 'draft'

    // Update wizard status
    await admin
      .from('tenant_onboarding_wizard')
      .update({
        status,
        activation_log: [{
          action:     'default_preset',
          applied_at: new Date().toISOString(),
          ok:         success,
          error:      errors.length ? `Failed: ${errors.join(', ')}` : undefined,
        }] as never,
        activated_at: success ? new Date().toISOString() : null,
        activated_by: success ? auth.userId : null,
      } as never)
      .eq('tenant_id', auth.tenantId)

    // Audit
    admin.from('audit_logs').insert({
      tenant_id: auth.tenantId, user_id: auth.userId,
      action: 'onboarding_default_applied',
      entity_type: 'tenant', entity_id: auth.tenantId,
      metadata: j({ errors }),
    } as never).then(() => {})

    return NextResponse.json({ success, status, errors })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/wizard/default')
