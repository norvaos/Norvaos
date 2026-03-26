'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Loader2,
  Search,
  Users,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { EmptyState } from '@/components/shared/empty-state'

interface TenantRow {
  id: string
  name: string
  slug: string
  max_users: number
  subscription_tier: string
  status: string
  active_users: number
  pending_invites: number
  at_limit: boolean
}

interface TenantsResponse {
  data: TenantRow[]
  total: number
  page: number
  per_page: number
  error: string | null
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  suspended: 'outline',
  closed: 'destructive',
}

/**
 * Platform-admin tenant management console.
 *
 * This page is gated by the API  -  GET /api/admin/tenants requires
 * platform-admin auth (Bearer token or session). Non-admins see a 403 error.
 */
export default function AdminTenantsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [atLimitOnly, setAtLimitOnly] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 25

  // Dialog state
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newMaxUsers, setNewMaxUsers] = useState('')
  const [reason, setReason] = useState('')
  const [slugConfirm, setSlugConfirm] = useState('')

  // ── Debounced search ──
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    const timer = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // ── Fetch tenants (server-side pagination + filtering) ──
  const { data: response, isLoading, error } = useQuery<TenantsResponse>({
    queryKey: ['admin-tenants', page, perPage, debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/admin/tenants?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to fetch tenants')
      }
      return res.json()
    },
  })

  const tenants = response?.data ?? []
  const total = response?.total ?? 0
  const totalPages = Math.ceil(total / perPage)

  // Client-side "At Limit Only" filter
  const filtered = atLimitOnly ? tenants.filter((t) => t.at_limit) : tenants

  // ── Update max_users mutation ──
  const updateMutation = useMutation({
    mutationFn: async ({ tenantId, maxUsers, reason }: { tenantId: string; maxUsers: number; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/max-users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_users: maxUsers, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update seat limit')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Seat limit updated successfully')
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
      setDialogOpen(false)
      setSelectedTenant(null)
      setNewMaxUsers('')
      setReason('')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleIncreaseSeats = (tenant: TenantRow) => {
    setSelectedTenant(tenant)
    setNewMaxUsers(String(tenant.max_users))
    setReason('')
    setSlugConfirm('')
    setDialogOpen(true)
  }

  const needsSlugConfirmation =
    selectedTenant != null &&
    parseInt(newMaxUsers, 10) > selectedTenant.max_users * 2

  const handleSubmit = () => {
    if (!selectedTenant) return
    const parsed = parseInt(newMaxUsers, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
      toast.error('max_users must be between 1 and 1000')
      return
    }
    if (reason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters')
      return
    }
    if (needsSlugConfirmation && slugConfirm !== selectedTenant.slug) {
      toast.error(`Type "${selectedTenant.slug}" to confirm a large increase`)
      return
    }
    updateMutation.mutate({
      tenantId: selectedTenant.id,
      maxUsers: parsed,
      reason: reason.trim(),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Tenant Management</h1>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Tenant Management</h1>
        </div>
        <EmptyState
          icon={Building2}
          title="Access Denied"
          description={error instanceof Error ? error.message : 'Failed to load tenants. Platform-admin access required.'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Tenant Management</h1>
          <p className="text-muted-foreground text-sm">
            Active users consume seats; pending invitations do not count toward the limit but are capped separately.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setPage(1) }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={atLimitOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAtLimitOnly(!atLimitOnly)}
        >
          <ArrowUpDown className="mr-2 h-4 w-4" />
          At Limit Only
        </Button>

        <span className="text-sm text-muted-foreground">
          {filtered.length} shown · {total} total
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No tenants found"
          description={search || atLimitOnly || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'No tenants exist yet.'}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active Users</TableHead>
                <TableHead className="text-right">Pending Invites</TableHead>
                <TableHead className="text-right">Max Users</TableHead>
                <TableHead>Seat Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tenant) => (
                <TableRow
                  key={tenant.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                >
                  <TableCell className="font-medium">
                    <div>
                      <div>{tenant.name}</div>
                      <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[tenant.status] ?? 'secondary'}>
                      {tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{tenant.active_users}</TableCell>
                  <TableCell className="text-right">{tenant.pending_invites}</TableCell>
                  <TableCell className="text-right">{tenant.max_users}</TableCell>
                  <TableCell>
                    {tenant.at_limit ? (
                      <Badge variant="destructive">At Limit</Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{tenant.subscription_tier}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleIncreaseSeats(tenant) }}
                    >
                      Increase Seats
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Increase Seats Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Seat Limit</DialogTitle>
            <DialogDescription>
              {selectedTenant
                ? `Update the maximum number of users for ${selectedTenant.name}. Currently ${selectedTenant.active_users} active users out of ${selectedTenant.max_users} allowed.`
                : 'Update the maximum number of users for this tenant.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="max-users">New Max Users</Label>
              <Input
                id="max-users"
                type="number"
                min={selectedTenant?.active_users ?? 1}
                max={1000}
                value={newMaxUsers}
                onChange={(e) => setNewMaxUsers(e.target.value)}
                placeholder="e.g. 10"
              />
              {selectedTenant && (
                <p className="text-xs text-muted-foreground">
                  Minimum: {selectedTenant.active_users} (current active users)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer upgraded to Pro plan"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 5 characters. Logged to audit trail.
              </p>
            </div>

            {needsSlugConfirmation && (
              <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Large increase  -  this is more than 2× the current limit.
                </p>
                <Label htmlFor="slug-confirm">
                  Type <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{selectedTenant?.slug}</code> to confirm
                </Label>
                <Input
                  id="slug-confirm"
                  value={slugConfirm}
                  onChange={(e) => setSlugConfirm(e.target.value)}
                  placeholder={selectedTenant?.slug}
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
