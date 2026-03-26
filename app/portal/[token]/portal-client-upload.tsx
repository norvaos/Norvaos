'use client'

/**
 * PortalClientUpload  -  Allows clients to submit ad-hoc documents
 * with a required name and optional description.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getTranslations, type PortalLocale } from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'
import { cn } from '@/lib/utils'

interface ClientDocument {
  id: string
  file_name: string
  file_type: string | null
  file_size: number | null
  created_at: string
}

interface PortalClientUploadProps {
  token: string
  primaryColor: string
  language: PortalLocale
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PortalClientUpload({
  token,
  primaryColor,
  language,
}: PortalClientUploadProps) {
  const tr = getTranslations(language)
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [documentName, setDocumentName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/client-upload`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setDocuments(data.documents ?? [])
    } catch {
      // Silent  -  non-critical
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setError(null)
    setSuccess(false)
    // Pre-fill document name from file name if empty
    if (!documentName) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
      setDocumentName(nameWithoutExt)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !documentName.trim()) return
    setUploading(true)
    setError(null)
    setSuccess(false)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('document_name', documentName.trim())
      if (description.trim()) {
        formData.append('description', description.trim())
      }

      const res = await fetch(`/api/portal/${token}/client-upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      track('client_document_uploaded', { file_name: documentName.trim() })

      // Reset form
      setDocumentName('')
      setDescription('')
      setSelectedFile(null)
      setSuccess(true)
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Refresh document list
      fetchDocuments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <div className="space-y-3">
        {/* Document name */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {tr.client_upload_name_label ?? 'Document Name'} *
          </label>
          <input
            type="text"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder={tr.client_upload_name_placeholder ?? 'e.g., Employment Letter'}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {tr.client_upload_description_label ?? 'Description (optional)'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
          />
        </div>

        {/* "Breeze" Upload Drop Zone (Directive 046) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden',
            dragOver
              ? 'border-emerald-400 scale-[1.01]'
              : selectedFile
                ? 'border-emerald-300'
                : 'border-slate-200 hover:border-slate-300',
          )}
          style={{
            background: dragOver
              ? `linear-gradient(135deg, ${primaryColor}10 0%, #ecfdf510 50%, ${primaryColor}08 100%)`
              : selectedFile
                ? 'linear-gradient(135deg, #ecfdf5 0%, white 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, white 100%)',
            boxShadow: dragOver
              ? `0 0 30px ${primaryColor}15, inset 0 0 30px ${primaryColor}05`
              : selectedFile
                ? '0 4px 12px rgba(16,185,129,0.08)'
                : undefined,
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {/* Glow effect on drag */}
          {dragOver && (
            <div className="absolute inset-0 animate-pulse" style={{
              background: `radial-gradient(circle at center, ${primaryColor}10 0%, transparent 70%)`,
            }} />
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelect(file)
            }}
          />
          {selectedFile ? (
            <div className="relative flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 shadow-sm">
                <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-emerald-800 truncate max-w-full">{selectedFile.name}</span>
              <span className="text-xs text-emerald-600 font-medium">{formatFileSize(selectedFile.size)}</span>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                  boxShadow: `0 4px 16px ${primaryColor}25`,
                }}
              >
                <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {dragOver ? 'Drop to upload' : 'Tap to upload or take a photo'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">PDF, images, Word, Excel  -  up to 10 MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200/60 px-3 py-2">
            <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200/60 px-3 py-2">
            <svg className="h-4 w-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            <p className="text-xs text-emerald-700 font-medium">
              {tr.client_upload_success ?? 'Document submitted successfully'}
            </p>
          </div>
        )}

        {/* Upload button */}
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !documentName.trim()}
          className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-40 shadow-lg hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${primaryColor || '#2563eb'}, ${primaryColor || '#2563eb'}dd)`,
            boxShadow: `0 4px 14px ${primaryColor || '#2563eb'}30`,
          }}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading...
            </span>
          ) : (
            tr.client_upload_button ?? 'Upload Document'
          )}
        </button>
      </div>

      {/* Previously submitted documents */}
      {!loading && documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Previously submitted
          </p>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <svg className="h-4 w-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</p>
                <p className="text-[11px] text-slate-500">
                  {new Date(doc.created_at).toLocaleDateString(language, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                Submitted
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
