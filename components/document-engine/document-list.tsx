'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Plus, Loader2 } from 'lucide-react'
import { useDocumentInstances } from '@/lib/queries/document-engine'
import { DocumentStatusBadge } from './document-status-badge'
import { DocumentInstanceSheet } from './document-instance-sheet'
import { GenerateDocumentDialog } from './generate-document-dialog'

interface DocumentListProps {
  matterId: string
  contactId?: string
}

export function DocumentList({ matterId, contactId }: DocumentListProps) {
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: instances, isLoading } = useDocumentInstances({ matterId })

  const docs = (instances ?? []) as {
    id: string
    title: string
    status: string
    document_family: string
    created_at: string
  }[]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Generated Documents
        </h3>
        <Button size="sm" variant="outline" onClick={() => setGenerateDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Generate
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No documents generated yet.
        </p>
      ) : (
        <div className="space-y-1">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => { setSelectedInstanceId(doc.id); setSheetOpen(true) }}
              className="w-full flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.document_family} &middot; {new Date(doc.created_at).toLocaleDateString()}
                </p>
              </div>
              <DocumentStatusBadge status={doc.status} />
            </button>
          ))}
        </div>
      )}

      <GenerateDocumentDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        matterId={matterId}
        contactId={contactId}
      />

      <DocumentInstanceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        instanceId={selectedInstanceId}
      />
    </div>
  )
}
