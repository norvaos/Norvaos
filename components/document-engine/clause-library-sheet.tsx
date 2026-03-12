'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Plus,
  Search,
  Loader2,
  FileText,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DOCUMENT_TEMPLATE_CATEGORIES } from '@/lib/utils/constants'

interface ClauseLibrarySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? 'Request failed')
  return json
}

export function ClauseLibrarySheet({ open, onOpenChange }: ClauseLibrarySheetProps) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedClause, setSelectedClause] = useState<Record<string, unknown> | null>(null)

  // Placeholder — clause list would be fetched from an API endpoint (not yet built)
  // For now, show a helpful empty state since clause CRUD API routes are a Phase 2 refinement
  const clauses: Record<string, unknown>[] = []
  const isLoading = false

  const filteredClauses = clauses.filter((c) =>
    !search || (c.name as string).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Clause Library
          </SheetTitle>
          <SheetDescription>
            Reusable clauses that can be inserted into document templates via clause placeholders.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Search + Create */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clauses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>

          {/* Clause List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClauses.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No clauses in library yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Clauses are reusable text blocks (e.g., termination clause, payment terms) that can be
                conditionally inserted into document templates.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Create First Clause
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredClauses.map((clause) => (
                <button
                  key={clause.id as string}
                  onClick={() => setSelectedClause(clause)}
                  className="w-full flex items-start justify-between rounded-md border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{clause.name as string}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {clause.content as string}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="secondary" className="text-[9px]">{clause.document_family as string}</Badge>
                      <Badge variant="outline" className="text-[9px]">v{clause.version_number as number}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clause Detail View */}
        {selectedClause && (
          <div className="mt-6 border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{selectedClause.name as string}</h4>
              <Button variant="ghost" size="sm" onClick={() => setSelectedClause(null)}>Close</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Key:</span> <code className="bg-muted px-1 rounded">{selectedClause.clause_key as string}</code></div>
              <div><span className="text-muted-foreground">Family:</span> {selectedClause.document_family as string}</div>
              <div><span className="text-muted-foreground">Version:</span> v{selectedClause.version_number as number}</div>
              <div><span className="text-muted-foreground">Status:</span> {selectedClause.status as string}</div>
            </div>
            <div className="bg-muted/50 rounded-md p-3">
              <pre className="text-xs whitespace-pre-wrap font-mono">{selectedClause.content as string}</pre>
            </div>
          </div>
        )}

        {/* Create Clause Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Clause</DialogTitle>
              <DialogDescription>Add a reusable clause to the library.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Clause Key</label>
                <Input placeholder="termination-clause" />
                <p className="text-xs text-muted-foreground mt-1">Unique identifier. Use lowercase with hyphens.</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input placeholder="Termination Clause" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Document Family</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select family" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TEMPLATE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Content</label>
                <Textarea
                  placeholder="Enter clause content... Use {{field_key}} for merge fields."
                  rows={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" /> Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
