'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Loader2, FileText } from 'lucide-react'
import { useDocumentTemplates, useGenerateDocument, usePreviewFields } from '@/lib/queries/document-engine'

interface GenerateDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId: string
  contactId?: string
}

export function GenerateDocumentDialog({
  open,
  onOpenChange,
  matterId,
  contactId,
}: GenerateDocumentDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [step, setStep] = useState<'select' | 'preview' | 'generating'>('select')

  const { data: templates, isLoading: templatesLoading } = useDocumentTemplates({ status: 'published' })
  const { data: preview, isLoading: previewLoading } = usePreviewFields(
    selectedTemplateId
      ? { templateId: selectedTemplateId, matterId, contactId }
      : null
  )
  const generateMutation = useGenerateDocument()

  const missingRequired = (preview as Record<string, unknown>)?.missingRequired as { field_key: string; display_name: string }[] ?? []
  const resolvedFields = (preview as Record<string, unknown>)?.resolvedFields as { field_key: string; display_name: string; resolved_value: string; was_empty: boolean }[] ?? []
  const canGenerate = missingRequired.length === 0 && selectedTemplateId

  function handleGenerate() {
    setStep('generating')
    generateMutation.mutate(
      { templateId: selectedTemplateId, matterId, contactId },
      {
        onSuccess: () => {
          onOpenChange(false)
          setStep('select')
          setSelectedTemplateId('')
        },
        onError: () => {
          setStep('preview')
        },
      }
    )
  }

  function handleClose() {
    onOpenChange(false)
    setStep('select')
    setSelectedTemplateId('')
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Document
          </DialogTitle>
          <DialogDescription>
            Select a template and review fields before generating.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Template Selection */}
        {step === 'select' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Template</label>
              <Select value={selectedTemplateId} onValueChange={(v) => { setSelectedTemplateId(v); setStep('preview') }}>
                <SelectTrigger>
                  <SelectValue placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'} />
                </SelectTrigger>
                <SelectContent>
                  {(templates as { id: string; name: string; document_family: string }[] ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      <span className="text-muted-foreground ml-2 text-xs">({t.document_family})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2: Field Preview */}
        {step === 'preview' && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Resolving fields...</span>
              </div>
            ) : (
              <>
                {missingRequired.length > 0 && (
                  <div className="rounded-md border border-red-500/20 bg-red-950/30 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-400 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      Missing Required Fields
                    </div>
                    <ul className="text-sm text-red-600 space-y-1">
                      {missingRequired.map((f) => (
                        <li key={f.field_key}>- {f.display_name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Resolved Fields</p>
                  <div className="space-y-1">
                    {resolvedFields.map((f) => (
                      <div key={f.field_key} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                        <span className="text-muted-foreground">{f.display_name}</span>
                        <span className="font-mono text-xs max-w-[200px] truncate">
                          {f.was_empty ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/20 bg-amber-950/30 text-[10px]">empty</Badge>
                          ) : (
                            f.resolved_value
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Generating document...</p>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
              <Button onClick={handleGenerate} disabled={!canGenerate || generateMutation.isPending}>
                {generateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Generate</>
                )}
              </Button>
            </>
          )}
          {step === 'select' && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
