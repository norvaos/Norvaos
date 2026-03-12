'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useShareDocument } from '@/lib/queries/documents'
import { Share2, XCircle } from 'lucide-react'

const DOCUMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'legal', label: 'Legal' },
  { value: 'financial', label: 'Financial' },
  { value: 'identification', label: 'Identification' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'court_filing', label: 'Court Filing' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'employment', label: 'Employment' },
  { value: 'medical', label: 'Medical' },
  { value: 'other', label: 'Other' },
]

interface ShareDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: {
    id: string
    file_name: string
    category?: string | null
    description?: string | null
    is_shared_with_client?: boolean
  }
}

export function ShareDocumentDialog({
  open,
  onOpenChange,
  document,
}: ShareDocumentDialogProps) {
  const [displayName, setDisplayName] = useState(document.file_name)
  const [category, setCategory] = useState(document.category || 'general')
  const [description, setDescription] = useState(document.description || '')
  const isCurrentlyShared = !!document.is_shared_with_client

  const shareDoc = useShareDocument()

  const handleShare = async () => {
    await shareDoc.mutateAsync({
      documentId: document.id,
      share: true,
      displayName: displayName.trim() || document.file_name,
      category,
      description: description.trim() || undefined,
    })
    onOpenChange(false)
  }

  const handleUnshare = async () => {
    await shareDoc.mutateAsync({
      documentId: document.id,
      share: false,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share Document with Client
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isCurrentlyShared && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              This document is currently shared with the client.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="doc-name">Document Name (client-facing)</Label>
            <Input
              id="doc-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter a clear name for the client"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="doc-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-desc">Description (optional)</Label>
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description for the client"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {isCurrentlyShared && (
            <Button
              variant="outline"
              onClick={handleUnshare}
              disabled={shareDoc.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Stop Sharing
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={shareDoc.isPending}>
              {shareDoc.isPending ? 'Sharing...' : isCurrentlyShared ? 'Update & Share' : 'Share with Client'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
