'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TranslationsEditor } from '@/components/ui/translations-editor'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useUploadIrccForm,
  useAddStreamFormToMatterType,
} from '@/lib/queries/ircc-forms'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function UploadFormDialog({
  open,
  onOpenChange,
  defaultPracticeAreaId,
  defaultMatterTypeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPracticeAreaId?: string
  defaultMatterTypeId?: string
}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const uploadMutation = useUploadIrccForm()
  const addToMatterType = useAddStreamFormToMatterType()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({})
  const [dragOver, setDragOver] = useState(false)

  // Cascading Practice Area → Matter Type selection
  const [selectedPracticeAreaId, setSelectedPracticeAreaId] = useState<string>(defaultPracticeAreaId ?? '')
  const [selectedMatterTypeId, setSelectedMatterTypeId] = useState<string>(defaultMatterTypeId ?? '')

  const { data: practiceAreas } = useQuery({
    queryKey: ['practice-areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  const { data: matterTypes } = useMatterTypes(tenantId, selectedPracticeAreaId || undefined)

  const resetForm = () => {
    setFile(null)
    setFormCode('')
    setFormName('')
    setDescription('')
    setDescriptionTranslations({})
    setDragOver(false)
    setSelectedPracticeAreaId(defaultPracticeAreaId ?? '')
    setSelectedMatterTypeId(defaultMatterTypeId ?? '')
  }

  const handleClose = (open: boolean) => {
    if (!open) resetForm()
    onOpenChange(open)
  }

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are accepted')
      return
    }
    setFile(selectedFile)

    // Auto-fill form code from filename (e.g. "IMM5257E.pdf" → "IMM5257E")
    if (!formCode) {
      const name = selectedFile.name.replace(/\.pdf$/i, '').toUpperCase()
      setFormCode(name)
    }
  }

  const handleSubmit = async () => {
    if (!file || !formCode || !formName) {
      toast.error('File, form code, and form name are required')
      return
    }

    try {
      const result = await uploadMutation.mutateAsync({
        file,
        formCode,
        formName,
        description: description || undefined,
        descriptionTranslations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : undefined,
      })

      // Auto-assign to matter type if selected
      if (selectedMatterTypeId && result?.form_id) {
        await addToMatterType.mutateAsync({
          tenantId,
          matterTypeId: selectedMatterTypeId,
          formId: result.form_id,
        })
      }

      handleClose(false)
    } catch {
      // Error handled by mutation onError
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload IRCC Form Template</DialogTitle>
          <DialogDescription>
            Upload a blank IRCC PDF form. The system will automatically scan and extract all XFA fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
              dragOver
                ? 'border-primary bg-primary/5'
                : file
                  ? 'border-emerald-500/30 bg-emerald-950/30'
                  : 'border-slate-200 hover:border-slate-300'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const droppedFile = e.dataTransfer.files[0]
              if (droppedFile) handleFileSelect(droppedFile)
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0]
                if (selected) handleFileSelect(selected)
              }}
            />
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">{file.name}</p>
                  <p className="text-xs text-green-600">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  className="ml-2 rounded-full p-1 hover:bg-emerald-950/40"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                  }}
                >
                  <X className="h-4 w-4 text-green-600" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-600">
                  Drop PDF here or <span className="font-medium text-primary">click to browse</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">Only IRCC PDF forms (.pdf)</p>
              </>
            )}
          </div>

          {/* Form Code */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Form Code</label>
            <Input
              placeholder="e.g. IMM5257E"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            />
          </div>

          {/* Form Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Form Name</label>
            <Input
              placeholder="e.g. Application for Temporary Resident Visa"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <Input
              placeholder="Brief description of this form (English)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <TranslationsEditor
              translations={descriptionTranslations}
              onChange={setDescriptionTranslations}
              placeholder="Translated description..."
            />
          </div>

          {/* Practice Area → Matter Type (optional auto-assign) */}
          <div className="rounded-lg border border-dashed border-slate-200 p-3 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Auto-assign to Matter Type <span className="text-slate-400 normal-case">(optional)</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Practice Area</label>
                <Select
                  value={selectedPracticeAreaId}
                  onValueChange={(v) => {
                    setSelectedPracticeAreaId(v)
                    setSelectedMatterTypeId('')
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select practice area" />
                  </SelectTrigger>
                  <SelectContent>
                    {practiceAreas?.map((pa) => (
                      <SelectItem key={pa.id} value={pa.id}>
                        {pa.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Matter Type</label>
                <Select
                  value={selectedMatterTypeId}
                  onValueChange={setSelectedMatterTypeId}
                  disabled={!selectedPracticeAreaId}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={selectedPracticeAreaId ? 'Select type' : 'Select practice area first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {matterTypes?.map((mt) => (
                      <SelectItem key={mt.id} value={mt.id}>
                        {mt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !formCode || !formName || uploadMutation.isPending}
            className="gap-2"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload &amp; Scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
