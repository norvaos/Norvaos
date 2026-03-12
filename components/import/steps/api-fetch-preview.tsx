'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Database, CheckCircle } from 'lucide-react'

interface ApiFetchPreviewProps {
  platform: string
  entityType: string
  totalRows: number
  previewRows: Record<string, string>[]
  isFetching: boolean
  onFetch: () => void
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
  onNext,
  onBack,
}: ApiFetchPreviewProps) {
  const platformName = platform === 'ghl' ? 'Go High Level' : platform === 'clio' ? 'Clio' : platform
  const hasFetched = totalRows > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Fetch Data from API</h2>
        <p className="text-sm text-slate-500 mt-1">
          Pull {entityType.replace(/_/g, ' ')} data directly from your {platformName} account.
        </p>
      </div>

      {!hasFetched ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Database className="h-8 w-8 text-amber-600" />
          </div>
          <p className="text-sm text-slate-600 text-center max-w-sm">
            Click the button below to fetch all {entityType.replace(/_/g, ' ')} from {platformName}.
            This may take a moment depending on how much data you have.
          </p>
          <Button onClick={onFetch} disabled={isFetching} size="lg">
            {isFetching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Fetching data...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Fetch from {platformName}
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900">
                {totalRows.toLocaleString()} {entityType.replace(/_/g, ' ')} fetched
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                Data has been retrieved from your {platformName} account and is ready to import.
              </p>
            </div>
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b">
                <p className="text-xs font-medium text-slate-500">
                  Preview (first {previewRows.length} rows)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50/50">
                      {Object.keys(previewRows[0])
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
                    {previewRows.map((row, i) => (
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
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!hasFetched}>
          Continue to Map Columns
        </Button>
      </div>
    </div>
  )
}
