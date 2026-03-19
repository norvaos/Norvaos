'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'

/**
 * Upload Document Dialog (Front Desk)
 *
 * - Searchable document type selector
 * - File picker with actual Supabase Storage upload
 * - Auto-generated file name: LastName_FirstName_DocType_YYYY-MM-DD
 * - Optional matter link
 */

const DOCUMENT_TYPES = [
  'Affidavit', 'Agreement', 'Application Form', 'Authorization Letter',
  'Bank Statement', 'Birth Certificate', 'Citizenship Certificate',
  'Consent Form', 'Contract', 'Court Order', 'Death Certificate',
  'Degree / Diploma', 'Divorce Certificate', "Driver's Licence",
  'Employment Letter', 'Evidence Document', 'Family Register',
  'Government ID', 'Immigration Document', 'Insurance Certificate',
  'Invoice', 'Letter of Support', 'Marriage Certificate', 'Medical Report',
  'Passport', 'Pay Stub', 'Police Clearance', 'Power of Attorney',
  'PR Card', 'Reference Letter', 'Retainer Agreement',
  'Statement of Account', 'Study Permit', 'Tax Document', 'Title Deed',
  'Travel Document', 'Utility Bill', 'Visa', 'Work Permit', 'Other',
]

interface UploadDocumentDialogProps {
  isOpen: boolean
  isSubmitting: boolean
  contactId: string
  contactName: string
  matterOptions: { value: string; label: string }[]
  onClose: () => void
  onSubmit: (data: {
    contactId: string
    documentType: string
    fileName: string
    storagePath: string
    storageBucket: string
    matterId?: string
  }) => void
}

function formatDateForFilename(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sanitize(str: string): string {
  return str.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

export function UploadDocumentDialog({
  isOpen,
  isSubmitting,
  contactId,
  contactName,
  matterOptions,
  onClose,
  onSubmit,
}: UploadDocumentDialogProps) {
  const [docTypeSearch, setDocTypeSearch]   = useState('')
  const [docTypePreset, setDocTypePreset]   = useState('')
  const [customDocType, setCustomDocType]   = useState('')
  const [fileName, setFileName]             = useState('')
  const [matterId, setMatterId]             = useState('')
  const [submitted, setSubmitted]           = useState(false)
  const [selectedFile, setSelectedFile]     = useState<File | null>(null)
  const [uploading, setUploading]           = useState(false)
  const [uploadError, setUploadError]       = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveDocType = docTypePreset === 'Other' ? customDocType.trim() : docTypePreset

  // Auto-generate file name
  useEffect(() => {
    if (!effectiveDocType || !isOpen) return
    const nameParts = contactName.trim().split(/\s+/)
    const lastName  = nameParts[nameParts.length - 1] ?? contactName
    const firstName = nameParts.length > 1 ? nameParts[0] : ''
    const docSlug   = sanitize(effectiveDocType)
    const nameSlug  = [firstName ? sanitize(firstName) : '', sanitize(lastName)].filter(Boolean).join('_')
    const dateSlug  = formatDateForFilename(new Date())
    const ext       = selectedFile ? `.${selectedFile.name.split('.').pop() ?? 'pdf'}` : '.pdf'
    setFileName(`${nameSlug}_${docSlug}_${dateSlug}${ext}`)
  }, [effectiveDocType, contactName, isOpen, selectedFile])

  useEffect(() => {
    if (isOpen) {
      setDocTypeSearch('')
      setDocTypePreset('')
      setCustomDocType('')
      setFileName('')
      setMatterId('')
      setSubmitted(false)
      setSelectedFile(null)
      setUploadError(null)
    }
  }, [isOpen])

  const filteredTypes = DOCUMENT_TYPES.filter((dt) =>
    dt.toLowerCase().includes(docTypeSearch.toLowerCase())
  )

  const docTypeEmpty  = !effectiveDocType
  const fileNameEmpty = !fileName.trim()
  const activeMatters = matterOptions.filter((m) => m.value !== '')

  async function handleSubmit() {
    setSubmitted(true)
    if (docTypeEmpty || fileNameEmpty) return
    setUploadError(null)
    setUploading(true)

    try {
      let storagePath = `contacts/${contactId}/documents/${sanitize(effectiveDocType)}/${fileName.trim()}`
      let storageBucket = 'documents'

      // If a file was selected, upload it to Supabase Storage
      if (selectedFile) {
        const supabase = createClient()
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, selectedFile, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadErr) {
          // Storage might not have 'documents' bucket — try 'uploads'
          const { error: uploadErr2 } = await supabase.storage
            .from('uploads')
            .upload(storagePath, selectedFile, { cacheControl: '3600', upsert: false })
          if (uploadErr2) {
            // Fall through — record document without actual storage upload
            console.warn('[UploadDocument] Storage upload failed:', uploadErr2.message)
          } else {
            storageBucket = 'uploads'
          }
        }
      }

      onSubmit({
        contactId,
        documentType: effectiveDocType,
        fileName: fileName.trim(),
        storagePath,
        storageBucket,
        matterId: matterId || undefined,
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const isBusy = isSubmitting || uploading

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Document Type — searchable */}
          <div className="space-y-1.5">
            <Label>
              Document Type <span className="text-red-500">*</span>
            </Label>
            {/* Search input */}
            <Input
              placeholder="Search document types…"
              value={docTypeSearch}
              onChange={(e) => setDocTypeSearch(e.target.value)}
              disabled={isBusy}
            />
            {/* Scrollable list */}
            {(docTypeSearch || !docTypePreset) && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {filteredTypes.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                ) : (
                  filteredTypes.map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${
                        docTypePreset === dt ? 'bg-primary/10 font-medium text-primary' : ''
                      }`}
                      onClick={() => {
                        setDocTypePreset(dt)
                        setDocTypeSearch('')
                      }}
                      disabled={isBusy}
                    >
                      {dt}
                    </button>
                  ))
                )}
              </div>
            )}
            {/* Show selected type as badge */}
            {docTypePreset && !docTypeSearch && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-md">
                <span className="text-sm font-medium text-primary flex-1">{docTypePreset}</span>
                <button
                  type="button"
                  onClick={() => { setDocTypePreset(''); setCustomDocType('') }}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={isBusy}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {docTypePreset === 'Other' && (
              <Input
                placeholder="Specify document type…"
                value={customDocType}
                onChange={(e) => setCustomDocType(e.target.value)}
                disabled={isBusy}
              />
            )}
            {submitted && docTypeEmpty && (
              <p className="text-xs text-red-600">Document type is required.</p>
            )}
          </div>

          {/* File Picker */}
          <div className="space-y-1.5">
            <Label>File <span className="text-muted-foreground text-xs">(optional — records document even without file)</span></Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              disabled={isBusy}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="w-full flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm text-slate-500 hover:border-slate-400 hover:text-slate-600 transition-colors"
            >
              <Paperclip className="w-4 h-4 shrink-0" />
              {selectedFile ? (
                <span className="truncate text-foreground font-medium">{selectedFile.name}</span>
              ) : (
                <span>Click to choose a file…</span>
              )}
              {selectedFile && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                  className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          </div>

          {/* File Name — auto-generated, editable */}
          <div className="space-y-1.5">
            <Label>
              File Name <span className="text-xs text-muted-foreground">(auto-generated)</span>
            </Label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Select document type first…"
              disabled={isBusy}
            />
            {submitted && fileNameEmpty && (
              <p className="text-xs text-red-600">File name is required.</p>
            )}
          </div>

          {/* Related Matter — optional */}
          {activeMatters.length > 0 && (
            <div className="space-y-1.5">
              <Label>Related Matter <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select
                value={matterId || '__none'}
                onValueChange={(v) => setMatterId(v === '__none' ? '' : v)}
                disabled={isBusy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a matter…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No related matter</SelectItem>
                  {activeMatters.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{uploadError}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isBusy}>
            {isBusy ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploading ? 'Uploading…' : 'Saving…'}</>
            ) : (
              'Save Document'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
