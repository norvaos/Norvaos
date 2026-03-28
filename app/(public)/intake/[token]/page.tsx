/**
 * External Intake Portal  -  Server Component
 *
 * Validates portal_links token, fetches matter + tenant branding,
 * and renders the client-facing intake form.
 *
 * Security: uses createAdminClient server-side only. Token validation
 * follows the exact pattern from app/portal/[token]/page.tsx.
 * All data access scoped to matter_id from portal_links.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { IntakeClient } from './intake-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

function IntakeExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-950/40 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">This Link Has Expired</h1>
        <p className="text-sm text-slate-600">
          Please contact your lawyer to request a new intake link.
        </p>
      </div>
    </div>
  )
}

function IntakeClosed() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-950/40 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">This Matter Has Been Completed</h1>
        <p className="text-sm text-slate-600">
          The intake for this matter is no longer accepting submissions.
        </p>
      </div>
    </div>
  )
}

export default async function IntakePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  // 1. Validate token
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    notFound()
  }

  // 2. Check expiry (null = no expiry / persistent link)
  if (link.expires_at !== null && new Date(link.expires_at) < new Date()) {
    return <IntakeExpired />
  }

  // 3. Fetch matter  -  block completed matters
  const { data: matter } = await admin
    .from('matters')
    .select('id, title, matter_number, matter_type_id, status')
    .eq('id', link.matter_id ?? '')
    .single()

  if (!matter) notFound()

  if (matter.status === 'closed_won' || matter.status === 'closed_lost') {
    return <IntakeClosed />
  }

  // 4. Fetch tenant branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, logo_url, primary_color, portal_branding')
    .eq('id', link.tenant_id)
    .single()

  if (!tenant) notFound()

  // 5. Fetch form instances for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formInstances } = await (admin as any)
    .from('matter_form_instances')
    .select('id, form_id, form_code, form_name, status, is_active, completion_state, blocker_count')
    .eq('matter_id', matter.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // 6. Update access tracking (fire-and-forget)
  admin
    .from('portal_links')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (link.access_count ?? 0) + 1,
    })
    .eq('id', link.id)
    .then(() => {})

  // 7. Extract metadata
  const metadata = (link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata))
    ? link.metadata as Record<string, unknown>
    : {}

  const branding = {
    firmName: tenant.name ?? '',
    logoUrl: tenant.logo_url ?? '',
    primaryColor: (tenant.primary_color as string) ?? '#1e40af',
    welcomeMessage: (metadata.welcome_message as string) ?? '',
    instructions: (metadata.instructions as string) ?? '',
    lawyerName: (metadata.lawyer_name as string) ?? '',
    lawyerEmail: (metadata.lawyer_email as string) ?? '',
  }

  return (
    <IntakeClient
      token={token}
      matterId={matter.id}
      matterTitle={matter.title ?? ''}
      matterNumber={matter.matter_number ?? ''}
      tenantId={tenant.id}
      contactId={link.contact_id ?? ''}
      branding={branding}
      formInstances={formInstances ?? []}
    />
  )
}
