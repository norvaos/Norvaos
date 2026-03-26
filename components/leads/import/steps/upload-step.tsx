'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { useUploadImportCSV } from '@/lib/queries/bulk-lead-import'

interface UploadStepProps {
  onUploadComplete: (result: {
    batchId: string
    headers: string[]
    suggestedMapping: Record<string, string>
    preview: Record<string, string>[]
    totalRows: number
  }) => void
  uploadMutation: ReturnType<typeof useUploadImportCSV>
}

export function UploadStep({ onUploadComplete, uploadMutation }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      return
    }
    setFile(f)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleUpload = useCallback(async () => {
    if (!file) return
    const result = await uploadMutation.mutateAsync({ file })
    onUploadComplete(result)
  }, [file, uploadMutation, onUploadComplete])

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-slate-300 hover:border-slate-400 dark:border-slate-600'
        }`}
      >
        <Upload className="h-10 w-10 text-slate-400 mb-3" />
        <p className="text-sm font-medium">
          Drop your CSV file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          The Norva Gatekeeper will scan every row for conflicts, duplicates, and jurisdiction matches before anything touches your database.
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          CSV files only, up to 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>

      {/* Selected file */}
      {file && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); setFile(null) }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Upload button */}
      <div className="flex justify-end">
        <Button
          onClick={handleUpload}
          disabled={!file || uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            'Upload & Analyse'
          )}
        </Button>
      </div>
    </div>
  )
}
