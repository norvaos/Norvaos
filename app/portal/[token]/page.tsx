import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PortalPageClient } from './portal-page-client'
import type { PortalSlot } from './portal-documents'
import { getTranslations, PORTAL_LOCALES, type PortalLocale } from '@/lib/utils/portal-translations'

// Force dynamic rendering so the portal always shows fresh document slots
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

function PortalExpired({ language = 'en' }: { language?: PortalLocale }) {
  const tr = getTranslations(language)
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{tr.link_expired_title}</h1>
        <p className="text-sm text-slate-600">
          {tr.link_expired_message}
        </p>
      </div>
    </div>
  )
}

export default async function PortalPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  // 1. Look up token
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    notFound()
  }

  // 2. Check expiry — extract language early for expired page
  const rawMetadata = (link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata))
    ? link.metadata as Record<string, string>
    : {}
  const validLocales = PORTAL_LOCALES.map((l) => l.value)
  const expiredLanguage = (validLocales.includes(rawMetadata.preferred_language as PortalLocale)
    ? rawMetadata.preferred_language
    : 'en') as PortalLocale

  if (new Date(link.expires_at) < new Date()) {
    return <PortalExpired language={expiredLanguage} />
  }

  // 3. Fetch matter (just matter_number for privacy — not full title)
  const { data: matter } = await admin
    .from('matters')
    .select('id, matter_number, title, matter_type_id, status, responsible_lawyer_id')
    .eq('id', link.matter_id)
    .single()

  if (!matter) notFound()

  // 4. Fetch tenant for branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, logo_url, primary_color, portal_branding')
    .eq('id', link.tenant_id)
    .single()

  if (!tenant) notFound()

  // 5. Determine enforcement mode + fetch matter type details
  let enforcementEnabled = false
  let matterTypeName = ''
  let matterTypeInstructions = ''
  if (matter.matter_type_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matterType } = await (admin as any)
      .from('matter_types')
      .select('enforcement_enabled, name, portal_instructions')
      .eq('id', matter.matter_type_id)
      .single()
    enforcementEnabled = matterType?.enforcement_enabled ?? false
    matterTypeName = matterType?.name ?? ''
    matterTypeInstructions = matterType?.portal_instructions ?? ''
  }

  // 6. Update access tracking (fire-and-forget, non-blocking)
  admin
    .from('portal_links')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (link.access_count ?? 0) + 1,
    })
    .eq('id', link.id)
    .then(() => {})

  // 7. Extract metadata from link
  const metadata = (link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata))
    ? link.metadata as Record<string, string>
    : {}

  const preferredLanguage = (validLocales.includes(metadata.preferred_language as PortalLocale)
    ? metadata.preferred_language
    : 'en') as PortalLocale

  // Two-level instructions: per-link overrides matter-type defaults entirely
  const resolvedInstructions = metadata.instructions || matterTypeInstructions || ''

  const portalInfo = {
    welcomeMessage: metadata.welcome_message ?? '',
    instructions: resolvedInstructions,
    lawyerName: metadata.lawyer_name ?? '',
    lawyerEmail: metadata.lawyer_email ?? '',
    lawyerPhone: metadata.lawyer_phone ?? '',
    lawyerRoleDescription: metadata.lawyer_role_description ?? '',
    supportStaffName: metadata.support_staff_name ?? '',
    supportStaffEmail: metadata.support_staff_email ?? '',
    supportStaffPhone: metadata.support_staff_phone ?? '',
    supportStaffRoleDescription: metadata.support_staff_role_description ?? '',
  }

  // Fallback: if no lawyer info in metadata, fetch from responsible_lawyer_id
  if (!portalInfo.lawyerName && matter.responsible_lawyer_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lawyerUser } = await (admin as any)
      .from('users')
      .select('full_name, email, phone')
      .eq('id', matter.responsible_lawyer_id)
      .single()

    if (lawyerUser?.full_name) {
      portalInfo.lawyerName = lawyerUser.full_name
      portalInfo.lawyerEmail = lawyerUser.email ?? ''
      portalInfo.lawyerPhone = lawyerUser.phone ?? ''
    }
  }

  const tenantBranding = {
    name: tenant.name,
    logoUrl: tenant.logo_url,
    primaryColor: tenant.primary_color,
  }

  const matterRef = matter.matter_number || `Case #${matter.id.slice(0, 8)}`

  // 8. Check for IRCC questionnaire session — auto-create if matter type has forms
  //
  // Single source of truth: ircc_stream_forms (Settings → Matter Type → Forms).
  // Legacy fallback: ircc_question_set_codes on matter_types table.
  let { data: irccSession } = await admin
    .from('ircc_questionnaire_sessions')
    .select('id, status')
    .eq('matter_id', link.matter_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Determine current form configuration for this matter type
  let currentFormCodes: string[] = []
  if (matter.matter_type_id) {
    // Primary source: ircc_stream_forms (Settings → Matter Type → Forms)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: streamForms } = await (admin as any)
      .from('ircc_stream_forms')
      .select('form_id, ircc_forms!inner(form_code)')
      .eq('matter_type_id', matter.matter_type_id)
      .order('sort_order', { ascending: true })

    if (streamForms && streamForms.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentFormCodes = (streamForms as any[]).map((sf: any) => sf.ircc_forms?.form_code).filter(Boolean) as string[]
    }

    // Legacy fallback: check ircc_question_set_codes on the matter type
    if (currentFormCodes.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mtData } = await (admin as any)
        .from('matter_types')
        .select('ircc_question_set_codes')
        .eq('id', matter.matter_type_id)
        .single()

      currentFormCodes = (mtData?.ircc_question_set_codes ?? []) as string[]
    }
  }

  // Auto-create session if none exists and forms are currently configured
  if (!irccSession && currentFormCodes.length > 0) {
    // Find the contact for this matter — try 'client' first, then immigration roles
    let contactId: string | null = null
    for (const role of ['client', 'principal_applicant', 'sponsor']) {
      const { data: person } = await admin
        .from('matter_people')
        .select('contact_id')
        .eq('matter_id', link.matter_id)
        .eq('person_role', role)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (person?.contact_id) {
        contactId = person.contact_id
        break
      }
    }

    if (contactId) {
      const { data: newSession } = await admin
        .from('ircc_questionnaire_sessions')
        .insert({
          tenant_id: link.tenant_id,
          contact_id: contactId,
          matter_id: link.matter_id,
          form_codes: currentFormCodes,
          status: 'in_progress',
          portal_link_id: link.id,
        })
        .select('id, status')
        .single()

      if (newSession) {
        irccSession = newSession
      }
    }
  }

  // Show Questions section only if forms are currently configured for this matter type.
  // A stale session alone is not enough — the matter type must have active form configuration.
  const hasIRCC = currentFormCodes.length > 0 || (!!irccSession && irccSession.status === 'completed')

  // 9. Check for client-visible tasks
  const { count: taskCount } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', link.matter_id)
    .eq('is_deleted', false)
    .in('category', ['client_facing'])

  const hasClientTasks = (taskCount ?? 0) > 0

  // 10. Check for upcoming calendar events (next 90 days)
  const now = new Date().toISOString()
  const ninetyDaysLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: eventCount } = await (admin as any)
    .from('calendar_events')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', link.matter_id)
    .eq('is_active', true)
    .eq('is_client_visible', true)
    .neq('status', 'cancelled')
    .gte('start_at', now)
    .lte('start_at', ninetyDaysLater)

  const hasUpcomingEvents = (eventCount ?? 0) > 0

  // 11. Fetch document data based on enforcement mode
  let enrichedSlots: PortalSlot[] | undefined
  let checklistItems: Array<{
    id: string
    document_name: string
    description: string | null
    category: string
    is_required: boolean
    status: string
    document_id: string | null
    sort_order: number
  }> | undefined

  if (enforcementEnabled) {
    // Fetch document slots
    const { data: rawSlots } = await admin
      .from('document_slots')
      .select(
        'id, slot_name, description, category, person_role, is_required, status, accepted_file_types, max_file_size_bytes, current_version'
      )
      .eq('matter_id', link.matter_id)
      .eq('is_active', true)
      .order('sort_order')
      .order('slot_name')

    const slotList = rawSlots ?? []

    // For slots needing re-upload or rejected, fetch the latest version's review_reason
    const slotsNeedingReason = slotList.filter(
      (s) => s.status === 'needs_re_upload' || s.status === 'rejected'
    )

    const reasonMap = new Map<string, { review_reason: string | null; rejection_reason_code: string | null }>()
    if (slotsNeedingReason.length > 0) {
      for (const slot of slotsNeedingReason) {
        const { data: latestVersion } = await admin
          .from('document_versions')
          .select('review_reason, rejection_reason_code')
          .eq('slot_id', slot.id)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        reasonMap.set(slot.id, {
          review_reason: (latestVersion as { review_reason?: string | null })?.review_reason ?? null,
          rejection_reason_code: (latestVersion as { rejection_reason_code?: string | null })?.rejection_reason_code ?? null,
        })
      }
    }

    // Enrich slots with review reason and structured rejection code
    const allEnriched = slotList.map((s) => ({
      id: s.id,
      slot_name: s.slot_name,
      description: s.description,
      category: s.category,
      person_role: s.person_role,
      is_required: s.is_required,
      status: s.status,
      accepted_file_types: s.accepted_file_types,
      max_file_size_bytes: s.max_file_size_bytes,
      current_version: s.current_version,
      latest_review_reason: reasonMap.get(s.id)?.review_reason ?? null,
      rejection_reason_code: reasonMap.get(s.id)?.rejection_reason_code ?? null,
    }))

    // Filter to only show slots that were explicitly requested via document_requests.
    // If no requests exist yet, show all slots (backward compatibility).
    // Always include slots that already have uploads so client work isn't hidden.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docRequests } = await (admin as any)
      .from('document_requests')
      .select('slot_ids')
      .eq('matter_id', link.matter_id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (docRequests && (docRequests as any[]).length > 0) {
      // Collect union of all requested slot IDs across all requests
      const requestedIds = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const req of docRequests as any[]) {
        const ids = req.slot_ids as string[] | null
        if (ids) ids.forEach((id: string) => requestedIds.add(id))
      }

      // Show requested slots + any that already have client uploads
      enrichedSlots = allEnriched.filter(
        (s) => requestedIds.has(s.id) || s.status !== 'empty'
      )
    } else {
      // No requests sent yet — show all active slots
      enrichedSlots = allEnriched
    }
  } else {
    // Non-enforcement: fetch legacy checklist items
    const { data: items } = await admin
      .from('matter_checklist_items')
      .select('*')
      .eq('matter_id', link.matter_id)
      .order('sort_order', { ascending: true })

    checklistItems = items ?? []
  }

  // 12. Check if billing data exists (invoices or payment config)
  const { count: invoiceCount } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', link.matter_id)
    .not('status', 'in', '("draft","cancelled","void")')

  const tenantBrandingFull = (tenant.portal_branding ?? {}) as Record<string, unknown>
  const hasPaymentConfig = !!(
    tenantBrandingFull.payment_config ||
    metadata.payment_config
  )
  const hasBillingData = (invoiceCount ?? 0) > 0 || hasPaymentConfig

  // 13. Check for shared documents
  const { count: sharedDocCount } = await admin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('matter_id', link.matter_id)
    .eq('is_shared_with_client', true)

  const hasSharedDocuments = (sharedDocCount ?? 0) > 0

  // 14. Timeline always shown — API has fallback to matter.status
  const hasTimeline = true

  // 15. Render with single-page guided workspace
  return (
    <PortalPageClient
      token={token}
      tenant={tenantBranding}
      matterRef={matterRef}
      matterTitle={matter.title ?? ''}
      matterTypeName={matterTypeName}
      matterStatus={matter.status ?? ''}
      language={preferredLanguage}
      portalInfo={portalInfo}
      enforcementEnabled={enforcementEnabled}
      slots={enrichedSlots}
      checklistItems={checklistItems}
      hasIRCC={hasIRCC}
      hasClientTasks={hasClientTasks}
      hasUpcomingEvents={hasUpcomingEvents}
      hasBillingData={hasBillingData}
      hasSharedDocuments={hasSharedDocuments}
      hasTimeline={hasTimeline}
      taskCount={taskCount ?? 0}
      eventCount={eventCount ?? 0}
      sharedDocumentCount={sharedDocCount ?? 0}
      lastUpdated={new Date().toISOString()}
    />
  )
}
