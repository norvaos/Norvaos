'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Copy,
  Archive,
  Trash2,
  Loader2,
  PackagePlus,
} from 'lucide-react'
import {
  useDocumentTemplates,
  useCreateTemplate,
  useCloneTemplate,
  useArchiveTemplate,
  useDeleteTemplate,
  useSeedTemplates,
} from '@/lib/queries/document-engine'
import { TemplateStatusBadge } from '@/components/document-engine/document-status-badge'
import { TemplateEditorSheet } from '@/components/document-engine/template-editor-sheet'
import { ClauseLibrarySheet } from '@/components/document-engine/clause-library-sheet'
import { DOCUMENT_TEMPLATE_CATEGORIES } from '@/lib/utils/constants'

export default function DocumentGenerationPage() {
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [clauseLibraryOpen, setClauseLibraryOpen] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ templateKey: '', name: '', documentFamily: '', description: '' })

  const { data: templates, isLoading } = useDocumentTemplates(
    familyFilter !== 'all' ? { documentFamily: familyFilter } : undefined
  )
  const createMutation = useCreateTemplate()
  const cloneMutation = useCloneTemplate()
  const archiveMutation = useArchiveTemplate()
  const deleteMutation = useDeleteTemplate()
  const seedMutation = useSeedTemplates()

  const filteredTemplates = ((templates ?? []) as Record<string, unknown>[]).filter((t) =>
    !search || (t.name as string).toLowerCase().includes(search.toLowerCase())
  )

  function handleCreate() {
    createMutation.mutate(newTemplate, {
      onSuccess: () => {
        setCreateDialogOpen(false)
        setNewTemplate({ templateKey: '', name: '', documentFamily: '', description: '' })
      },
    })
  }

  function handleClone(templateId: string, name: string) {
    const timestamp = Date.now()
    cloneMutation.mutate({
      sourceTemplateId: templateId,
      newTemplateKey: `clone-${timestamp}`,
      newName: `${name} (Copy)`,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Generation</h1>
          <p className="text-muted-foreground">Manage templates for automated document generation (retainers, letters, agreements).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
            Seed Defaults
          </Button>
          <Button variant="outline" onClick={() => setClauseLibraryOpen(true)}>
            Clause Library
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={familyFilter} onValueChange={setFamilyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All families" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Families</SelectItem>
            {DOCUMENT_TEMPLATE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Template List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No document generation templates found.</p>
            <Button variant="outline" className="mt-3" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id as string}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { setSelectedTemplateId(template.id as string); setEditorOpen(true) }}
            >
              <CardHeader className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">{template.name as string}</CardTitle>
                      <CardDescription className="text-xs">
                        {template.document_family as string}
                        {template.practice_area ? ` · ${String(template.practice_area)}` : null}
                        {template.jurisdiction_code ? ` · ${String(template.jurisdiction_code)}` : null}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TemplateStatusBadge status={template.status as string} />
                    {Boolean(template.is_system_template) && (
                      <Badge variant="outline" className="text-[10px]">System</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => handleClone(template.id as string, template.name as string)}>
                          <Copy className="h-4 w-4 mr-2" /> Clone
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => archiveMutation.mutate(template.id as string)}
                          disabled={template.is_system_template as boolean}
                        >
                          <Archive className="h-4 w-4 mr-2" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(template.id as string)}
                          disabled={template.is_system_template as boolean || template.status !== 'draft'}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document Template</DialogTitle>
            <DialogDescription>Create a new document generation template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Template Key</label>
              <Input
                placeholder="retainer-agreement-v2"
                value={newTemplate.templateKey}
                onChange={(e) => setNewTemplate({ ...newTemplate, templateKey: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Unique identifier. Use lowercase with hyphens.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input
                placeholder="Retainer Agreement"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Document Family</label>
              <Select
                value={newTemplate.documentFamily}
                onValueChange={(v) => setNewTemplate({ ...newTemplate, documentFamily: v })}
              >
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
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Input
                placeholder="Optional description"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTemplate.templateKey || !newTemplate.name || !newTemplate.documentFamily || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        templateId={selectedTemplateId}
      />

      <ClauseLibrarySheet
        open={clauseLibraryOpen}
        onOpenChange={setClauseLibraryOpen}
      />
    </div>
  )
}
