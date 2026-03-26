'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  ScrollText,
} from 'lucide-react'
import { format } from 'date-fns'

import { useUserRole } from '@/lib/hooks/use-user-role'
import { useUser } from '@/lib/hooks/use-user'
import { hasPermission } from '@/lib/utils/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { Label } from '@/components/ui/label'
import { NorvaWhisper } from '@/components/ui/norva-whisper'

interface AuditEntry {
  id: string
  source: 'tenant' | 'platform-admin'
  action: string
  entity_type: string | null
  entity_id: string | null
  actor: string
  reason: string | null
  changes: unknown
  created_at: string
}

interface AuditResponse {
  data: AuditEntry[]
  next_cursor: string | null
  error: string | null
}

function ExpandableChanges({ changes }: { changes: unknown }) {
  const [expanded, setExpanded] = useState(false)

  if (!changes || (typeof changes === 'object' && Object.keys(changes as object).length === 0)) {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  const json = JSON.stringify(changes, null, 2)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? 'Collapse' : 'View changes'}
      </button>
      {expanded && (
        <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-x-auto max-w-xs whitespace-pre-wrap break-all">
          {json}
        </pre>
      )}
    </div>
  )
}

function AdminAuditLogInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { appUser, isLoading: userLoading } = useUser()
  const { role, isLoading: roleLoading } = useUserRole()

  const tenantIdParam = searchParams.get('tenantId') ?? ''
  const tenantNameParam = searchParams.get('tenantName') ?? ''

  const [tenantId, setTenantId] = useState(tenantIdParam)
  const [actionFilter, setActionFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<string[]>([])

  const isReady = !userLoading && !!appUser && !roleLoading && (!appUser.role_id || role !== null)
  const canViewAudit = hasPermission(role, 'settings', 'view')

  const { data, isLoading, isError, isFetching } = useQuery<AuditResponse>({
    queryKey: ['admin', 'audit-log', tenantId, actionFilter, entityTypeFilter, cursor],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant selected')
      const params = new URLSearchParams({ limit: '50' })
      if (cursor) params.set('cursor', cursor)
      if (actionFilter) params.set('action', actionFilter)
      const res = await fetch(`/api/admin/tenants/${tenantId}/audit?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to fetch audit log')
      }
      return res.json()
    },
    enabled: canViewAudit && !!tenantId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!isReady) return
    if (!canViewAudit) router.replace('/')
  }, [isReady, canViewAudit, router])

  if (!isReady || !canViewAudit) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const entries = data?.data ?? []
  const nextCursor = data?.next_cursor ?? null

  function handleNext() {
    if (!nextCursor) return
    setCursorStack((prev) => (cursor ? [...prev, cursor] : prev))
    setCursor(nextCursor)
  }

  function handlePrev() {
    const stack = [...cursorStack]
    const prev = stack.pop() ?? null
    setCursorStack(stack)
    setCursor(prev)
  }

  function handleTenantSearch() {
    setCursor(null)
    setCursorStack([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Norva Vault
          <NorvaWhisper contentKey="vault.audit" />
        </h2>
        <p className="text-muted-foreground">
          {tenantNameParam
            ? `Norva Vault audit trail for ${tenantNameParam}`
            : 'Norva Vault audit trail. Enter a tenant ID to load logs.'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tenant-id">Tenant ID</Label>
          <div className="flex gap-2">
            <Input
              id="tenant-id"
              placeholder="Tenant UUID…"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={handleTenantSearch}>
              <Filter className="mr-1.5 h-4 w-4" />
              Load
            </Button>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="action-filter">Action Type</Label>
          <Input
            id="action-filter"
            placeholder="e.g. user_invited"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setCursor(null)
              setCursorStack([])
            }}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="entity-type-filter">Entity Type</Label>
          <Input
            id="entity-type-filter"
            placeholder="e.g. user, tenant"
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value)
              setCursor(null)
              setCursorStack([])
            }}
          />
        </div>
      </div>

      {!tenantId ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <ScrollText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Enter a tenant ID above to load the audit log.</p>
        </div>
      ) : isLoading ? (
        <div className="rounded-md border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Failed to load audit log. Check that the tenant ID is correct and you have platform-admin access.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries found"
          description={actionFilter ? 'No entries match the selected action filter.' : 'This tenant has no audit log entries yet.'}
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries
                .filter((e) =>
                  entityTypeFilter
                    ? (e.entity_type ?? '').toLowerCase().includes(entityTypeFilter.toLowerCase())
                    : true
                )
                .map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs" title={entry.actor}>
                      {entry.actor}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.entity_type ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs text-muted-foreground" title={entry.entity_id ?? ''}>
                      {entry.entity_id ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={entry.source === 'platform-admin' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {entry.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <ExpandableChanges changes={entry.changes} />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {tenantId && entries.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : `${entries.length} entries`}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={cursorStack.length === 0}
              onClick={handlePrev}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!nextCursor}
              onClick={handleNext}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminAuditLogPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AdminAuditLogInner />
    </Suspense>
  )
}
