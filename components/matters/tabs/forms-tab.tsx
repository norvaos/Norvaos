'use client'

import { useMemo } from 'react'
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  useMatterFormInstances,
  useUpdateFormInstanceStatus,
} from '@/lib/queries/form-instances'
import type { FormInstanceStatus } from '@/lib/types/form-instances'

// ── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  FormInstanceStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: typeof Clock }
> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  in_progress: { label: 'In Progress', variant: 'outline', icon: Loader2 },
  ready_for_review: { label: 'Ready for Review', variant: 'outline', icon: AlertCircle },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive', icon: AlertCircle },
  generated: { label: 'Generated', variant: 'default', icon: FileText },
  submitted: { label: 'Submitted', variant: 'default', icon: CheckCircle2 },
}

const STATUS_OPTIONS: FormInstanceStatus[] = [
  'pending',
  'in_progress',
  'ready_for_review',
  'approved',
  'rejected',
  'generated',
  'submitted',
]

// ── Props ────────────────────────────────────────────────────────────────────

interface FormsTabProps {
  matterId: string
  matterStatus?: string
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FormsTab({ matterId, matterStatus }: FormsTabProps) {
  const { data: instances, isLoading } = useMatterFormInstances(matterId)
  const updateStatus = useUpdateFormInstanceStatus()

  const isReadOnly = matterStatus === 'closed' || matterStatus === 'archived'

  const stats = useMemo(() => {
    if (!instances) return { total: 0, completed: 0, required: 0 }
    const completed = instances.filter(
      (i) => i.status === 'approved' || i.status === 'generated' || i.status === 'submitted',
    ).length
    const required = instances.filter((i) => i.is_required).length
    return { total: instances.length, completed, required }
  }, [instances])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (!instances || instances.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-muted-foreground">No form instances</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Form instances are automatically created when assignment templates are published for this matter type.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="text-xs">
          {stats.completed}/{stats.total} complete
        </Badge>
        {stats.required > 0 && (
          <span className="text-xs text-muted-foreground">
            {stats.required} required
          </span>
        )}
        {isReadOnly && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/20">
            Read-only
          </Badge>
        )}
      </div>

      {/* Instances Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Assigned Forms</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Form Code</TableHead>
                  <TableHead className="text-xs">Form Name</TableHead>
                  <TableHead className="text-xs">Person</TableHead>
                  <TableHead className="text-xs">Required</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((instance) => {
                  const config = STATUS_CONFIG[instance.status as FormInstanceStatus] ?? STATUS_CONFIG.pending
                  const StatusIcon = config.icon

                  return (
                    <TableRow key={instance.id}>
                      <TableCell className="text-xs font-mono font-medium">
                        {instance.form_code}
                      </TableCell>
                      <TableCell className="text-xs">
                        {instance.form_name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {instance.person_role ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-slate-400" />
                            <span className="capitalize">{instance.person_role}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Matter-level</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {instance.is_required ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Required</Badge>
                        ) : (
                          <span className="text-slate-400">Optional</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isReadOnly ? (
                          <Badge variant={config.variant} className="text-[10px] gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {config.label}
                          </Badge>
                        ) : (
                          <Select
                            value={instance.status}
                            onValueChange={(newStatus) =>
                              updateStatus.mutate({
                                instanceId: instance.id,
                                matterId,
                                status: newStatus,
                              })
                            }
                          >
                            <SelectTrigger className="h-7 w-[150px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => {
                                const sc = STATUS_CONFIG[s]
                                return (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {sc.label}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
