'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SourcePlatform } from '@/lib/services/import/types'

export type ImportMode = 'csv' | 'api'

interface ChooseImportModeProps {
  platform: SourcePlatform
  isConnected: boolean
  selected: ImportMode | null
  onSelect: (mode: ImportMode) => void
  onNext: () => void
  onBack: () => void
}

export function ChooseImportMode({
  platform,
  isConnected,
  selected,
  onSelect,
  onNext,
  onBack,
}: ChooseImportModeProps) {
  const platformName = platform === 'ghl' ? 'Go High Level' : platform === 'clio' ? 'Clio' : 'Officio'
  const supportsApi = platform === 'ghl' || platform === 'clio'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Import Method</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose how to import data from {platformName}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CSV Upload */}
        <button
          type="button"
          onClick={() => onSelect('csv')}
          className={cn(
            'w-full text-left rounded-lg border p-5 transition-all cursor-pointer',
            selected === 'csv'
              ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Upload className="h-5 w-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">CSV Upload</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload an exported CSV file. Works with any platform.
              </p>
            </div>
          </div>
        </button>

        {/* API Import */}
        {supportsApi && (
          <button
            type="button"
            onClick={() => isConnected && onSelect('api')}
            disabled={!isConnected}
            className={cn(
              'w-full text-left rounded-lg border p-5 transition-all',
              !isConnected && 'opacity-50 cursor-not-allowed',
              selected === 'api'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : isConnected
                  ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer'
                  : 'border-slate-200 bg-slate-50',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">API Import</p>
                  {isConnected ? (
                    <Badge variant="secondary" className="text-[10px]">Connected</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">Not Connected</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isConnected
                    ? 'Fetch data directly from your account. More entity types available.'
                    : `Connect your ${platformName} account in Settings to use API import.`}
                </p>
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!selected}>
          Next
        </Button>
      </div>
    </div>
  )
}
