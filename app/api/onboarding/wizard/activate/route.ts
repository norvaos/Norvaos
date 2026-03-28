import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import type { WizardAnswers, ActivationLogEntry, Json, TypedOnboardingWizardRow } from '@/lib/types/database'

const j = (v: Record<string, unknown>): Json => v as unknown as Json

/**
 * POST /api/onboarding/wizard/activate
 *
 * Applies all collected wizard answers as actual tenant/system configuration.
 * Safe to call multiple times — each action is idempotent via activation_log.
 *
 * Pre-flight: firmProfile.firmName, practiceModel.practiceAreas, and
 * matterNumbering.prefix must all be present or the route returns 422.
 *
 * Compensating rollback: a pre-activation snapshot is taken before any writes.
 * If any action fails, newly created rows (roles, practice areas, deadline types,
 * matter types/pipelines/stages) are deleted and the tenants row is restored to
 * its snapshot values. Log entries for rolled-back actions are cleared so a
 * subsequent POST re-runs them cleanly.
 *
 * Processing order mirrors the wizard steps:
 *   1.  firm_profile       → tenants row update
 *   2.  practice_areas     → practice_areas upsert + matter_type + pipeline + 3 stages per area
 *   3.  deadline_types     → starter deadline_types seeded per practice area
 *   4.  matter_numbering   → tenants.settings merge
 *   5.  roles              → roles table seed
 *   6.  email_config       → tenants.settings merge
 *   7.  calendar_config    → tenants.settings merge
 *   8.  storage_config     → tenants.settings merge
 *   9.  workflow_config    → tenants.settings merge
 *  10.  document_templates → tenants.settings flag
 *  11.  custom_fields      → tenants.settings flag + feature_flags
 *  12.  portal_config      → tenants.feature_flags + portal_branding
 *  13.  notification_config→ tenants.settings merge
 *  14.  billing_config     → tenants.settings merge + currency update
 *  15.  data_import        → tenant_setup_log intent record
 *
 * Each action writes to activation_log[]. On re-run, actions with ok=true
 * are skipped. Failed actions are retried.
 */

// ─── Standard role permission presets ────────────────────────────────────────

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

// ─── Pre-activation snapshot ──────────────────────────────────────────────────

interface ActivationSnapshot {
  tenantName: string | null
  tenantSettings: Record<string, unknown>
  tenantFeatureFlags: Record<string, unknown>
  tenantCurrency: string | null
  tenantPortalBranding: Record<string, unknown>
  tenantPrimaryColor: string | null
  tenantSecondaryColor: string | null
  tenantAccentColor: string | null
  existingRoleIds: string[]
  existingPracticeAreaIds: string[]
  existingDeadlineTypeIds: string[]
  existingMatterTypeIds: string[]
  existingPipelineIds: string[]
  existingStageIds: string[]
}

type AdminClient = ReturnType<typeof createAdminClient>

async function takeSnapshot(admin: AdminClient, tenantId: string): Promise<ActivationSnapshot> {
  const [tenantRes, rolesRes, paRes, dtRes, mtRes] = await Promise.all([
    admin
      .from('tenants')
      .select('name, settings, feature_flags, currency, portal_branding, primary_color, secondary_color, accent_color')
      .eq('id', tenantId)
      .single(),
    admin.from('roles').select('id').eq('tenant_id', tenantId),
    admin.from('practice_areas').select('id').eq('tenant_id', tenantId),
    admin.from('deadline_types').select('id').eq('tenant_id', tenantId),
    admin.from('matter_types').select('id').eq('tenant_id', tenantId),
  ])

  const tenant = (tenantRes as unknown as { data: Record<string, unknown> | null }).data
  const roles  = (rolesRes  as unknown as { data: Array<{ id: string }> | null }).data ?? []
  const pas    = (paRes     as unknown as { data: Array<{ id: string }> | null }).data ?? []
  const dts    = (dtRes     as unknown as { data: Array<{ id: string }> | null }).data ?? []
  const mts    = (mtRes     as unknown as { data: Array<{ id: string }> | null }).data ?? []

  // Fetch pipelines and stages scoped to this tenant's matter types
  const mtIds = mts.map(m => m.id)
  const [plRes, stRes] = await Promise.all([
    mtIds.length > 0
      ? admin.from('matter_stage_pipelines').select('id').eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),
    mtIds.length > 0
      ? admin.from('matter_stages').select('id').eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),
  ])
  const pls = (plRes as unknown as { data: Array<{ id: string }> | null }).data ?? []
  const sts = (stRes as unknown as { data: Array<{ id: string }> | null }).data ?? []

  return {
    tenantName:          (tenant?.name as string)            ?? null,
    tenantSettings:      (tenant?.settings as Record<string, unknown>) ?? {},
    tenantFeatureFlags:  (tenant?.feature_flags as Record<string, unknown>) ?? {},
    tenantCurrency:      (tenant?.currency as string)        ?? null,
    tenantPortalBranding:(tenant?.portal_branding as Record<string, unknown>) ?? {},
    tenantPrimaryColor:  (tenant?.primary_color as string)   ?? null,
    tenantSecondaryColor:(tenant?.secondary_color as string) ?? null,
    tenantAccentColor:   (tenant?.accent_color as string)    ?? null,
    existingRoleIds:         roles.map(r => r.id),
    existingPracticeAreaIds: pas.map(p => p.id),
    existingDeadlineTypeIds: dts.map(d => d.id),
    existingMatterTypeIds:   mts.map(m => m.id),
    existingPipelineIds:     pls.map(p => p.id),
    existingStageIds:        sts.map(s => s.id),
  }
}

// ─── Compensating rollback ────────────────────────────────────────────────────

async function compensate(admin: AdminClient, tenantId: string, snapshot: ActivationSnapshot): Promise<void> {
  // ── 1. Delete newly created stages (not in snapshot) ────────────────────────
  const allStRes = await admin.from('matter_stages').select('id').eq('tenant_id', tenantId)
  const allStIds = ((allStRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(s => s.id)
  const newStIds = allStIds.filter(id => !snapshot.existingStageIds.includes(id))
  if (newStIds.length > 0) {
    await admin.from('matter_stages').delete().in('id', newStIds)
  }

  // ── 2. Delete newly created pipelines ───────────────────────────────────────
  const allPlRes = await admin.from('matter_stage_pipelines').select('id').eq('tenant_id', tenantId)
  const allPlIds = ((allPlRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(p => p.id)
  const newPlIds = allPlIds.filter(id => !snapshot.existingPipelineIds.includes(id))
  if (newPlIds.length > 0) {
    await admin.from('matter_stage_pipelines').delete().in('id', newPlIds)
  }

  // ── 3. Delete newly created matter types ────────────────────────────────────
  const allMTRes = await admin.from('matter_types').select('id').eq('tenant_id', tenantId)
  const allMTIds = ((allMTRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(m => m.id)
  const newMTIds = allMTIds.filter(id => !snapshot.existingMatterTypeIds.includes(id))
  if (newMTIds.length > 0) {
    await admin.from('matter_types').delete().in('id', newMTIds)
  }

  // ── 4. Delete newly created practice areas ───────────────────────────────────
  const allPaRes = await admin.from('practice_areas').select('id').eq('tenant_id', tenantId)
  const allPaIds = ((allPaRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(p => p.id)
  const newPaIds = allPaIds.filter(id => !snapshot.existingPracticeAreaIds.includes(id))
  if (newPaIds.length > 0) {
    await admin.from('practice_areas').delete().in('id', newPaIds)
  }

  // ── 5. Delete newly created deadline types ──────────────────────────────────
  const allDTRes = await admin.from('deadline_types').select('id').eq('tenant_id', tenantId)
  const allDTIds = ((allDTRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(d => d.id)
  const newDTIds = allDTIds.filter(id => !snapshot.existingDeadlineTypeIds.includes(id))
  if (newDTIds.length > 0) {
    await admin.from('deadline_types').delete().in('id', newDTIds)
  }

  // ── 6. Delete newly created roles ───────────────────────────────────────────
  const allRolesRes = await admin.from('roles').select('id').eq('tenant_id', tenantId)
  const allRoleIds = ((allRolesRes as unknown as { data: Array<{ id: string }> | null }).data ?? []).map(r => r.id)
  const newRoleIds = allRoleIds.filter(id => !snapshot.existingRoleIds.includes(id))
  if (newRoleIds.length > 0) {
    await admin.from('roles').delete().in('id', newRoleIds)
  }

  // ── 7. Restore tenants row ──────────────────────────────────────────────────
  await admin.from('tenants').update({
    name:           snapshot.tenantName,
    settings:       j(snapshot.tenantSettings),
    feature_flags:  j(snapshot.tenantFeatureFlags),
    currency:       snapshot.tenantCurrency,
    portal_branding:j(snapshot.tenantPortalBranding),
    primary_color:  snapshot.tenantPrimaryColor,
    secondary_color:snapshot.tenantSecondaryColor,
    accent_color:   snapshot.tenantAccentColor,
  } as never).eq('id', tenantId)
}

// ─── Pre-flight validation ────────────────────────────────────────────────────

function validatePreFlight(answers: WizardAnswers): string | null {
  if (!answers.firmProfile?.firmName?.trim()) {
    return 'Firm Profile is incomplete — firm name is required before activation.'
  }
  const areas = answers.practiceModel?.practiceAreas
  if (!areas?.length || !areas.some(pa => pa.name?.trim())) {
    return 'Practice Model is incomplete — at least one named practice area is required before activation.'
  }
  if (!answers.matterNumbering?.prefix?.trim()) {
    return 'Matter Numbering is incomplete — a prefix is required before activation.'
  }
  return null
}

// ─── Action runner ────────────────────────────────────────────────────────────

async function runAction(
  actionKey: string,
  existingLog: ActivationLogEntry[],
  fn: () => Promise<void>
): Promise<ActivationLogEntry> {
  // Idempotency check — skip if already applied successfully
  const prior = existingLog.find((e) => e.action === actionKey)
  if (prior?.ok) {
    return prior
  }

  try {
    await fn()
    return { action: actionKey, applied_at: new Date().toISOString(), ok: true }
  } catch (err) {
    // DEF-OB-003: Supabase PostgrestError is not instanceof Error — extract .message explicitly
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
    return {
      action: actionKey,
      applied_at: new Date().toISOString(),
      ok: false,
      error: message,
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handlePost() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // ── Load wizard row ──────────────────────────────────────────────────────
    const { data: rawWizard, error: loadErr } = await admin
      .from('tenant_onboarding_wizard')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()

    if (loadErr) throw loadErr
    if (!rawWizard) {
      return NextResponse.json({ error: 'No onboarding wizard found. Call GET /api/onboarding/wizard first.' }, { status: 404 })
    }

    const wizard = rawWizard as unknown as TypedOnboardingWizardRow

    const answers = (wizard.answers ?? {}) as WizardAnswers
    const existingLog = (wizard.activation_log ?? []) as ActivationLogEntry[]

    // ── DEF-OB-002: Pre-flight validation ────────────────────────────────────
    const preFlightError = validatePreFlight(answers)
    if (preFlightError) {
      return NextResponse.json({ error: preFlightError }, { status: 422 })
    }

    // ── DEF-OB-001: Snapshot pre-activation state ────────────────────────────
    const snapshot = await takeSnapshot(admin, auth.tenantId)

    const newLog: ActivationLogEntry[] = []

    // Helper: fetch current tenants.settings to merge
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

    // ── 1. Firm Profile ──────────────────────────────────────────────────────
    newLog.push(await runAction('firm_profile', existingLog, async () => {
      const fp = answers.firmProfile
      if (!fp) return
      const update: Record<string, unknown> = {}
      if (fp.firmName)        update.name             = fp.firmName
      if (fp.primaryColour)   update.primary_color    = fp.primaryColour
      if (fp.secondaryColour) update.secondary_color  = fp.secondaryColour
      if (fp.accentColour)    update.accent_color     = fp.accentColour

      const settings = await getTenantSettings()
      if (fp.address) settings.address_line1 = fp.address
      if (fp.phone)   settings.office_phone  = fp.phone
      if (fp.website) settings.website       = fp.website
      update.settings = settings

      if (Object.keys(update).length > 0) {
        const { error } = await admin.from('tenants').update(update as never).eq('id', auth.tenantId)
        if (error) throw error
      }
    }))

    // ── 2. Practice Areas + matter types + pipelines + stages ────────────────
    newLog.push(await runAction('practice_areas', existingLog, async () => {
      const pm = answers.practiceModel
      if (!pm?.practiceAreas?.length) return

      // Upsert practice areas
      for (const pa of pm.practiceAreas) {
        if (!pa.name?.trim()) continue
        const { error } = await admin
          .from('practice_areas')
          .upsert(
            {
              tenant_id: auth.tenantId,
              name: pa.name.trim(),
              color: pa.colour ?? '#6366f1',
              is_enabled: true,
            } as never,
            { onConflict: 'tenant_id,name', ignoreDuplicates: false }
          )
        if (error) throw error
      }

      // Fetch created/updated practice areas to get their IDs
      const paRes = await admin
        .from('practice_areas')
        .select('id, name, color')
        .eq('tenant_id', auth.tenantId)
        .eq('is_enabled', true)
      const paRows = (paRes as unknown as { data: Array<{id: string; name: string; color: string}> | null }).data ?? []

      // For each practice area, seed a default matter_type + pipeline + 3 stages if none exist
      for (const pa of paRows) {
        const existingMTRes = await admin
          .from('matter_types')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('practice_area_id', pa.id)
          .limit(1)
          .maybeSingle()
        const existingMT = (existingMTRes as unknown as { data: {id: string} | null }).data
        if (existingMT) continue // already seeded — idempotent

        // Create matter type
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

        // Create default stage pipeline
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

        // Create 3 starter stages: Intake → Active → Closed
        await admin.from('matter_stages').insert([
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Intake', color: '#64748b', sort_order: 1, is_terminal: false, auto_close_matter: false },
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Active', color: '#3b82f6', sort_order: 2, is_terminal: false, auto_close_matter: false },
          { tenant_id: auth.tenantId, pipeline_id: plData.id, name: 'Closed', color: '#10b981', sort_order: 3, is_terminal: true,  auto_close_matter: true  },
        ] as never)
      }
    }))

    // ── 3. Deadline Types ─────────────────────────────────────────────────────
    newLog.push(await runAction('deadline_types', existingLog, async () => {
      const paRes = await admin
        .from('practice_areas')
        .select('id, name')
        .eq('tenant_id', auth.tenantId)
        .eq('is_enabled', true)
      const paRows = (paRes as unknown as { data: Array<{id: string; name: string}> | null }).data ?? []
      if (!paRows.length) return

      // Seed set is derived from the templateSet chosen; fall back to 'general'
      const templateSet = answers.documentTemplates?.templateSet ?? 'general'

      const DEADLINE_SEEDS: Record<string, Array<{name: string; is_hard: boolean; sort_order: number; default_days_offset?: number}>> = {
        immigration: [
          { name: 'IRCC Application Deadline', is_hard: true,  sort_order: 1 },
          { name: 'Status Expiry Date',         is_hard: true,  sort_order: 2 },
          { name: 'Medical Exam Validity',      is_hard: true,  sort_order: 3 },
          { name: 'Document Collection Due',    is_hard: false, sort_order: 4, default_days_offset: 14 },
        ],
        'family-law': [
          { name: 'Court Hearing Date',   is_hard: true,  sort_order: 1 },
          { name: 'Response to Petition', is_hard: true,  sort_order: 2 },
          { name: 'Mediation Session',    is_hard: false, sort_order: 3 },
          { name: 'Discovery Deadline',   is_hard: true,  sort_order: 4 },
        ],
        'real-estate': [
          { name: 'Closing Date',          is_hard: true, sort_order: 1 },
          { name: 'Inspection Deadline',   is_hard: true, sort_order: 2 },
          { name: 'Financing Condition',   is_hard: true, sort_order: 3 },
          { name: 'Title Search Deadline', is_hard: true, sort_order: 4 },
        ],
        general: [
          { name: 'Court Date',      is_hard: true,  sort_order: 1 },
          { name: 'Filing Deadline', is_hard: true,  sort_order: 2 },
          { name: 'Response Due',    is_hard: true,  sort_order: 3 },
          { name: 'Internal Review', is_hard: false, sort_order: 4, default_days_offset: 7 },
        ],
        none: [
          { name: 'Court Date',      is_hard: true, sort_order: 1 },
          { name: 'Filing Deadline', is_hard: true, sort_order: 2 },
          { name: 'Response Due',    is_hard: true, sort_order: 3 },
        ],
      }
      const seeds = DEADLINE_SEEDS[templateSet] ?? DEADLINE_SEEDS.general

      for (const pa of paRows) {
        const existingRes = await admin
          .from('deadline_types')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('practice_area_id', pa.id)
          .limit(1)
          .maybeSingle()
        const existing = (existingRes as unknown as { data: {id: string} | null }).data
        if (existing) continue // already seeded — idempotent

        for (const seed of seeds) {
          await admin.from('deadline_types').insert({
            tenant_id: auth.tenantId,
            practice_area_id: pa.id,
            name: seed.name,
            is_hard: seed.is_hard,
            is_active: true,
            sort_order: seed.sort_order,
            ...(seed.default_days_offset !== undefined ? { default_days_offset: seed.default_days_offset } : {}),
          } as never)
        }
      }
    }))

    // ── 4. Matter Numbering ─────────────────────────────────────────────────
    newLog.push(await runAction('matter_numbering', existingLog, async () => {
      const mn = answers.matterNumbering
      if (!mn) return
      const settings = await getTenantSettings()
      settings.matter_numbering = {
        prefix:         mn.prefix,
        format:         mn.format,
        starting_number: mn.startingNumber,
        separator:      mn.separator,
        next_sequence:  mn.startingNumber, // initialise counter
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 5. Roles ─────────────────────────────────────────────────────────────
    newLog.push(await runAction('roles', existingLog, async () => {
      const rs = answers.rolesSetup
      if (!rs?.useStandardRoles) return

      const rolesToSeed = rs.standardRoles ?? ['Lawyer', 'Paralegal', 'Receptionist', 'Billing']

      for (const roleName of rolesToSeed) {
        const permissions = roleName === 'Admin'
          ? {} // Admin is granted via name check in hasPermission()
          : STANDARD_ROLE_PRESETS[roleName] ?? {}

        // Check if role already exists (idempotent by name within tenant)
        const { data: existing } = await admin
          .from('roles')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('name', roleName)
          .maybeSingle()

        if (!existing) {
          const { error } = await admin.from('roles').insert({
            tenant_id: auth.tenantId,
            name: roleName,
            permissions: j(permissions),
            is_system: true,
          } as never)
          if (error) throw error
        }
      }
    }))

    // ── 6. Email Config ──────────────────────────────────────────────────────
    newLog.push(await runAction('email_config', existingLog, async () => {
      const es = answers.emailSetup
      if (!es) return
      const settings = await getTenantSettings()
      settings.email_config = {
        reply_to_address:         es.replyToAddress ?? null,
        sender_name:              es.senderName ?? null,
        email_signature_enabled:  es.emailSignatureEnabled,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 7. Calendar Config ───────────────────────────────────────────────────
    newLog.push(await runAction('calendar_config', existingLog, async () => {
      const cs = answers.calendarSetup
      if (!cs) return
      const settings = await getTenantSettings()
      settings.calendar_config = {
        working_days:                cs.workingDays,
        working_hours_start:         cs.workingHoursStart,
        working_hours_end:           cs.workingHoursEnd,
        appointment_buffer_minutes:  cs.appointmentBufferMinutes,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 8. Storage Config ────────────────────────────────────────────────────
    newLog.push(await runAction('storage_config', existingLog, async () => {
      const ss = answers.storageSetup
      if (!ss) return
      const settings = await getTenantSettings()
      settings.storage_config = {
        retention_years:         ss.retentionYears,
        default_folder_structure: ss.defaultFolderStructure,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 9. Workflow Config ───────────────────────────────────────────────────
    newLog.push(await runAction('workflow_config', existingLog, async () => {
      const ws = answers.workflowSetup
      if (!ws) return
      const settings = await getTenantSettings()
      settings.workflow_config = {
        auto_create_tasks_on_stage_advance:  ws.autoCreateTasksOnStageAdvance,
        auto_close_matter_on_terminal_stage: ws.autoCloseMatterOnTerminalStage,
        deadline_reminder_days:              ws.deadlineReminderDays,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 10. Document Templates ────────────────────────────────────────────────
    newLog.push(await runAction('document_templates', existingLog, async () => {
      const dt = answers.documentTemplates
      if (!dt) return
      const settings = await getTenantSettings()
      settings.document_templates_config = {
        seed_templates: dt.seedTemplates,
        template_set:   dt.templateSet,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 11. Custom Fields ────────────────────────────────────────────────────
    newLog.push(await runAction('custom_fields', existingLog, async () => {
      const cf = answers.customFields
      if (!cf) return
      const settings = await getTenantSettings()
      const flags = await getTenantFeatureFlags()
      settings.custom_fields_config = { enable_custom_fields: cf.enableCustomFields }
      flags.custom_fields_enabled = cf.enableCustomFields
      const { error } = await admin
        .from('tenants')
        .update({ settings: j(settings), feature_flags: j(flags) } as never)
        .eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 12. Portal Config ────────────────────────────────────────────────────
    newLog.push(await runAction('portal_config', existingLog, async () => {
      const ps = answers.portalSetup
      if (!ps) return
      const flags = await getTenantFeatureFlags()
      flags.portal_enabled = ps.enabled
      const portalBranding: Record<string, unknown> = {}
      if (ps.portalName)      portalBranding.portal_name      = ps.portalName
      if (ps.welcomeMessage)  portalBranding.welcome_message  = ps.welcomeMessage
      const { error } = await admin
        .from('tenants')
        .update({ feature_flags: j(flags), portal_branding: j(portalBranding) } as never)
        .eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 13. Notification Config ──────────────────────────────────────────────
    newLog.push(await runAction('notification_config', existingLog, async () => {
      const ns = answers.notificationSetup
      if (!ns) return
      const settings = await getTenantSettings()
      settings.notification_defaults = {
        email_notifications_enabled: ns.emailNotificationsEnabled,
        deadline_reminder_days:      ns.deadlineReminderDays,
        task_due_reminder_enabled:   ns.taskDueReminderEnabled,
      }
      const { error } = await admin.from('tenants').update({ settings: j(settings) } as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 14. Billing Config ───────────────────────────────────────────────────
    newLog.push(await runAction('billing_config', existingLog, async () => {
      const bs = answers.billingSetup
      if (!bs) return
      const settings = await getTenantSettings()
      const flags = await getTenantFeatureFlags()
      settings.billing_config = {
        billing_enabled:           bs.billingEnabled,
        trust_accounting_enabled:  bs.trustAccountingEnabled,
        default_payment_term_days: bs.defaultPaymentTermDays,
        invoice_prefix:            bs.invoicePrefix ?? 'INV',
      }
      flags.billing_enabled          = bs.billingEnabled
      flags.trust_accounting_enabled = bs.trustAccountingEnabled
      const update: Record<string, unknown> = {
        settings: j(settings),
        feature_flags: j(flags),
      }
      if (bs.currency) update.currency = bs.currency
      const { error } = await admin.from('tenants').update(update as never).eq('id', auth.tenantId)
      if (error) throw error
    }))

    // ── 15. Data Import Intent ───────────────────────────────────────────────
    newLog.push(await runAction('data_import_intent', existingLog, async () => {
      const di = answers.dataImport
      if (!di) return
      // Record intent in setup log — no import happens here
      const { error } = await admin
        .from('tenant_setup_log')
        .upsert(
          {
            tenant_id:   auth.tenantId,
            action:      'onboarding_data_import_intent',
            applied_by:  auth.userId,
            result:      j({ import_intent: di.importIntent }),
          } as never,
          { onConflict: 'tenant_id,action' }
        )
      if (error) throw error
    }))

    // ── Merge new log entries with existing ──────────────────────────────────
    const ranActions = new Set(newLog.map((e) => e.action))
    const preserved  = existingLog.filter((e) => !ranActions.has(e.action))
    const mergedLog  = [...preserved, ...newLog]
    const allOk      = mergedLog.every((e) => e.ok)

    // ── DEF-OB-001: Compensating rollback on failure ─────────────────────────
    if (!allOk) {
      // Undo all DB writes made during this activation run
      await compensate(admin, auth.tenantId, snapshot)

      // Clear log entries for actions that ran this run and succeeded —
      // their DB changes were just rolled back, so they must re-run next time.
      // Only preserve: prior ok entries NOT run this time, and failed entries.
      const failedThisRun = newLog.filter(e => !e.ok)
      const priorNotRun   = existingLog.filter(e => e.ok && !ranActions.has(e.action))
      const rollbackLog   = [...priorNotRun, ...failedThisRun]

      await admin
        .from('tenant_onboarding_wizard')
        .update({
          status:         'draft',
          activation_log: rollbackLog as never,
          activated_at:   null,
          activated_by:   null,
        } as never)
        .eq('tenant_id', auth.tenantId)

      return NextResponse.json({
        success: false,
        status:  'rolled_back',
        message: 'Activation failed. All changes have been rolled back. Correct the errors and try again.',
        failed:  failedThisRun.map(e => ({ action: e.action, error: e.error })),
        log:     rollbackLog,
      })
    }

    // ── All actions succeeded — commit activated status ──────────────────────
    const { error: updateErr } = await admin
      .from('tenant_onboarding_wizard')
      .update({
        status:         'activated',
        activation_log: mergedLog as never,
        activated_at:   new Date().toISOString(),
        activated_by:   auth.userId,
        mode:           'custom',
      } as never)
      .eq('tenant_id', auth.tenantId)

    if (updateErr) throw updateErr

    // ── Audit log (fire-and-forget) ──────────────────────────────────────────
    admin
      .from('audit_logs')
      .insert({
        tenant_id:   auth.tenantId,
        user_id:     auth.userId,
        action:      'onboarding_wizard_activated',
        entity_type: 'tenant',
        entity_id:   auth.tenantId,
        metadata:    j({ steps_applied: newLog.length, all_ok: true }),
      } as never)
      .then(() => {})

    return NextResponse.json({
      success: true,
      status:  'activated',
      log:     mergedLog,
      failed:  [],
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/wizard/activate')
