import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { getSigningPageData } from '@/lib/services/esign-service'
import { SigningPageClient } from './signing-page-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

function ExpiredOrInvalidPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-950/40 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          This signing link is no longer valid
        </h1>
        <p className="text-sm text-slate-600">
          The document may have already been signed, the link may have expired,
          or it may have been cancelled. Please contact your law firm for
          assistance.
        </p>
      </div>
    </div>
  )
}

export default async function SigningPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  // Extract IP and User-Agent from request headers
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    undefined
  const userAgent = headersList.get('user-agent') || undefined

  // Validate token and retrieve signing page data
  const result = await getSigningPageData(admin, token, ip, userAgent)

  if (!result.success || !result.data) {
    return <ExpiredOrInvalidPage />
  }

  const { request, document, tenant, matterReference } = result.data

  const alreadySigned = request.status === 'signed'

  return (
    <SigningPageClient
      token={token}
      signerName={(request.signer_name as string) || ''}
      signerEmail={(request.signer_email as string) || ''}
      documentTitle={(document.title as string) || 'Document'}
      matterReference={matterReference}
      expiresAt={(request.expires_at as string) || ''}
      status={(request.status as string) || ''}
      firmName={tenant.name}
      firmLogoUrl={tenant.logo_url}
      primaryColor={tenant.primary_color}
      alreadySigned={alreadySigned}
      signedAt={alreadySigned ? (request.signed_at as string) : undefined}
    />
  )
}
