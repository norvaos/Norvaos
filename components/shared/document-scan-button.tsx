'use client'

import { useState } from 'react'
import { useScanDocument, type DocumentScanResult } from '@/lib/queries/documents'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, ScanSearch, CheckCircle2, AlertCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface DocumentScanButtonProps {
  /** The file to scan */
  file: File | null
  /** Optional hint for the document type (e.g. "passport", "ircc_acknowledgement") */
  documentTypeHint?: string
  /** Called with extracted fields when user confirms the scan results */
  onFieldsExtracted?: (fields: Record<string, string | number | null>, documentType: string) => void
  /** Called with the full scan result for persistence to ai_extracted_data */
  onScanComplete?: (scanResult: DocumentScanResult) => void
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  /** Button size */
  size?: 'default' | 'sm' | 'icon'
  /** Additional class names */
  className?: string
  /** Disabled state */
  disabled?: boolean
}

/** Field label formatting — converts snake_case keys to Title Case labels */
function formatFieldLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Reusable document scan button that triggers AI-powered document analysis.
 *
 * When clicked, sends the file to /api/documents/scan, then shows the
 * extracted results in a confirmation dialog. The user can review and
 * confirm, which triggers onFieldsExtracted with the structured data.
 */
export function DocumentScanButton({
  file,
  documentTypeHint,
  onFieldsExtracted,
  onScanComplete,
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
}: DocumentScanButtonProps) {
  const [showResults, setShowResults] = useState(false)
  const [scanResult, setScanResult] = useState<DocumentScanResult | null>(null)
  const scanMutation = useScanDocument()

  const handleScan = async () => {
    if (!file) {
      toast.error('Please select a file first')
      return
    }

    // Validate file type
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!supportedTypes.includes(file.type)) {
      toast.error('Only images (JPEG, PNG, WebP) and PDFs can be scanned')
      return
    }

    try {
      const result = await scanMutation.mutateAsync({
        file,
        documentTypeHint,
      })
      setScanResult(result)
      setShowResults(true)
    } catch {
      // Error toast is handled by the mutation
    }
  }

  const handleConfirm = () => {
    if (scanResult) {
      onFieldsExtracted?.(scanResult.extracted_fields, scanResult.detected_document_type)
      onScanComplete?.(scanResult)
    }
    setShowResults(false)
    toast.success('Scanned data applied')
  }

  const handleCopyAll = () => {
    if (!scanResult) return
    const text = Object.entries(scanResult.extracted_fields)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${formatFieldLabel(k)}: ${v}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const confidenceColour = (c: number) => {
    if (c >= 80) return 'border-green-300 text-green-700 bg-green-50'
    if (c >= 50) return 'border-amber-300 text-amber-700 bg-amber-50'
    return 'border-red-300 text-red-700 bg-red-50'
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleScan}
        disabled={disabled || !file || scanMutation.isPending}
      >
        {scanMutation.isPending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
            Scan Document
          </>
        )}
      </Button>

      {/* Scan Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Scan Results
            </DialogTitle>
            <DialogDescription>
              Review the extracted information below. Click &quot;Apply&quot; to populate the fields.
            </DialogDescription>
          </DialogHeader>

          {scanResult && (
            <div className="space-y-4 py-1">
              {/* Document type & confidence */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {scanResult.detected_document_type}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${confidenceColour(scanResult.confidence)}`}
                >
                  {scanResult.confidence}% confidence
                </Badge>
              </div>

              {/* Summary */}
              {scanResult.raw_text_summary && (
                <p className="text-sm text-muted-foreground italic">
                  {scanResult.raw_text_summary}
                </p>
              )}

              {/* Extracted fields */}
              <div className="border rounded-lg divide-y">
                {Object.entries(scanResult.extracted_fields).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-muted-foreground">
                      {formatFieldLabel(key)}
                    </span>
                    <span className={value === null ? 'text-muted-foreground/50 italic' : ''}>
                      {value === null ? 'Not found' : String(value)}
                    </span>
                  </div>
                ))}
              </div>

              {scanResult.confidence < 50 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    Low confidence score. Please verify the extracted data carefully before applying.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopyAll}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy All
            </Button>
            <Button variant="outline" onClick={() => setShowResults(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Apply Fields
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
