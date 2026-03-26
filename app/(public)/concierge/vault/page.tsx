'use client'

/**
 * Vault Drop  -  Instant-Hash Document Upload (Directive 33.0 §B)
 *
 * Public-facing secure file upload. Computes SHA-256 hash client-side
 * immediately on file selection (InstantHash listener), then uploads
 * to the Norva Vault with the hash attached as integrity proof.
 *
 * No authentication required  -  files are held in a quarantine bucket
 * until linked to a matter by staff.
 */

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  ArrowLeft,
  Lock,
  ScanSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { NorvaLogo } from '@/components/landing/norva-logo'

// ── Types ────────────────────────────────────────────────────────────────────

interface VaultFile {
  file: File
  sha256: string
  status: 'hashing' | 'hashed' | 'uploading' | 'complete' | 'error'
  error?: string
  autoScan?: boolean
}

// ── SHA-256 hash computation ─────────────────────────────────────────────────

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VaultDropPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<VaultFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Instant-Hash listener: compute SHA-256 on file selection ───────────
  const processFiles = useCallback(async (fileList: FileList) => {
    const newFiles: VaultFile[] = Array.from(fileList).map(f => ({
      file: f,
      sha256: '',
      status: 'hashing' as const,
    }))

    setFiles(prev => [...prev, ...newFiles])

    // Hash each file in parallel
    for (let i = 0; i < newFiles.length; i++) {
      const entry = newFiles[i]
      try {
        const hash = await computeSHA256(entry.file)
        setFiles(prev =>
          prev.map(f =>
            f.file === entry.file
              ? { ...f, sha256: hash, status: 'hashed' as const }
              : f
          )
        )
      } catch {
        setFiles(prev =>
          prev.map(f =>
            f.file === entry.file
              ? { ...f, status: 'error' as const, error: 'Hash computation failed' }
              : f
          )
        )
      }
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
    }
  }, [processFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  // ── Upload all hashed files ───────────────────────────────────────────
  const uploadAll = useCallback(async () => {
    const toUpload = files.filter(f => f.status === 'hashed')

    for (const entry of toUpload) {
      setFiles(prev =>
        prev.map(f =>
          f.file === entry.file ? { ...f, status: 'uploading' as const } : f
        )
      )

      try {
        const formData = new FormData()
        formData.append('file', entry.file)
        formData.append('sha256', entry.sha256)
        formData.append('source', 'vault_drop')

        const res = await fetch('/api/documents/vault-drop', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')

        const result = await res.json()

        setFiles(prev =>
          prev.map(f =>
            f.file === entry.file
              ? { ...f, status: 'complete' as const, autoScan: result.auto_scan ?? false }
              : f
          )
        )
      } catch (err) {
        setFiles(prev =>
          prev.map(f =>
            f.file === entry.file
              ? { ...f, status: 'error' as const, error: 'Upload failed' }
              : f
          )
        )
      }
    }
  }, [files])

  const hashedCount = files.filter(f => f.status === 'hashed').length
  const completeCount = files.filter(f => f.status === 'complete').length

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => router.push('/concierge')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <NorvaLogo size={24} id="vault" />
          <span className="text-sm font-semibold">Norva Vault</span>
          <Lock className="h-3.5 w-3.5 text-emerald-500" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto w-full">
        <ShieldCheck className="h-12 w-12 text-emerald-500 mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-1">Secure Document Upload</h1>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-md text-balance">
          Drop your files below. Each document is hash-verified with SHA-256 before upload
          to ensure tamper-proof storage in the Norva Vault.
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'w-full rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all',
            isDragOver
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
              : 'border-muted-foreground/20 hover:border-muted-foreground/40'
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Drag files here or click to browse
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            PDF, DOC, JPG, PNG  -  up to 25 MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff,.bmp"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="w-full mt-6 space-y-2">
            {files.map((entry, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-3 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground flex-none" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{(entry.file.size / 1024).toFixed(0)} KB</span>
                      {entry.sha256 && (
                        <span className="font-mono text-[9px]">
                          SHA: {entry.sha256.slice(0, 12)}...
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-none">
                    {entry.status === 'hashing' && (
                      <Badge variant="outline" className="text-[9px] gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Hashing
                      </Badge>
                    )}
                    {entry.status === 'hashed' && (
                      <Badge variant="outline" className="text-[9px] gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Verified
                      </Badge>
                    )}
                    {entry.status === 'uploading' && (
                      <Badge variant="outline" className="text-[9px] gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Uploading
                      </Badge>
                    )}
                    {entry.status === 'complete' && (
                      <div className="flex items-center gap-1">
                        <Badge className="text-[9px] gap-1 bg-emerald-500">
                          <CheckCircle className="h-2.5 w-2.5" />
                          Secure
                        </Badge>
                        {entry.autoScan && (
                          <Badge variant="outline" className="text-[9px] gap-1 border-blue-300 text-blue-700 dark:text-blue-400">
                            <ScanSearch className="h-2.5 w-2.5" />
                            Scanning
                          </Badge>
                        )}
                      </div>
                    )}
                    {entry.status === 'error' && (
                      <Badge variant="destructive" className="text-[9px]">
                        Error
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Upload button */}
            {hashedCount > 0 && (
              <Button
                className="w-full mt-4 gap-2"
                onClick={uploadAll}
              >
                <ShieldCheck className="h-4 w-4" />
                Upload {hashedCount} File{hashedCount !== 1 ? 's' : ''} to Norva Vault
              </Button>
            )}

            {completeCount > 0 && completeCount === files.length && (
              <div className="text-center mt-4 space-y-1">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  All files securely stored in the Norva Vault.
                </p>
                {files.some(f => f.autoScan) && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    Documents are being scanned  -  extracted information will auto-fill your intake forms.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Security footer */}
      <footer className="border-t px-6 py-3 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          Files are encrypted in transit (TLS 1.3) and at rest (AES-256).
          SHA-256 hashes are computed client-side before upload.
        </p>
      </footer>
    </div>
  )
}
