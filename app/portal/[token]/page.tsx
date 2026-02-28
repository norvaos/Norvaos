import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { PortalChecklist } from './portal-checklist'

interface Props {
  params: Promise<{ token: string }>
}

function PortalExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Link Expired</h1>
        <p className="text-sm text-slate-600">
          This document upload link has expired. Please contact your lawyer to request a new link.
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

  // 2. Check expiry
  if (new Date(link.expires_at) < new Date()) {
    return <PortalExpired />
  }

  // 3. Fetch matter (just matter_number for privacy — not full title)
  const { data: matter } = await admin
    .from('matters')
    .select('id, matter_number, title')
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

  // 5. Fetch checklist items for this matter
  const { data: checklistItems } = await admin
    .from('matter_checklist_items')
    .select('*')
    .eq('matter_id', link.matter_id)
    .order('sort_order', { ascending: true })

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

  return (
    <PortalChecklist
      token={token}
      tenant={{
        name: tenant.name,
        logoUrl: tenant.logo_url,
        primaryColor: tenant.primary_color,
      }}
      matterRef={matter.matter_number || `Case #${matter.id.slice(0, 8)}`}
      checklistItems={checklistItems ?? []}
      portalInfo={{
        welcomeMessage: metadata.welcome_message ?? '',
        instructions: metadata.instructions ?? '',
        lawyerName: metadata.lawyer_name ?? '',
        lawyerEmail: metadata.lawyer_email ?? '',
        lawyerPhone: metadata.lawyer_phone ?? '',
      }}
    />
  )
}
