'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  RotateCcw,
  Tag,
  Eye,
  EyeOff,
  Filter,
  ScanSearch,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useIrccForm,
  useIrccFormFields,
  useIrccFormSections,
  useBulkUpdateIrccFormFields,
  useRescanIrccForm,
  useRelabelIrccFormFields,
  useFormVersions,
  useIrccFormArrayMaps,
} from '@/lib/queries/ircc-forms'
import {
  PROFILE_PATH_CATALOG,
  searchProfilePaths,
  getProfilePathSections,
  type ProfilePathEntry,
} from '@/lib/ircc/profile-path-catalog'
import type { IrccFormField, IrccFormFieldUpdate } from '@/lib/types/ircc-forms'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingUpdate {
  fieldId: string
  updates: IrccFormFieldUpdate
}

type MappingFilter = 'all' | 'mapped' | 'unmapped' | 'required_unmapped'

// ── Profile Path Picker ───────────────────────────────────────────────────────

function ProfilePathPicker({
  value,
  onSelect,
}: {
  value: string | null
  onSelect: (path: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchProfilePaths(query), [query])
  const sections = useMemo(() => {
    const secs = new Map<string, ProfilePathEntry[]>()
    for (const entry of results) {
      const list = secs.get(entry.section) ?? []
      list.push(entry)
      secs.set(entry.section, list)
    }
    return secs
  }, [results])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`justify-start font-mono text-xs min-w-[200px] ${
            value ? '' : 'text-muted-foreground'
          }`}
        >
          {value ? (
            <>
              <Link2 className="mr-1.5 h-3 w-3 text-green-600 shrink-0" />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <>
              <Unlink className="mr-1.5 h-3 w-3 shrink-0" />
              <span>Select profile path...</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search paths..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No matching profile paths.</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onSelect(null)
                    setOpen(false)
                  }}
                  className="text-destructive"
                >
                  <XCircle className="mr-2 h-3.5 w-3.5" />
                  Clear mapping
                </CommandItem>
              </CommandGroup>
            )}
            {Array.from(sections.entries()).map(([section, entries]) => (
              <CommandGroup key={section} heading={section}>
                {entries.map((entry) => (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    onSelect={() => {
                      onSelect(entry.path)
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs">{entry.path}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.label} ({entry.type})
                      </span>
                    </div>
                    {entry.path === value && (
                      <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-600" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminIrccFormDetailPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.formId as string

  const { data: form, isLoading: formLoading } = useIrccForm(formId)
  const { data: fields, isLoading: fieldsLoading } = useIrccFormFields(formId)
  const { data: sections } = useIrccFormSections(formId)
  const { data: versions } = useFormVersions(formId)
  const { data: arrayMaps } = useIrccFormArrayMaps(formId)

  const bulkUpdateMutation = useBulkUpdateIrccFormFields()
  const rescanMutation = useRescanIrccForm()
  const relabelMutation = useRelabelIrccFormFields()

  // ── State ──
  const [search, setSearch] = useState('')
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, PendingUpdate>>(new Map())
  const [expandedField, setExpandedField] = useState<string | null>(null)

  // ── Computed ──
  const allFields = fields ?? []
  const totalFields = allFields.length
  const mappedFields = allFields.filter((f) => f.is_mapped).length
  const unmappedFields = totalFields - mappedFields
  const requiredUnmapped = allFields.filter((f) => f.is_required && !f.is_mapped).length
  const metaFields = allFields.filter((f) => f.is_meta_field).length
  const clientVisible = allFields.filter((f) => f.is_client_visible).length
  const mappingPct = totalFields > 0 ? Math.round((mappedFields / totalFields) * 100) : 0

  const sectionKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const s of sections ?? []) {
      keys.add(s.section_key)
    }
    return Array.from(keys).sort()
  }, [sections])

  const sectionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sections ?? []) {
      map.set(s.id, s.title)
    }
    return map
  }, [sections])

  // ── Filtered fields ──
  const filteredFields = useMemo(() => {
    return allFields.filter((f) => {
      // Search
      if (search) {
        const q = search.toLowerCase()
        const matchesXfa = f.xfa_path.toLowerCase().includes(q)
        const matchesProfile = f.profile_path?.toLowerCase().includes(q) ?? false
        const matchesLabel = f.label?.toLowerCase().includes(q) ?? false
        const matchesSuggested = f.suggested_label?.toLowerCase().includes(q) ?? false
        if (!matchesXfa && !matchesProfile && !matchesLabel && !matchesSuggested) return false
      }

      // Mapping filter
      if (mappingFilter === 'mapped' && !f.is_mapped) return false
      if (mappingFilter === 'unmapped' && f.is_mapped) return false
      if (mappingFilter === 'required_unmapped' && (f.is_mapped || !f.is_required)) return false

      // Section filter
      if (sectionFilter !== 'all') {
        const fieldSection = f.section_id ? sectionMap.get(f.section_id) : null
        if (sectionFilter === 'unassigned') {
          if (fieldSection) return false
        } else if (fieldSection !== sectionFilter) {
          return false
        }
      }

      return true
    })
  }, [allFields, search, mappingFilter, sectionFilter, sectionMap])

  // ── Pending update helpers ──
  const setPendingMapping = (fieldId: string, profilePath: string | null) => {
    const existing = pendingUpdates.get(fieldId)
    const updates: IrccFormFieldUpdate = {
      ...existing?.updates,
      profile_path: profilePath ?? undefined,
    }
    setPendingUpdates((prev) => {
      const next = new Map(prev)
      next.set(fieldId, { fieldId, updates })
      return next
    })
  }

  const setPendingRequired = (fieldId: string, isRequired: boolean) => {
    const existing = pendingUpdates.get(fieldId)
    const updates: IrccFormFieldUpdate = {
      ...existing?.updates,
      is_required: isRequired,
    }
    setPendingUpdates((prev) => {
      const next = new Map(prev)
      next.set(fieldId, { fieldId, updates })
      return next
    })
  }

  const setPendingClientVisible = (fieldId: string, isClientVisible: boolean) => {
    const existing = pendingUpdates.get(fieldId)
    const updates: IrccFormFieldUpdate = {
      ...existing?.updates,
      is_client_visible: isClientVisible,
    }
    setPendingUpdates((prev) => {
      const next = new Map(prev)
      next.set(fieldId, { fieldId, updates })
      return next
    })
  }

  const hasPendingUpdates = pendingUpdates.size > 0

  const saveAll = () => {
    if (!hasPendingUpdates) return
    const updates = Array.from(pendingUpdates.values())
    bulkUpdateMutation.mutate(
      { formId, updates },
      {
        onSuccess: () => {
          setPendingUpdates(new Map())
          toast.success(`${updates.length} field${updates.length > 1 ? 's' : ''} updated`)
        },
      },
    )
  }

  const discardAll = () => {
    setPendingUpdates(new Map())
    toast.info('Changes discarded')
  }

  // ── Get effective value (pending or current) ──
  const getEffectiveProfilePath = (field: IrccFormField): string | null => {
    const pending = pendingUpdates.get(field.id)
    if (pending?.updates.profile_path !== undefined) {
      return pending.updates.profile_path || null
    }
    return field.profile_path
  }

  const getEffectiveRequired = (field: IrccFormField): boolean => {
    const pending = pendingUpdates.get(field.id)
    if (pending?.updates.is_required !== undefined) {
      return pending.updates.is_required
    }
    return field.is_required
  }

  const getEffectiveClientVisible = (field: IrccFormField): boolean => {
    const pending = pendingUpdates.get(field.id)
    if (pending?.updates.is_client_visible !== undefined) {
      return pending.updates.is_client_visible
    }
    return field.is_client_visible
  }

  // ── Loading ──
  if (formLoading || fieldsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title="Form not found"
          description="This form may have been deleted."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/ircc-forms')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-mono">{form.form_code}</h1>
              <Badge variant={form.is_xfa ? 'default' : 'outline'}>
                {form.is_xfa ? 'XFA' : 'AcroForm'}
              </Badge>
              <Badge variant="outline">v{form.current_version ?? 1}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{form.form_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={relabelMutation.isPending}
            onClick={() => relabelMutation.mutate(formId)}
          >
            {relabelMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Tag className="mr-2 h-4 w-4" />
            )}
            Auto-label
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={rescanMutation.isPending}
            onClick={() => rescanMutation.mutate(formId)}
          >
            {rescanMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Re-scan
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Fields</div>
          <div className="text-xl font-bold">{totalFields}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Mapped</div>
          <div className="text-xl font-bold text-green-600">{mappedFields}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Unmapped</div>
          <div className="text-xl font-bold text-yellow-600">{unmappedFields}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Required + Unmapped</div>
          <div className={`text-xl font-bold ${requiredUnmapped > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {requiredUnmapped}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Client Visible</div>
          <div className="text-xl font-bold">{clientVisible}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Meta Fields</div>
          <div className="text-xl font-bold text-muted-foreground">{metaFields}</div>
        </div>
      </div>

      {/* Mapping progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Mapping Completeness</span>
          <span className="font-medium">{mappingPct}%</span>
        </div>
        <Progress value={mappingPct} className="h-3" />
      </div>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Field Mappings</TabsTrigger>
          <TabsTrigger value="sections">
            Sections ({sections?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="arrays">
            Array Maps ({arrayMaps?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="versions">
            Versions ({versions?.versions?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* ── Fields Tab ── */}
        <TabsContent value="fields" className="space-y-4">
          {/* Save bar */}
          {hasPendingUpdates && (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {pendingUpdates.size} unsaved change{pendingUpdates.size > 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={discardAll}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={saveAll}
                  disabled={bulkUpdateMutation.isPending}
                >
                  {bulkUpdateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Save className="mr-2 h-4 w-4" />
                  Save All
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search XFA path, profile path, or label..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={mappingFilter}
              onValueChange={(v) => setMappingFilter(v as MappingFilter)}
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                <SelectItem value="mapped">Mapped Only</SelectItem>
                <SelectItem value="unmapped">Unmapped Only</SelectItem>
                <SelectItem value="required_unmapped">Required + Unmapped</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(sections ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.title}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground">
              {filteredFields.length} of {totalFields}
            </span>
          </div>

          {/* Fields table */}
          {filteredFields.length === 0 ? (
            <EmptyState
              icon={ScanSearch}
              title="No fields match"
              description="Try adjusting your search or filters."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]">#</TableHead>
                    <TableHead>XFA Path</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Profile Path Mapping</TableHead>
                    <TableHead className="w-[60px] text-center">Req</TableHead>
                    <TableHead className="w-[60px] text-center">Visible</TableHead>
                    <TableHead className="w-[80px]">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFields.map((field, idx) => {
                    const effectivePath = getEffectiveProfilePath(field)
                    const effectiveRequired = getEffectiveRequired(field)
                    const effectiveVisible = getEffectiveClientVisible(field)
                    const isPending = pendingUpdates.has(field.id)
                    const isExpanded = expandedField === field.id

                    return (
                      <>
                        <TableRow
                          key={field.id}
                          className={`${isPending ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''} ${
                            field.is_meta_field ? 'opacity-50' : ''
                          }`}
                        >
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {field.sort_order}
                          </TableCell>
                          <TableCell>
                            <button
                              className="text-left"
                              onClick={() =>
                                setExpandedField(isExpanded ? null : field.id)
                              }
                            >
                              <code className="text-xs font-mono break-all leading-tight">
                                {field.xfa_path}
                              </code>
                              {isExpanded ? (
                                <ChevronUp className="inline ml-1 h-3 w-3" />
                              ) : (
                                <ChevronDown className="inline ml-1 h-3 w-3" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {field.label || field.suggested_label || (
                                <span className="text-muted-foreground italic">no label</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ProfilePathPicker
                              value={effectivePath}
                              onSelect={(path) => setPendingMapping(field.id, path)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={effectiveRequired}
                              onCheckedChange={(checked) =>
                                setPendingRequired(field.id, !!checked)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={effectiveVisible}
                              onCheckedChange={(checked) =>
                                setPendingClientVisible(field.id, !!checked)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {field.field_type}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${field.id}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="font-medium text-muted-foreground">XFA Type:</span>{' '}
                                  {field.xfa_field_type ?? 'unknown'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Section:</span>{' '}
                                  {field.section_id ? sectionMap.get(field.section_id) ?? 'unknown' : 'unassigned'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Date Split:</span>{' '}
                                  {field.date_split ?? 'none'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Array Field:</span>{' '}
                                  {field.is_array_field ? 'Yes' : 'No'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Max Length:</span>{' '}
                                  {field.max_length ?? 'none'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Meta Field:</span>{' '}
                                  {field.is_meta_field ? `Yes (${field.meta_field_key})` : 'No'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Blocking:</span>{' '}
                                  {(field as any).is_blocking ? 'Yes' : 'No'}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground">Page:</span>{' '}
                                  {(field as any).page_number ?? 'unknown'}
                                </div>
                                {field.value_format && (
                                  <div className="col-span-2">
                                    <span className="font-medium text-muted-foreground">Value Format:</span>{' '}
                                    <code className="text-xs">{JSON.stringify(field.value_format)}</code>
                                  </div>
                                )}
                                {field.show_when && (
                                  <div className="col-span-2">
                                    <span className="font-medium text-muted-foreground">Show When:</span>{' '}
                                    <code className="text-xs">{JSON.stringify(field.show_when)}</code>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Sections Tab ── */}
        <TabsContent value="sections" className="space-y-4">
          {!sections || sections.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No sections"
              description="Sections are auto-created when a form is scanned. Try re-scanning."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Section Key</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Repeatable</TableHead>
                    <TableHead className="text-right">Fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((s) => {
                    const fieldCount = allFields.filter(
                      (f) => f.section_id === s.id,
                    ).length
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {s.sort_order}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.section_key}
                        </TableCell>
                        <TableCell className="font-medium">{s.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.description ?? '-'}
                        </TableCell>
                        <TableCell>
                          {(s as any).is_repeatable ? (
                            <Badge variant="default">Yes</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fieldCount}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Array Maps Tab ── */}
        <TabsContent value="arrays" className="space-y-4">
          {!arrayMaps || arrayMaps.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No array maps"
              description="Array maps define how repeater fields (children, education history, etc.) map to XFA paths."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile Path</TableHead>
                    <TableHead>XFA Base Path</TableHead>
                    <TableHead>Entry Name</TableHead>
                    <TableHead>Max Entries</TableHead>
                    <TableHead>Sub-fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrayMaps.map((am) => (
                    <TableRow key={am.id}>
                      <TableCell className="font-mono text-xs">
                        {am.profile_path}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {am.xfa_base_path}
                      </TableCell>
                      <TableCell>{am.xfa_entry_name}</TableCell>
                      <TableCell className="tabular-nums">{am.max_entries}</TableCell>
                      <TableCell>
                        <code className="text-xs">
                          {JSON.stringify(am.sub_fields, null, 0)}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Versions Tab ── */}
        <TabsContent value="versions" className="space-y-4">
          {!versions?.versions || versions.versions.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No version history"
              description="Version history is created when a form is updated."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Checksum</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Mapped</TableHead>
                    <TableHead>Archived At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono">v{v.version_number}</TableCell>
                      <TableCell className="text-sm">{v.file_name}</TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]">
                        {v.checksum_sha256?.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="tabular-nums">{v.field_count ?? '-'}</TableCell>
                      <TableCell className="tabular-nums">{v.mapped_field_count ?? '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {v.archived_at
                          ? new Date(v.archived_at).toLocaleDateString()
                          : 'Current'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
