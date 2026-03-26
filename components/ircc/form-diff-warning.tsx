'use client'

/**
 * Form Data Mismatch Warning
 *
 * Displays a warning banner when the History-Diff Engine detects
 * differences between the current matter data and the data used
 * in the last generated form pack. Helps catch stale submissions
 * before they reach IRCC.
 */

import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface FieldMismatch {
  field: string
  label: string
  snapshotValue: string
  currentValue: string
}

interface DiffResult {
  matterId: string
  formCode: string
  versionId: string
  versionNumber: number
  generatedAt: string
  mismatches: FieldMismatch[]
  hasMismatches: boolean
}

interface FormDiffWarningProps {
  matterId: string
  formCode?: string
}

export function FormDiffWarning({ matterId, formCode }: FormDiffWarningProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: diff, isLoading, refetch } = useQuery<DiffResult>({
    queryKey: ['form-diff', matterId, formCode],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (formCode) params.set('form_code', formCode)
      const res = await fetch(`/api/matters/${matterId}/form-diff?${params}`)
      if (!res.ok) throw new Error('Failed to fetch diff')
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min
    refetchOnWindowFocus: false,
  })

  if (isLoading || !diff?.hasMismatches) return null

  const mismatchCount = diff.mismatches.length

  return (
    <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-400 flex items-center gap-2">
        Data Mismatch Detected
        <Badge variant="outline" className="text-amber-700 border-amber-400">
          {mismatchCount} field{mismatchCount !== 1 ? 's' : ''} changed
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        <p className="text-sm mb-2">
          The client&apos;s data has changed since <strong>{diff.formCode}</strong> v{diff.versionNumber} was generated.
          Regenerate the form pack before submitting to IRCC.
        </p>

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900 p-0 h-auto">
                {isOpen ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                {isOpen ? 'Hide' : 'Show'} changed fields
              </Button>
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-amber-700 hover:text-amber-900 p-0 h-auto ml-auto"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-check
            </Button>
          </div>

          <CollapsibleContent>
            <div className="mt-2 rounded border border-amber-300 bg-white dark:bg-amber-950/40 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                    <th className="px-3 py-1.5 text-left font-medium">Field</th>
                    <th className="px-3 py-1.5 text-left font-medium">In Form (v{diff.versionNumber})</th>
                    <th className="px-3 py-1.5 text-center font-medium w-8"></th>
                    <th className="px-3 py-1.5 text-left font-medium">Current Data</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.mismatches.map((m) => (
                    <tr key={m.field} className="border-t border-amber-200 dark:border-amber-800">
                      <td className="px-3 py-1.5 font-medium text-amber-900 dark:text-amber-200">
                        {m.label}
                      </td>
                      <td className="px-3 py-1.5 text-red-600 dark:text-red-400 line-through">
                        {m.snapshotValue}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <ArrowRight className="h-3 w-3 text-amber-500 inline" />
                      </td>
                      <td className="px-3 py-1.5 text-green-700 dark:text-green-400 font-medium">
                        {m.currentValue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  )
}
