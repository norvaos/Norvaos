'use client'

import { useUser } from '@/lib/hooks/use-user'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { MicrosoftConnectionCard } from '@/components/settings/microsoft-connection-card'
import { MicrosoftSyncControls } from '@/components/settings/microsoft-sync-controls'
import { OneDriveBrowser } from '@/components/settings/onedrive-browser'
import { SyncHistoryTable } from '@/components/settings/sync-history-table'
import { useMicrosoftConnection } from '@/lib/queries/microsoft-integration'

export default function IntegrationsPage() {
  const { appUser } = useUser()
  const searchParams = useSearchParams()

  // Show toast on successful connection
  useEffect(() => {
    if (searchParams.get('connected') === 'microsoft') {
      toast.success('Microsoft account connected successfully')
      // Clean up URL without reload
      window.history.replaceState({}, '', '/settings/integrations')
    }
    if (searchParams.get('error')) {
      toast.error(`Connection failed: ${searchParams.get('error')}`)
      window.history.replaceState({}, '', '/settings/integrations')
    }
  }, [searchParams])

  const userId = appUser?.id || ''
  const { data: connection } = useMicrosoftConnection(userId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground">
          Connect external services to sync data with NorvaOS.
        </p>
      </div>

      <div className="space-y-4">
        <MicrosoftConnectionCard userId={userId} />

        {connection && (
          <>
            <MicrosoftSyncControls userId={userId} />
            <OneDriveBrowser userId={userId} />
            <SyncHistoryTable userId={userId} />
          </>
        )}
      </div>
    </div>
  )
}
