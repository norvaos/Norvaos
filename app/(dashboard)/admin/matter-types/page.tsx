'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Pencil,
  Archive,
  RefreshCw,
  Layers,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useAdminMatterTypes, useArchiveMatterType, useCreateMatterType } from '@/lib/queries/matter-types'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
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
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/types/database'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']

const COLOUR_SWATCHES = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#14b8a6', '#6b7280',
]

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice_areas', 'all', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

export default function AdminMatterTypesPage() {
  const router = useRouter()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [practiceFilter, setPracticeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPracticeAreaId, setNewPracticeAreaId] = useState('')
  const [newColour, setNewColour] = useState('#6366f1')

  const { data: matterTypes, isLoading } = useAdminMatterTypes(
    tenantId,
    practiceFilter === 'all' ? null : practiceFilter,
  )
  const { data: practiceAreas } = usePracticeAreas(tenantId)
  const archiveMatterType = useArchiveMatterType()
  const createMatterType = useCreateMatterType()

  const filtered = (matterTypes ?? []).filter((mt) =>
    mt.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate() {
    if (!newName.trim() || !newPracticeAreaId) {
      toast.error('Name and practice area are required')
      return
    }
    const result = await createMatterType.mutateAsync({
      tenantId,
      practiceAreaId: newPracticeAreaId,
      name: newName.trim(),
      color: newColour,
    })
    setNewDialogOpen(false)
    setNewName('')
    setNewPracticeAreaId('')
    setNewColour('#6366f1')
    router.push(`/admin/matter-types/${result.id}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="size-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Matter Types</h1>
            <p className="text-sm text-muted-foreground">
              Configure matter type templates, document checklists, and SLA policies.
            </p>
          </div>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} className="gap-2">
          <Plus className="size-4" />
          New Matter Type
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search matter types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={practiceFilter} onValueChange={setPracticeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All practice areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All practice areas</SelectItem>
            {(practiceAreas ?? []).map((pa) => (
              <SelectItem key={pa.id} value={pa.id}>
                {pa.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Practice Area</TableHead>
              <TableHead className="text-center">Stages</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  {search ? 'No matter types match your search.' : 'No matter types found.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((mt) => (
                <TableRow key={mt.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ backgroundColor: mt.color }}
                      />
                      <span className="font-medium text-foreground">{mt.name}</span>
                      {mt.icon && (
                        <span className="text-xs text-muted-foreground">({mt.icon})</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {mt.practice_areas?.name ?? ' - '}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {mt.stage_count}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={mt.is_active ? 'default' : 'secondary'}>
                      {mt.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/matter-types/${mt.id}`)}
                        className="gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          archiveMatterType.mutate({
                            id: mt.id,
                            tenantId,
                            archive: mt.is_active,
                          })
                        }
                        disabled={archiveMatterType.isPending}
                        className="gap-1.5 text-muted-foreground"
                      >
                        {mt.is_active ? (
                          <><Archive className="size-3.5" /> Archive</>
                        ) : (
                          <><RefreshCw className="size-3.5" /> Restore</>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Matter Type Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Matter Type</DialogTitle>
            <DialogDescription>
              Create a new matter type. You can configure all details after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                placeholder="e.g. Purchase, Work Permit…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-practice-area">Practice Area</Label>
              <Select value={newPracticeAreaId} onValueChange={setNewPracticeAreaId}>
                <SelectTrigger id="new-practice-area">
                  <SelectValue placeholder="Select practice area…" />
                </SelectTrigger>
                <SelectContent>
                  {(practiceAreas ?? []).map((pa) => (
                    <SelectItem key={pa.id} value={pa.id}>
                      {pa.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {COLOUR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColour(c)}
                    className="size-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{
                      backgroundColor: c,
                      outline: newColour === c ? '2px solid currentColor' : undefined,
                      outlineOffset: newColour === c ? '2px' : undefined,
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMatterType.isPending}>
              {createMatterType.isPending ? 'Creating…' : 'Create & Edit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
