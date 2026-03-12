'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Link2, Unlink, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

interface PlatformConnectionCardProps {
  platform: 'ghl' | 'clio'
  displayName: string
  description: string
  isConnected: boolean
  isLoading: boolean
  connectionUser: string | null
  errorCount: number
  lastError: string | null
  onConnect: () => void
  onDisconnect: () => void
  isDisconnecting: boolean
}

export function PlatformConnectionCard({
  platform,
  displayName,
  description,
  isConnected,
  isLoading,
  connectionUser,
  errorCount,
  lastError,
  onConnect,
  onDisconnect,
  isDisconnecting,
}: PlatformConnectionCardProps) {
  const bgColour = platform === 'ghl' ? 'bg-blue-50' : 'bg-indigo-50'
  const textColour = platform === 'ghl' ? 'text-blue-600' : 'text-indigo-600'
  const [connectError, setConnectError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const handleConnect = useCallback(async () => {
    setConnectError(null)
    setIsConnecting(true)
    try {
      const res = await fetch(`/api/integrations/${platform}/connect`)
      if (res.redirected) {
        window.location.href = res.url
        return
      }
      const data = await res.json().catch(() => ({ message: 'Unknown error' }))
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      setConnectError(data.message ?? `Failed to connect to ${displayName}.`)
    } catch {
      setConnectError('Network error. Please check your connection and try again.')
    } finally {
      setIsConnecting(false)
    }
  }, [platform, displayName])

  if (isLoading) {
    return (
      <div className="rounded-lg border p-5 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Loading {displayName} connection...</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bgColour}`}>
            <span className={`text-sm font-bold ${textColour}`}>{displayName.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
              {isConnected ? (
                <Badge className="bg-green-100 text-green-800 text-[10px]">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  <XCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{description}</p>
            {isConnected && connectionUser && (
              <p className="text-xs text-slate-400 mt-1">
                Connected as: {connectionUser}
              </p>
            )}
            {isConnected && errorCount > 0 && lastError && (
              <p className="text-xs text-red-500 mt-1">
                Last error: {lastError}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={isDisconnecting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                  Disconnect
                </>
              )}
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {connectError && (
        <div className="flex items-start gap-2 mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{connectError}</p>
          <button onClick={() => setConnectError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
