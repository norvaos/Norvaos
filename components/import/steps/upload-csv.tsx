'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validateCSVFile } from '@/lib/services/import/csv-parser'

interface UploadCsvProps {
  onUpload: (file: File) => void
  isUploading: boolean
  onBack: () => void
}

export function UploadCsv({ onUpload, isUploading, onBack }: UploadCsvProps) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFile = useCallback((f: File) => {
    const validationError = validateCSVFile({ name: f.name, size: f.size })
    if (validationError) {
      setError(validationError)
      setFile(null)
      return
    }
    setError(null)
    setFile(f)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Upload CSV File</h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload the CSV file exported from your source platform. Maximum file size: 10 MB.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-all',
          isDragOver ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50',
          file && 'border-emerald-500/30 bg-emerald-950/30',
        )}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null)
                setError(null)
              }}
              className="ml-2 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-slate-400 mb-3" />
            <p className="text-sm text-slate-600">
              Drag and drop your CSV file here, or{' '}
              <label className="text-primary font-medium cursor-pointer hover:underline">
                browse
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleFileInput}
                />
              </label>
            </p>
            <p className="text-xs text-slate-400 mt-1">CSV files only, up to 10 MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() => file && onUpload(file)}
          disabled={!file || isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload & Analyse'}
        </Button>
      </div>
    </div>
  )
}
