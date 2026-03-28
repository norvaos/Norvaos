import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { KioskFlow } from './kiosk-flow'
import type { PortalLocale } from '@/lib/utils/portal-translations'
import type { KioskQuestion } from '@/lib/types/kiosk-question'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Kiosk main page  -  validates token server-side, then renders the client flow.
 *
 * Rule #7: Token validation is step one in every kiosk route.
 * Rule #10: No app navigation exposed. Fullscreen, self-contained.
 */
export default async function KioskPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  // 1. Validate kiosk token
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, tenant_id, token, expires_at, is_active, metadata, permissions, link_type')
    .eq('token', token)
    .eq('is_active', true)
    .eq('link_type', 'kiosk')
    .single()

  if (linkError || !link) {
    notFound()
  }

  // 2. Check expiry
  if (new Date(link.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-950/40 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Kiosk Session Expired</h1>
          <p className="text-sm text-slate-600">
            This kiosk link has expired. Please contact the front desk for assistance.
          </p>
        </div>
      </div>
    )
  }

  // 3. Get tenant branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, settings')
    .eq('id', link.tenant_id)
    .single()

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>
  const kioskConfig = (settings.kiosk_config ?? {}) as Record<string, unknown>

  const branding = {
    firmName: tenant?.name ?? 'Law Office',
    logoUrl: (kioskConfig.logo_url as string) ?? null,
    primaryColor: (kioskConfig.primary_color as string) ?? '#0f172a',
    welcomeMessage: (kioskConfig.welcome_message as string) ?? 'Welcome! Please check in for your appointment.',
    inactivityTimeout: (kioskConfig.inactivity_timeout as number) ?? 120,
    dataSafetyNotice: (kioskConfig.data_safety_notice as string) ?? null,
    enableIdScan: kioskConfig.enable_id_scan !== false,
    enableIdentityVerify: kioskConfig.enable_identity_verify !== false,
    enabledLanguages: (kioskConfig.enabled_languages as PortalLocale[]) ?? ['en' as PortalLocale],
    kioskQuestions: (kioskConfig.kiosk_questions as KioskQuestion[]) ?? [],
  }

  // 4. Fire-and-forget: update access tracking
  admin
    .from('portal_links')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: ((link as Record<string, unknown>).access_count as number ?? 0) + 1,
    })
    .eq('id', link.id)
    .then(() => {})

  return (
    <KioskFlow
      token={token}
      tenantId={link.tenant_id}
      branding={branding}
    />
  )
}
