'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Library, Pencil, ToggleLeft, ToggleRight, RefreshCw, Tag, ChevronDown, ChevronRight, FileText, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useTenantDocumentLibrary,
  useLibraryUsageCounts,
  useCreateLibraryEntry,
  useUpdateLibraryEntry,
  useDeactivateLibraryEntry,
  useRestoreLibraryEntry,
  useSyncLibraryEntry,
} from '@/lib/queries/tenant-document-library'
import type { Database } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'

type LibraryEntry = Database['public']['Tables']['tenant_document_library']['Row']

const CATEGORIES = [
  'identity',
  'immigration',
  'financial',
  'employment',
  'education',
  'relationship',
  'travel',
  'legal',
  'medical',
  'property',
  'general',
]

const BUNDLE_LABELS: Record<string, string> = {
  express_entry_pr: 'Express Entry PR',
  spousal_sponsorship: 'Spousal Sponsorship',
  work_permit: 'Work Permit',
  study_permit: 'Study Permit',
  visitor_visa_extension: 'Visitor Visa / Extension',
  refugee_claim: 'Refugee Claim',
  judicial_review: 'Judicial Review',
  citizenship: 'Citizenship',
  lmia: 'LMIA',
}

function EntryFormDialog({
  open,
  entry,
  tenantId,
  onClose,
}: {
  open: boolean
  entry: LibraryEntry | null
  tenantId: string
  onClose: () => void
}) {
  const isEdit = !!entry
  const create = useCreateLibraryEntry()
  const update = useUpdateLibraryEntry()

  const [form, setForm] = useState({
    slot_name: entry?.slot_name ?? '',
    description: entry?.description ?? '',
    description_fr: entry?.description_fr ?? '',
    category: entry?.category ?? 'general',
    person_role_scope: entry?.person_role_scope ?? '',
    is_required: entry?.is_required ?? false,
  })

  // Reset form when entry changes
  useMemo(() => {
    setForm({
      slot_name: entry?.slot_name ?? '',
      description: entry?.description ?? '',
      description_fr: entry?.description_fr ?? '',
      category: entry?.category ?? 'general',
      person_role_scope: entry?.person_role_scope ?? '',
      is_required: entry?.is_required ?? false,
    })
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!form.slot_name.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      if (isEdit && entry) {
        await update.mutateAsync({
          id: entry.id,
          tenantId,
          updates: {
            slot_name: form.slot_name.trim(),
            description: form.description || null,
            description_fr: form.description_fr || null,
            category: form.category,
            person_role_scope: form.person_role_scope || null,
            is_required: form.is_required,
          },
        })
        toast.success('Entry updated')
      } else {
        await create.mutateAsync({
          tenant_id: tenantId,
          slot_name: form.slot_name.trim(),
          description: form.description || null,
          description_fr: form.description_fr || null,
          category: form.category,
          person_role_scope: form.person_role_scope || null,
          is_required: form.is_required,
        })
        toast.success('Entry added to library')
      }
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save')
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Library Entry' : 'Add to Library'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes apply to all matter types linked to this entry when synced.'
              : 'Add a document to the shared library. Assign it to matter types from the Matter Types settings.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Document Name *</Label>
            <Input
              value={form.slot_name}
              onChange={(e) => setForm((f) => ({ ...f, slot_name: e.target.value }))}
              placeholder="e.g. Valid Passport  -  Bio Page & Stamped Pages"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Person Scope</Label>
              <Select
                value={form.person_role_scope || '_none'}
                onValueChange={(v) => setForm((f) => ({ ...f, person_role_scope: v === '_none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any / None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any person</SelectItem>
                  <SelectItem value="any">Per person (all roles)</SelectItem>
                  <SelectItem value="principal_applicant">Principal applicant</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="dependent">Dependent</SelectItem>
                  <SelectItem value="co_sponsor">Co-sponsor</SelectItem>
                  <SelectItem value="employer">Employer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Client Instructions (English)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Describe what the client needs to provide and why..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Client Instructions (French)</Label>
            <Textarea
              value={form.description_fr}
              onChange={(e) => setForm((f) => ({ ...f, description_fr: e.target.value }))}
              rows={2}
              placeholder="French translation (optional)..."
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_required}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_required: v }))}
              id="is_required"
            />
            <Label htmlFor="is_required" className="cursor-pointer">
              Required by default
              <span className="block text-xs text-muted-foreground font-normal">
                Can be overridden per matter type
              </span>
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add to Library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EntryRow({
  entry,
  usageCount,
  tenantId,
  onEdit,
}: {
  entry: LibraryEntry
  usageCount: number
  tenantId: string
  onEdit: (entry: LibraryEntry) => void
}) {
  const deactivate = useDeactivateLibraryEntry()
  const restore = useRestoreLibraryEntry()
  const sync = useSyncLibraryEntry()

  async function handleToggle() {
    if (entry.is_active) {
      await deactivate.mutateAsync({ id: entry.id, tenantId })
      toast.success('Entry deactivated  -  no longer available when adding to matter types')
    } else {
      await restore.mutateAsync({ id: entry.id, tenantId })
      toast.success('Entry restored')
    }
  }

  async function handleSync() {
    await sync.mutateAsync({ libraryEntry: entry, tenantId })
    toast.success(`Synced definition to ${usageCount} linked template(s)`)
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 bg-white ${!entry.is_active ? 'opacity-50' : ''}`}>
      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900 truncate">{entry.slot_name}</span>
          {entry.is_required && (
            <Badge variant="secondary" className="text-[10px] text-red-400 bg-red-950/30 border-red-500/20 shrink-0">
              Required
            </Badge>
          )}
          {entry.person_role_scope && entry.person_role_scope !== 'any' && (
            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
              {entry.person_role_scope.replace(/_/g, ' ')}
            </Badge>
          )}
          {!entry.is_active && (
            <Badge variant="outline" className="text-[10px] text-slate-400 shrink-0">inactive</Badge>
          )}
        </div>
        {entry.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {(entry.tags ?? []).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="h-3 w-3 text-slate-300" />
              {(entry.tags ?? []).map((t) => (
                <span key={t} className="text-[10px] text-slate-400 bg-slate-50 border rounded px-1">
                  {BUNDLE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}
          {usageCount > 0 && (
            <span className="text-[10px] text-slate-400">
              {usageCount} matter type{usageCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {usageCount > 0 && entry.is_active && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={`Sync definition to ${usageCount} linked template(s)`}
            onClick={handleSync}
            disabled={sync.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onEdit(entry)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleToggle}
          disabled={deactivate.isPending || restore.isPending}
          title={entry.is_active ? 'Deactivate' : 'Restore'}
        >
          {entry.is_active
            ? <ToggleRight className="h-4 w-4 text-green-600" />
            : <ToggleLeft className="h-4 w-4 text-slate-400" />}
        </Button>
      </div>
    </div>
  )
}

export default function DocumentLibraryPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: entries, isLoading } = useTenantDocumentLibrary(tenantId)
  const { data: usageCounts } = useLibraryUsageCounts(tenantId)

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [editEntry, setEditEntry] = useState<LibraryEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of entries ?? []) {
      for (const t of (e.tags ?? [])) tags.add(t)
    }
    return Array.from(tags).sort()
  }, [entries])

  const filtered = useMemo(() => {
    if (!entries) return []
    return entries.filter((e) => {
      if (!showInactive && !e.is_active) return false
      if (filterCategory !== 'all' && e.category !== filterCategory) return false
      if (filterTag !== 'all' && !(e.tags ?? []).includes(filterTag)) return false
      if (search) {
        const q = search.toLowerCase()
        return e.slot_name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [entries, search, filterCategory, filterTag, showInactive])

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>()
    for (const e of filtered) {
      const cat = e.category || 'general'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(e)
    }
    return map
  }, [filtered])

  const totalActive = entries?.filter((e) => e.is_active).length ?? 0

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function openAdd() {
    setEditEntry(null)
    setDialogOpen(true)
  }

  function openEdit(entry: LibraryEntry) {
    setEditEntry(entry)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-slate-600" />
            <h1 className="text-xl font-semibold text-slate-900">Document Library</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shared catalogue of document and form definitions. Assign entries to matter types instead of creating duplicates.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span><strong className="text-slate-900">{totalActive}</strong> active entries</span>
        {entries && entries.length > totalActive && (
          <span><strong className="text-slate-400">{entries.length - totalActive}</strong> inactive</span>
        )}
        <span><strong className="text-slate-900">{grouped.size}</strong> categories</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Bundle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bundles</SelectItem>
            {allTags.map((t) => (
              <SelectItem key={t} value={t}>{BUNDLE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer select-none ml-1">
          <Checkbox
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(!!v)}
          />
          Show inactive
        </label>
      </div>

      {/* Library grouped by category */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : grouped.size === 0 ? (
        <div className="py-12 text-center rounded-lg border-2 border-dashed">
          <Library className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            {search || filterCategory !== 'all' || filterTag !== 'all'
              ? 'No entries match your filters.'
              : 'Library is empty. Run the seed script or add entries manually.'}
          </p>
          {!search && filterCategory === 'all' && filterTag === 'all' && (
            <p className="text-xs text-slate-400 mt-1">
              Run: <code className="bg-slate-100 px-1 rounded">npx tsx scripts/seed-tenant-document-library.ts</code>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, items]) => {
            const collapsed = collapsedCategories.has(category)
            return (
              <div key={category} className="rounded-lg border bg-slate-50/40">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 rounded-t-lg"
                  onClick={() => toggleCategory(category)}
                >
                  {collapsed
                    ? <ChevronRight className="h-4 w-4 text-slate-400" />
                    : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  <span className="text-sm font-semibold capitalize text-slate-700">{category}</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">{items.length}</Badge>
                </button>
                {!collapsed && (
                  <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
                    {items.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        usageCount={usageCounts?.[entry.id] ?? 0}
                        tenantId={tenantId}
                        onEdit={openEdit}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <EntryFormDialog
        open={dialogOpen}
        entry={editEntry}
        tenantId={tenantId}
        onClose={() => {
          setDialogOpen(false)
          setEditEntry(null)
        }}
      />
    </div>
  )
}
