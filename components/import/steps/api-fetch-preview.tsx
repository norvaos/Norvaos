'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface ApiFetchResult {
  batchId: string
  totalRows: number
  previewRows: Record<string, string>[]
  suggestedMapping: Record<string, string>
  detectedHeaders: string[]
}

interface ApiFetchPreviewProps {
  platform: string
  entityType: string
  totalRows: number
  previewRows: Record<string, string>[]
  isFetching: boolean
  onFetch: () => void
  onFetchComplete?: (result: ApiFetchResult) => void
  onNext: () => void
  onBack: () => void
}

export function ApiFetchPreview({
  platform,
  entityType,
  totalRows,
  previewRows,
  isFetching,
  onFetch,
  onFetchComplete,
  onNext,
  onBack,
}: ApiFetchPreviewProps) {
  const platformName = platform === 'ghl' ? 'Go High Level' : platform === 'clio' ? 'Clio' : platform
  const hasFetched = totalRows > 0

  const [streaming, setStreaming] = useState(false)
  const [streamFetched, setStreamFetched] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamDone, setStreamDone] = useState(false)
  const [streamResult, setStreamResult] = useState<ApiFetchResult | null>(null)

  const handleStreamFetch = useCallback(async () => {
    setStreaming(true)
    setStreamFetched(0)
    setStreamError(null)
    setStreamDone(false)
    setStreamResult(null)

    try {
      const response = await fetch('/api/import/api-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, entityType }),
      })

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: 'Fetch failed' }))
        setStreamError(err.error ?? 'Fetch failed')
        setStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.error) {
              setStreamError(data.error)
              setStreaming(false)
              return
            }
            if (data.done) {
              const result: ApiFetchResult = {
                batchId: data.batchId,
                totalRows: data.totalRows,
                previewRows: data.previewRows,
                suggestedMapping: data.suggestedMapping,
                detectedHeaders: data.detectedHeaders,
              }
              setStreamResult(result)
              setStreamFetched(data.totalRows)
              setStreamDone(true)
              setStreaming(false)
              onFetchComplete?.(result)
            } else if (typeof data.fetched === 'number') {
              setStreamFetched(data.fetched)
            }
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Fetch failed')
      setStreaming(false)
    }
  }, [platform, entityType, onFetchComplete])

  // Use streaming handler if onFetchComplete is provided, otherwise fall back to legacy onFetch
  const handleClick = onFetchComplete ? handleStreamFetch : onFetch
  const isLoading = onFetchComplete ? streaming : isFetching
  const displayFetched = onFetchComplete ? streamFetched : 0
  const displayDone = onFetchComplete ? streamDone : hasFetched
  const displayRows = onFetchComplete ? (streamResult?.previewRows ?? []) : previewRows
  const displayTotal = onFetchComplete ? (streamResult?.totalRows ?? 0) : totalRows
  const displayError = streamError

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Fetch Data from API</h2>
        <p className="text-sm text-slate-500 mt-1">
          Pull {entityType.replace(/_/g, ' ')} data directly from your {platformName} account.
        </p>
      </div>

      {displayError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-950/30 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Fetch failed</p>
            <p className="text-xs text-red-400 mt-0.5">{displayError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClick} className="ml-auto shrink-0">
            Retry
          </Button>
        </div>
      )}

      {!displayDone && !displayError && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-950/40">
            <Database className="h-8 w-8 text-amber-600" />
          </div>

          {isLoading ? (
            <div className="w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching from {platformName}…
                </span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {displayFetched.toLocaleString()} records
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-slate-400 text-center">
                Page {Math.ceil(displayFetched / 200) || 1} · Do not close this tab
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 text-center max-w-sm">
                Click the button below to fetch all {entityType.replace(/_/g, ' ')} from {platformName}.
                This may take a moment depending on how much data you have.
              </p>
              <Button onClick={handleClick} disabled={isLoading} size="lg">
                <Database className="h-4 w-4 mr-2" />
                Fetch from {platformName}
              </Button>
            </>
          )}
        </div>
      )}

      {displayDone && !displayError && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 p-4">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900">
                {displayTotal.toLocaleString()} {entityType.replace(/_/g, ' ')} fetched
              </p>
              <p className="text-xs text-emerald-400 mt-0.5">
                Data has been retrieved from your {platformName} account and is ready to import.
              </p>
            </div>
          </div>

          {displayRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b">
                <p className="text-xs font-medium text-slate-500">
                  Preview (first {displayRows.length} rows)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50/50">
                      {Object.keys(displayRows[0])
                        .filter((k) => !k.startsWith('__'))
                        .slice(0, 6)
                        .map((key) => (
                          <th key={key} className="px-3 py-2 text-left font-medium text-slate-500">
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {Object.entries(row)
                          .filter(([k]) => !k.startsWith('__'))
                          .slice(0, 6)
                          .map(([key, value]) => (
                            <td key={key} className="px-3 py-2 text-slate-700 max-w-[200px] truncate">
                              {value || <span className="text-slate-300">-</span>}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!displayDone || isLoading}>
          Continue to Map Columns
        </Button>
      </div>
    </div>
  )
}
