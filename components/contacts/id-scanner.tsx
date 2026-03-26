'use client'

/**
 * ID Scanner — Upload a government ID and auto-populate contact fields.
 *
 * Uses POST /api/ocr/scan-id to extract structured data from the image.
 * Returns extracted fields via the onScanComplete callback for the
 * parent form to merge into its state.
 */

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScanLine, Camera, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IdScanFields } from '@/lib/services/ocr/id-field-parser'

interface IdScannerProps {
  /** Called when OCR extraction succeeds */
  onScanComplete: (fields: IdScanFields) => void
  /** Compact mode for inline use */
  compact?: boolean
  className?: string
}

type ScanState = 'idle' | 'uploading' | 'processing' | 'success' | 'error'

export function IdScanner({ onScanComplete, compact, className }: IdScannerProps) {
  const [state, setState] = useState<ScanState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fieldsFound, setFieldsFound] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setState('uploading')

    // Validate file
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Please upload an image (JPEG, PNG) or PDF.')
      setState('error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB.')
      setState('error')
      return
    }

    // Show preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    }

    try {
      setState('processing')

      // Compress and convert to base64 (reduces 5MB → ~200KB)
      const base64 = await compressImage(file)

      const res = await fetch('/api/ocr/scan-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, fileName: file.name }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Scan failed')
        setState('error')
        return
      }

      const fields = data.data.fields as IdScanFields
      const rawText = data.data.rawText as string
      console.log('[IdScanner] Raw OCR text:', rawText)
      console.log('[IdScanner] Parsed fields:', fields)
      const count = Object.values(fields).filter(v => v !== null && v !== 'unknown').length
      setFieldsFound(count)
      setState('success')
      onScanComplete(fields)
    } catch (err) {
      console.error('[IdScanner] Error:', err)
      setError('Network error — please try again.')
      setState('error')
    }
  }, [onScanComplete])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [handleFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const reset = useCallback(() => {
    setState('idle')
    setError(null)
    setPreview(null)
    setFieldsFound(0)
  }, [])

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  'gap-1.5',
                  state === 'success' && 'border-emerald-300 text-emerald-700',
                )}
                onClick={() => inputRef.current?.click()}
                disabled={state === 'processing' || state === 'uploading'}
              >
                {state === 'processing' || state === 'uploading' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : state === 'success' ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <ScanLine className="size-3.5" />
                )}
                {state === 'processing' ? 'Scanning...' : state === 'success' ? `${fieldsFound} Fields` : 'Scan ID'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Upload a driver's licence, passport, or PR card to auto-fill contact fields.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {state === 'success' && (
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={reset}>
            <X className="size-3" />
          </Button>
        )}
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        state === 'idle' && 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30',
        state === 'processing' && 'border-blue-300 bg-blue-50/30',
        state === 'success' && 'border-emerald-300 bg-emerald-50/30',
        state === 'error' && 'border-red-300 bg-red-50/30',
        className,
      )}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Preview thumbnail */}
      {preview && (
        <div className="mb-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="ID preview"
            className="max-h-24 rounded border border-slate-200 object-contain"
          />
        </div>
      )}

      {state === 'idle' && (
        <>
          <Camera className="mx-auto size-8 text-slate-400 mb-2" />
          <p className="text-sm font-medium text-slate-700">Scan Government ID</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Upload or photograph a driver's licence, passport, or PR card.
            Fields will auto-populate.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <ScanLine className="size-3.5" />
            Choose File or Take Photo
          </Button>
        </>
      )}

      {(state === 'uploading' || state === 'processing') && (
        <>
          <Loader2 className="mx-auto size-8 text-blue-500 animate-spin mb-2" />
          <p className="text-sm font-medium text-blue-700">
            {state === 'uploading' ? 'Uploading...' : 'Extracting Fields...'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            OCR engine is reading the document.
          </p>
        </>
      )}

      {state === 'success' && (
        <>
          <CheckCircle2 className="mx-auto size-8 text-emerald-500 mb-2" />
          <p className="text-sm font-medium text-emerald-700">
            {fieldsFound} Fields Extracted
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Review the auto-filled fields below. Edit anything that needs correction.
          </p>
          <div className="flex justify-center gap-2">
            <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
              Auto-Populated
            </Badge>
            <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={reset}>
              Scan Another
            </Button>
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertTriangle className="mx-auto size-8 text-red-400 mb-2" />
          <p className="text-sm font-medium text-red-700">Scan Failed</p>
          <p className="text-xs text-destructive mt-1 mb-3">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { reset(); inputRef.current?.click() }}
          >
            <ScanLine className="size-3.5" />
            Try Again
          </Button>
        </>
      )}
    </div>
  )
}

/**
 * Compress and resize image client-side before sending to OCR.
 * Targets max 1200px on longest edge and JPEG quality 0.8.
 * This reduces a 5MB phone photo to ~150-300KB — dramatically
 * faster upload and OCR processing.
 */
function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    // PDFs can't be compressed client-side — send raw
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
