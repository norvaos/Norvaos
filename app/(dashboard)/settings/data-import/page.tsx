'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { ImportWizard } from '@/components/import/import-wizard'
import { ImportHistoryTable } from '@/components/import/import-history-table'
import { PlatformConnectionCard } from '@/components/import/platform-connection-card'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useGhlConnection,
  useClioConnection,
  useDisconnectGhl,
  useDisconnectClio,
} from '@/lib/queries/platform-connections'

export default function DataImportPage() {
  const { tenant } = useTenant()
  const [showWizard, setShowWizard] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'clio') {
      toast.success('Clio account connected successfully')
      window.history.replaceState({}, '', '/settings/data-import')
    } else if (connected === 'ghl') {
      toast.success('Go High Level account connected successfully')
      window.history.replaceState({}, '', '/settings/data-import')
    }
    if (error) {
      toast.error(`Connection failed: ${error}`)
      window.history.replaceState({}, '', '/settings/data-import')
    }
  }, [searchParams])

  const { data: ghlConn, isLoading: ghlLoading } = useGhlConnection(tenant?.id ?? '')
  const { data: clioConn, isLoading: clioLoading } = useClioConnection(tenant?.id ?? '')
  const disconnectGhl = useDisconnectGhl()
  const disconnectClio = useDisconnectClio()

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Data Import</h1>
          <p className="mt-1 text-sm text-slate-500">
            Import data from Go High Level, Clio, or Officio into your firm.
          </p>
        </div>
        {!showWizard && (
          <Button onClick={() => setShowWizard(true)}>
            <Upload className="h-4 w-4 mr-2" />
            New Import
          </Button>
        )}
      </div>

      {showWizard ? (
        <div className="rounded-lg border bg-white p-6">
          <ImportWizard onDone={() => setShowWizard(false)} />
        </div>
      ) : (
        <>
          {/* Connected Platforms */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Connected Platforms
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Connect your accounts to enable API-based import with access to more entity types.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PlatformConnectionCard
                platform="ghl"
                displayName="Go High Level"
                description="CRM, conversations, calendar, invoices, and more."
                isConnected={!!ghlConn?.isActive}
                isLoading={ghlLoading}
                connectionUser={ghlConn?.platformUserName ?? null}
                errorCount={ghlConn?.errorCount ?? 0}
                lastError={ghlConn?.lastError ?? null}
                onConnect={() => {}}
                onDisconnect={() => disconnectGhl.mutate()}
                isDisconnecting={disconnectGhl.isPending}
              />
              <PlatformConnectionCard
                platform="clio"
                displayName="Clio"
                description="Contacts, matters, bills, time entries, documents, and more."
                isConnected={!!clioConn?.isActive}
                isLoading={clioLoading}
                connectionUser={clioConn?.platformUserName ?? null}
                errorCount={clioConn?.errorCount ?? 0}
                lastError={clioConn?.lastError ?? null}
                onConnect={() => {}}
                onDisconnect={() => disconnectClio.mutate()}
                isDisconnecting={disconnectClio.isPending}
              />
            </div>
          </div>

          {/* Import history */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Import History
            </h2>
            {tenant && <ImportHistoryTable tenantId={tenant.id} />}
          </div>
        </>
      )}
    </div>
  )
}
