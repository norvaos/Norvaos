'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { useUserRole } from '@/lib/hooks/use-user-role'
import { useUser } from '@/lib/hooks/use-user'
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
import { EmptyState } from '@/components/shared/empty-state'
import { Label } from '@/components/ui/label'

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

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>
    case 'suspended':
      return <Badge variant="secondary">Suspended</Badge>
    case 'closed':
      return <Badge variant="destructive">Closed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function AdminTenantsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { appUser, isLoading: userLoading } = useUser()
  const { role, isLoading: roleLoading } = useUserRole()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Suspend/Activate confirmation dialog state
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [targetTenant, setTargetTenant] = useState<TenantRow | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  // Update max users dialog state
  const [maxUsersDialogOpen, setMaxUsersDialogOpen] = useState(false)
  const [maxUsersTarget, setMaxUsersTarget] = useState<TenantRow | null>(null)
  const [newMaxUsers, setNewMaxUsers] = useState('')
  const [maxUsersReason, setMaxUsersReason] = useState('')

  // New Tenant dialog state
  const [newTenantOpen, setNewTenantOpen] = useState(false)
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantTier, setNewTenantTier] = useState('starter')

  const isReady = !userLoading && !!appUser && !roleLoading && (!appUser.role_id || role !== null)
  const isAdmin = role?.name === 'Admin' || role?.is_system === true

  const { data, isLoading, isError } = useQuery<TenantsResponse>({
    queryKey: ['admin', 'tenants', search, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: '25' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/tenants?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to fetch tenants')
      }
      return res.json()
    },
    enabled: isAdmin,
    staleTime: 30_000,
  })

  const toggleStatus = useMutation({
    mutationFn: async ({
      tenantId,
      newStatus,
      reason,
    }: {
      tenantId: string
      newStatus: string
      reason: string
    }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to update status')
      return body
    },
    onSuccess: (_data, variables) => {
      const action = variables.newStatus === 'suspended' ? 'suspended' : 'activated'
      toast.success(`Tenant ${action} successfully.`)
      setSuspendDialogOpen(false)
      setTargetTenant(null)
      setSuspendReason('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: (err) => {
      toast.error('Failed to update tenant status.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const updateMaxUsers = useMutation({
    mutationFn: async ({
      tenantId,
      maxUsers,
      reason,
    }: {
      tenantId: string
      maxUsers: number
      reason: string
    }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/max-users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_users: maxUsers, reason }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to update max users')
      return body
    },
    onSuccess: () => {
      toast.success('Seat limit updated successfully.')
      setMaxUsersDialogOpen(false)
      setMaxUsersTarget(null)
      setNewMaxUsers('')
      setMaxUsersReason('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: (err) => {
      toast.error('Failed to update seat limit.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const createTenant = useMutation({
    mutationFn: async ({ name, subscription_tier }: { name: string; subscription_tier: string }) => {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subscription_tier }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create tenant')
      return body
    },
    onSuccess: (data) => {
      toast.success(`Tenant "${data.name}" created.`)
      setNewTenantOpen(false)
      setNewTenantName('')
      setNewTenantTier('starter')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      router.push(`/settings/admin/tenants/${data.id}`)
    },
    onError: (err) => {
      toast.error('Failed to create tenant.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  function openSuspendDialog(tenant: TenantRow) {
    setTargetTenant(tenant)
    setSuspendReason('')
    setSuspendDialogOpen(true)
  }

  function openMaxUsersDialog(tenant: TenantRow) {
    setMaxUsersTarget(tenant)
    setNewMaxUsers(String(tenant.max_users))
    setMaxUsersReason('')
    setMaxUsersDialogOpen(true)
  }

  function handleStatusToggle() {
    if (!targetTenant || suspendReason.trim().length < 5) return
    const newStatus = targetTenant.status === 'active' ? 'suspended' : 'active'
    toggleStatus.mutate({ tenantId: targetTenant.id, newStatus, reason: suspendReason.trim() })
  }

  function handleMaxUsersUpdate() {
    if (!maxUsersTarget || maxUsersReason.trim().length < 5) return
    const parsed = parseInt(newMaxUsers, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
      toast.error('Seat limit must be a whole number between 1 and 1000.')
      return
    }
    updateMaxUsers.mutate({ tenantId: maxUsersTarget.id, maxUsers: parsed, reason: maxUsersReason.trim() })
  }

  useEffect(() => {
    if (!isReady) return
    if (!isAdmin) router.replace('/')
  }, [isReady, isAdmin, router])

  if (!isReady || !isAdmin) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const tenants = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenant Management</h2>
          <p className="text-muted-foreground">
            Platform-admin view of all tenants. Actions here affect all users in a tenant.
          </p>
        </div>
        <Button onClick={() => setNewTenantOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Tenant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-md border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load tenants. You may not have platform-admin access.</p>
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No tenants found"
          description={search ? 'No tenants match your search.' : 'No tenants exist yet.'}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {tenant.subscription_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={tenant.at_limit ? 'text-destructive font-medium' : ''}>
                        {tenant.active_users} / {tenant.max_users}
                      </span>
                      {tenant.pending_invites > 0 && (
                        <span className="text-xs text-muted-foreground">
                          +{tenant.pending_invites} pending
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/settings/admin/tenants/${tenant.id}`)}
                        >
                          <Settings2 className="mr-2 h-4 w-4" />
                          Setup &amp; Bootstrap
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => router.push(`/settings/admin/audit-log?tenantId=${tenant.id}&tenantName=${encodeURIComponent(tenant.name)}`)}
                        >
                          <ChevronRight className="mr-2 h-4 w-4" />
                          View Audit Log
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openMaxUsersDialog(tenant)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Update Seat Limit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {tenant.status !== 'closed' && (
                          <DropdownMenuItem
                            variant={tenant.status === 'active' ? 'destructive' : undefined}
                            onClick={() => openSuspendDialog(tenant)}
                          >
                            {tenant.status === 'active' ? (
                              <>
                                <ShieldAlert className="mr-2 h-4 w-4" />
                                Suspend Tenant
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Activate Tenant
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Suspend / Activate Confirmation Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetTenant?.status === 'active' ? 'Suspend Tenant' : 'Activate Tenant'}
            </DialogTitle>
            <DialogDescription>
              {targetTenant?.status === 'active'
                ? 'This will prevent all users in this tenant from accessing the system. Are you sure?'
                : `This will restore access for all users in ${targetTenant?.name}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="suspend-reason">Reason (required)</Label>
              <Input
                id="suspend-reason"
                placeholder="Minimum 5 characters…"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspendDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={targetTenant?.status === 'active' ? 'destructive' : 'default'}
              onClick={handleStatusToggle}
              disabled={
                toggleStatus.isPending || suspendReason.trim().length < 5
              }
            >
              {toggleStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {targetTenant?.status === 'active' ? 'Suspend' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Tenant Dialog */}
      <Dialog open={newTenantOpen} onOpenChange={setNewTenantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Tenant</DialogTitle>
            <DialogDescription>
              Create a new tenant. You can run bootstrap immediately after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tenant-name">Firm Name</Label>
              <Input
                id="tenant-name"
                placeholder="Acme Law LLP"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-tier">Subscription Tier</Label>
              <Select value={newTenantTier} onValueChange={setNewTenantTier}>
                <SelectTrigger id="tenant-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTenantOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTenant.mutate({ name: newTenantName.trim(), subscription_tier: newTenantTier })}
              disabled={newTenantName.trim().length < 2 || createTenant.isPending}
            >
              {createTenant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Max Users Dialog */}
      <Dialog open={maxUsersDialogOpen} onOpenChange={setMaxUsersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Seat Limit</DialogTitle>
            <DialogDescription>
              Change the maximum number of active users for{' '}
              <strong>{maxUsersTarget?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="max-users">New Seat Limit</Label>
              <Input
                id="max-users"
                type="number"
                min={1}
                max={1000}
                value={newMaxUsers}
                onChange={(e) => setNewMaxUsers(e.target.value)}
              />
              {maxUsersTarget && (
                <p className="text-xs text-muted-foreground">
                  Current: {maxUsersTarget.max_users} seats ({maxUsersTarget.active_users} in use)
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-users-reason">Reason (required)</Label>
              <Input
                id="max-users-reason"
                placeholder="Minimum 5 characters…"
                value={maxUsersReason}
                onChange={(e) => setMaxUsersReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaxUsersDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMaxUsersUpdate}
              disabled={
                updateMaxUsers.isPending ||
                !newMaxUsers ||
                maxUsersReason.trim().length < 5
              }
            >
              {updateMaxUsers.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
