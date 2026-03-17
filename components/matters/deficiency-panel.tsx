'use client'

/**
 * DeficiencyPanel — Displays and manages deficiencies for a matter.
 *
 * Shows a table of deficiencies with severity/status badges.
 * Allows creating, resolving, and reopening deficiencies.
 * Resolve action is restricted to Lawyer / Admin roles (enforced client-side
 * for UX; the server enforces this independently).
 *
 * Sprint 6, Week 1 — 2026-03-17
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  useDeficiencies,
  useCreateDeficiency,
  useResolveDeficiency,
  useReopenDeficiency,
} from '@/lib/queries/deficiencies'
import type { MatterDeficiencyRow } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = ['minor', 'major', 'critical'] as const
const CATEGORY_OPTIONS = [
  { value: 'document_quality', label: 'Document Quality' },
  { value: 'questionnaire_inconsistency', label: 'Questionnaire Inconsistency' },
  { value: 'missing_information', label: 'Missing Information' },
  { value: 'legal_review_issue', label: 'Legal Review Issue' },
  { value: 'compliance_failure', label: 'Compliance Failure' },
  { value: 'other', label: 'Other' },
] as const

const BLOCKING_STATUSES = new Set(['open', 'in_progress', 'reopened'])

// ─── Severity Badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: MatterDeficiencyRow['severity'] }) {
  const map: Record<MatterDeficiencyRow['severity'], string> = {
    minor: 'bg-yellow-100 text-yellow-800',
    major: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  }
  return (
    <Badge className={map[severity] ?? ''} variant="outline">
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MatterDeficiencyRow['status'] }) {
  const map: Record<MatterDeficiencyRow['status'], string> = {
    open: 'bg-red-50 text-red-700',
    in_progress: 'bg-blue-50 text-blue-700',
    resolved: 'bg-green-50 text-green-700',
    closed: 'bg-gray-100 text-gray-600',
    reopened: 'bg-orange-50 text-orange-700',
  }
  const labels: Record<MatterDeficiencyRow['status'], string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
    reopened: 'Reopened',
  }
  return (
    <Badge className={map[status] ?? ''} variant="outline">
      {labels[status] ?? status}
    </Badge>
  )
}

// ─── Current User Role Hook ───────────────────────────────────────────────────

function useCurrentUserRole() {
  return useQuery({
    queryKey: ['current_user_role'],
    queryFn: async (): Promise<string | null> => {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return null

      const { data } = await supabase
        .from('users')
        .select('roles!inner(name)')
        .eq('auth_user_id', authData.user.id)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.roles?.name ?? null
    },
    staleTime: 1000 * 60 * 10,
  })
}

// ─── Add Deficiency Dialog ────────────────────────────────────────────────────

interface AddDeficiencyDialogProps {
  matterId: string
  onClose: () => void
}

function AddDeficiencyDialog({ matterId, onClose }: AddDeficiencyDialogProps) {
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  const createMutation = useCreateDeficiency()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMutation.mutateAsync({
      matter_id: matterId,
      severity,
      category,
      description,
      assigned_to_user_id: assignedTo.trim() || undefined,
    })
    onClose()
  }

  const descCharCount = description.length
  const descValid = descCharCount >= 50

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="severity">Severity</Label>
        <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
          <SelectTrigger id="severity">
            <SelectValue placeholder="Select severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">
          Description{' '}
          <span className={descCharCount < 50 ? 'text-red-500 text-xs' : 'text-green-600 text-xs'}>
            ({descCharCount}/50 min)
          </span>
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the deficiency in detail (minimum 50 characters)…"
          rows={4}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="assignedTo">Assign To (optional)</Label>
        <Input
          id="assignedTo"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="User ID to assign"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!descValid || !category || createMutation.isPending}
        >
          {createMutation.isPending ? 'Logging…' : 'Log Deficiency'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Resolve Deficiency Dialog ────────────────────────────────────────────────

interface ResolveDialogProps {
  matterId: string
  deficiency: MatterDeficiencyRow
  onClose: () => void
}

function ResolveDialog({ matterId, deficiency, onClose }: ResolveDialogProps) {
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [evidencePath, setEvidencePath] = useState('')

  const resolveMutation = useResolveDeficiency()

  const notesValid = resolutionNotes.trim().length >= 20

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await resolveMutation.mutateAsync({
      matter_id: matterId,
      deficiency_id: deficiency.id,
      resolution_notes: resolutionNotes,
      resolution_evidence_path: evidencePath.trim() || undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Resolving deficiency:{' '}
          <span className="font-medium">{deficiency.category.replace(/_/g, ' ')}</span>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="resolution-notes">
          Resolution Notes{' '}
          <span className={resolutionNotes.trim().length < 20 ? 'text-red-500 text-xs' : 'text-green-600 text-xs'}>
            ({resolutionNotes.trim().length}/20 min)
          </span>
        </Label>
        <Textarea
          id="resolution-notes"
          value={resolutionNotes}
          onChange={(e) => setResolutionNotes(e.target.value)}
          placeholder="Describe how this deficiency was resolved…"
          rows={4}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="evidence-path">Evidence Path (optional)</Label>
        <Input
          id="evidence-path"
          value={evidencePath}
          onChange={(e) => setEvidencePath(e.target.value)}
          placeholder="e.g. documents/evidence-file.pdf"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!notesValid || resolveMutation.isPending}>
          {resolveMutation.isPending ? 'Resolving…' : 'Mark as Resolved'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DeficiencyPanelProps {
  matterId: string
}

export function DeficiencyPanel({ matterId }: DeficiencyPanelProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<MatterDeficiencyRow | null>(null)

  const { data: deficiencies, isLoading, error } = useDeficiencies(matterId)
  const { data: roleName } = useCurrentUserRole()
  const reopenMutation = useReopenDeficiency()

  const canResolve = roleName === 'Lawyer' || roleName === 'Admin'

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading deficiencies…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        Failed to load deficiencies. Please refresh the page.
      </div>
    )
  }

  const rows = deficiencies ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Deficiencies</h3>
          <p className="text-xs text-muted-foreground">
            {rows.length} deficiencie{rows.length !== 1 ? 's' : ''} on this matter
          </p>
        </div>

        {/* Add Deficiency */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add Deficiency</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Log Deficiency</DialogTitle>
              <DialogDescription>
                Flag a deficiency on this matter. Critical deficiencies are immediately escalated.
              </DialogDescription>
            </DialogHeader>
            <AddDeficiencyDialog
              matterId={matterId}
              onClose={() => setAddDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          No deficiencies on this matter.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((def) => (
                <TableRow key={def.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <SeverityBadge severity={def.severity} />
                      {def.chronic_flag && (
                        <Badge className="bg-red-700 text-white text-xs" variant="destructive">
                          CHRONIC
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="capitalize text-sm">
                    {def.category.replace(/_/g, ' ')}
                  </TableCell>

                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    <span title={def.description}>
                      {def.description.length > 80
                        ? `${def.description.slice(0, 80)}…`
                        : def.description}
                    </span>
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={def.status} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {def.assigned_to_user_id ?? '—'}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(def.created_at).toLocaleDateString('en-CA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* Resolve button — only Lawyer/Admin, only on blocking statuses */}
                      {canResolve && BLOCKING_STATUSES.has(def.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResolveTarget(def)}
                        >
                          Resolve
                        </Button>
                      )}

                      {/* Reopen button — any user, only on resolved/closed */}
                      {(def.status === 'resolved' || def.status === 'closed') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={reopenMutation.isPending}
                          onClick={() =>
                            reopenMutation.mutate({
                              matter_id: matterId,
                              deficiency_id: def.id,
                            })
                          }
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={(open) => !open && setResolveTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Deficiency</DialogTitle>
            <DialogDescription>
              Provide resolution notes (minimum 20 characters) before marking as resolved.
            </DialogDescription>
          </DialogHeader>
          {resolveTarget && (
            <ResolveDialog
              matterId={matterId}
              deficiency={resolveTarget}
              onClose={() => setResolveTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
