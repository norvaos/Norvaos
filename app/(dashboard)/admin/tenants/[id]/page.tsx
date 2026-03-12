'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Users,
  Mail,
  Globe,
  Calendar,
  Shield,
  Clock,
  Loader2,
  Search,
  Trash2,
  RefreshCw,
  Activity,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'

// ── Types ──

interface AuditEntry {
  id: string
  source: 'tenant' | 'platform-admin'
  action: string
  entity_type: string
  entity_id: string
  actor: string
  reason: string | null
  changes: Record<string, unknown> | null
  created_at: string
}

interface TenantDetail {
  id: string
  name: string
  slug: string
  status: string
  max_users: number
  subscription_tier: string
  subscription_status: string
  jurisdiction_code: string
  timezone: string
  currency: string
  custom_domain: string | null
  portal_domain: string | null
  active_users: number
  pending_invites: number
  at_limit: boolean
  feature_flags_raw: Record<string, boolean>
  feature_flags_effective: Record<string, boolean>
  feature_defaults: Record<string, boolean>
  recent_audit: AuditEntry[]
  created_at: string
  updated_at: string
}

interface UserRow {
  id: string
  full_name: string
  email: string
  role_name: string
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
}

interface InviteRow {
  id: string
  email: string
  role_name: string
  status: string
  expires_at: string
  invited_by: string | null
  created_at: string
}

interface RateLimitData {
  tenant_id: string
  seat_limit_denials: { last_1h: number; last_24h: number; last_7d: number; spike_threshold: number; is_spiking: boolean }
  admin_actions: { last_1h: number; spike_threshold: number; is_spiking: boolean }
  invite_velocity: { last_24h: number }
  evaluated_at: string
}

// ── Constants ──

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-700 border-green-500/20',
  suspended: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  closed: 'bg-red-500/10 text-red-700 border-red-500/20',
}

const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  seat_limit_denial: 'destructive',
  max_users_updated: 'default',
  tenant_status_changed: 'outline',
  feature_flags_updated: 'secondary',
  user_deactivated: 'destructive',
  user_reactivated: 'default',
  invite_revoked: 'outline',
  cache_purged: 'secondary',
}

/**
 * Platform-admin tenant detail page — full management console.
 * Tabs: Overview, Features, Users, Invites, Audit, Operations
 */
export default function TenantDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const tenantId = params.id

  // ── Dialog states ──
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<string>('active')
  const [statusReason, setStatusReason] = useState('')

  const [seatsDialogOpen, setSeatsDialogOpen] = useState(false)
  const [newMaxUsers, setNewMaxUsers] = useState('')
  const [seatsReason, setSeatsReason] = useState('')
  const [slugConfirm, setSlugConfirm] = useState('')

  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<{ type: string; id: string; label: string } | null>(null)
  const [actionReason, setActionReason] = useState('')

  const [featureReason, setFeatureReason] = useState('')
  const [pendingFeatureChanges, setPendingFeatureChanges] = useState<Record<string, boolean>>({})

  const [cacheReason, setCacheReason] = useState('')
  const [userSearch, setUserSearch] = useState('')

  // ── Tenant detail query ──
  const { data: tenantResponse, isLoading, error } = useQuery<{ data: TenantDetail }>({
    queryKey: ['admin-tenant-detail', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to fetch tenant')
      }
      return res.json()
    },
    enabled: !!tenantId,
  })

  const tenant = tenantResponse?.data

  // ── Users query ──
  const { data: usersResponse } = useQuery<{ data: UserRow[] }>({
    queryKey: ['admin-tenant-users', tenantId, userSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ per_page: '100' })
      if (userSearch) params.set('search', userSearch)
      const res = await fetch(`/api/admin/tenants/${tenantId}/users?${params}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
    enabled: !!tenantId,
  })

  // ── Invites query ──
  const { data: invitesResponse } = useQuery<{ data: InviteRow[] }>({
    queryKey: ['admin-tenant-invites', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/invites`)
      if (!res.ok) throw new Error('Failed to fetch invites')
      return res.json()
    },
    enabled: !!tenantId,
  })

  // ── Rate-limit query ──
  const { data: rateLimitResponse } = useQuery<{ data: RateLimitData }>({
    queryKey: ['admin-tenant-rate-limit', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/rate-limit`)
      if (!res.ok) throw new Error('Failed to fetch rate limit data')
      return res.json()
    },
    enabled: !!tenantId,
  })

  // ── Mutations ──

  const statusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: string; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update status')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Tenant status updated')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] })
      setStatusDialogOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const seatsMutation = useMutation({
    mutationFn: async ({ maxUsers, reason }: { maxUsers: number; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/max-users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_users: maxUsers, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update seats')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Seat limit updated')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] })
      setSeatsDialogOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const featureMutation = useMutation({
    mutationFn: async ({ flags, reason }: { flags: Record<string, boolean>; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_flags: flags,
          reason,
          expected_updated_at: tenant?.updated_at,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.code === 'OPTIMISTIC_LOCK_CONFLICT') {
          toast.error('Tenant was modified since you loaded this page. Refreshing...')
          queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] })
          return
        }
        throw new Error(body.error || 'Failed to update features')
      }
      return res.json()
    },
    onSuccess: (data) => {
      if (data) {
        toast.success('Feature flags updated')
        queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] })
        setPendingFeatureChanges({})
        setFeatureReason('')
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const userActionMutation = useMutation({
    mutationFn: async ({ userId, action, reason }: { userId: string; action: 'deactivate' | 'reactivate'; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/users/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to ${action} user`)
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success(`User ${variables.action}d successfully`)
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-detail', tenantId] })
      setActionDialogOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const inviteRevokeMutation = useMutation({
    mutationFn: async ({ inviteId, reason }: { inviteId: string; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/invites/${inviteId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to revoke invite')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Invite revoked')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invites', tenantId] })
      setActionDialogOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const cachePurgeMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to purge cache')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Cache purged for tenant')
      setCacheReason('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Helpers ──

  const needsSlugConfirmation =
    tenant != null && parseInt(newMaxUsers, 10) > tenant.max_users * 2

  const hasPendingFeatureChanges = Object.keys(pendingFeatureChanges).length > 0

  const handleFeatureToggle = (flag: string, value: boolean) => {
    setPendingFeatureChanges((prev) => {
      const next = { ...prev, [flag]: value }
      // Remove if matches current raw value (no actual change)
      if (tenant && tenant.feature_flags_raw[flag] === value) {
        delete next[flag]
      }
      return next
    })
  }

  const openActionDialog = (type: string, id: string, label: string) => {
    setActionTarget({ type, id, label })
    setActionReason('')
    setActionDialogOpen(true)
  }

  const handleActionSubmit = () => {
    if (!actionTarget || actionReason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters')
      return
    }
    if (actionTarget.type === 'deactivate' || actionTarget.type === 'reactivate') {
      userActionMutation.mutate({ userId: actionTarget.id, action: actionTarget.type, reason: actionReason.trim() })
    } else if (actionTarget.type === 'revoke-invite') {
      inviteRevokeMutation.mutate({ inviteId: actionTarget.id, reason: actionReason.trim() })
    }
  }

  // ── Loading / Error ──

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/tenants')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tenants
        </Button>
        <EmptyState icon={Building2} title="Tenant Not Found" description={error instanceof Error ? error.message : 'Could not load tenant details.'} />
      </div>
    )
  }

  const seatPct = tenant.max_users > 0 ? Math.round((tenant.active_users / tenant.max_users) * 100) : 0
  const users = usersResponse?.data ?? []
  const invites = invitesResponse?.data ?? []
  const rateLimit = rateLimitResponse?.data

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push('/admin/tenants')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tenants
        </Button>
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <Badge
            className={`${STATUS_COLORS[tenant.status] ?? ''} cursor-pointer`}
            onClick={() => { setNewStatus(tenant.status); setStatusReason(''); setStatusDialogOpen(true) }}
          >
            {tenant.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{tenant.slug}</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        {/* ═══ Overview ═══ */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Seat Usage Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2"><Users className="h-4 w-4" /> Seat Usage</CardDescription>
                <CardTitle className="text-3xl">{tenant.active_users} / {tenant.max_users}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${tenant.at_limit ? 'bg-destructive' : seatPct > 80 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, seatPct)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{seatPct}% used · {tenant.pending_invites} pending invites</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setNewMaxUsers(String(tenant.max_users)); setSeatsReason(''); setSlugConfirm(''); setSeatsDialogOpen(true) }}>
                  Update Seat Limit
                </Button>
              </CardContent>
            </Card>

            {/* Subscription */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2"><Shield className="h-4 w-4" /> Subscription</CardDescription>
                <CardTitle className="text-xl capitalize">{tenant.subscription_tier}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="capitalize">{tenant.subscription_status}</Badge>
                <p className="text-xs text-muted-foreground mt-2">Jurisdiction: {tenant.jurisdiction_code}</p>
              </CardContent>
            </Card>

            {/* Config */}
            <Card>
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Globe className="h-4 w-4" /> Configuration</CardDescription></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{tenant.timezone}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span>{tenant.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(tenant.created_at).toLocaleDateString()}</span></div>
              </CardContent>
            </Card>
          </div>

          {/* Status + Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tenant Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button variant="outline" onClick={() => { setNewStatus(tenant.status); setStatusReason(''); setStatusDialogOpen(true) }}>
                Change Status
              </Button>
              <Button variant="outline" onClick={() => { setNewMaxUsers(String(tenant.max_users)); setSeatsReason(''); setSlugConfirm(''); setSeatsDialogOpen(true) }}>
                Update Seats
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Features ═══ */}
        <TabsContent value="features" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feature Flags</CardTitle>
              <CardDescription>Toggle overrides for this tenant. Platform defaults shown in dimmed text.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {Object.entries(tenant.feature_flags_effective).map(([flag, effective]) => {
                  const isOverride = flag in tenant.feature_flags_raw
                  const defaultVal = tenant.feature_defaults[flag]
                  const pendingVal = pendingFeatureChanges[flag]
                  const displayVal = pendingVal !== undefined ? pendingVal : effective

                  return (
                    <div key={flag} className="flex items-center justify-between rounded-md border px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{flag.replace(/_/g, ' ')}</span>
                          {isOverride && <span className="text-[10px] text-amber-600 font-medium">OVERRIDE</span>}
                          {pendingVal !== undefined && <span className="text-[10px] text-blue-600 font-medium">PENDING</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">Default: {defaultVal ? 'ON' : 'OFF'}</p>
                      </div>
                      <Switch checked={displayVal} onCheckedChange={(checked) => handleFeatureToggle(flag, checked)} />
                    </div>
                  )
                })}
              </div>

              {hasPendingFeatureChanges && (
                <div className="rounded-md border bg-muted/50 p-4 space-y-3">
                  <p className="text-sm font-medium">Save {Object.keys(pendingFeatureChanges).length} pending change(s)</p>
                  <div className="space-y-2">
                    <Label htmlFor="feature-reason">Reason (required)</Label>
                    <Textarea id="feature-reason" value={featureReason} onChange={(e) => setFeatureReason(e.target.value)} placeholder="Why are you changing these flags?" rows={2} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => { setPendingFeatureChanges({}); setFeatureReason('') }} variant="outline" size="sm">Discard</Button>
                    <Button
                      onClick={() => {
                        if (featureReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
                        featureMutation.mutate({ flags: pendingFeatureChanges, reason: featureReason.trim() })
                      }}
                      disabled={featureMutation.isPending}
                      size="sm"
                    >
                      {featureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Users ═══ */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Users</CardTitle>
              <CardDescription>{tenant.active_users} active · {users.length} total loaded</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-9" />
              </div>
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sign-in</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell><Badge variant="outline">{u.role_name}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? 'default' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          {u.is_active ? (
                            <Button variant="outline" size="sm" onClick={() => openActionDialog('deactivate', u.id, u.full_name)}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => openActionDialog('reactivate', u.id, u.full_name)}>
                              <RefreshCw className="mr-1 h-3 w-3" /> Reactivate
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Invites ═══ */}
        <TabsContent value="invites" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invitations</CardTitle>
              <CardDescription>{tenant.pending_invites} active pending invites</CardDescription>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No invites found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Invited By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell><Badge variant="outline">{inv.role_name}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={inv.status === 'pending' ? 'default' : 'secondary'}>{inv.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm">{inv.invited_by ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {inv.status === 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => openActionDialog('revoke-invite', inv.id, inv.email)}>
                              <Trash2 className="mr-1 h-3 w-3" /> Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Audit ═══ */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audit Log</CardTitle>
              <CardDescription>Combined tenant and platform-admin actions</CardDescription>
            </CardHeader>
            <CardContent>
              {tenant.recent_audit.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No audit entries yet.</p>
              ) : (
                <div className="space-y-3">
                  {tenant.recent_audit.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 rounded-md border p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={ACTION_BADGE_VARIANT[entry.action] ?? 'secondary'} className="text-xs">{entry.action}</Badge>
                          <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                          <span className="text-xs text-muted-foreground">by {entry.actor}</span>
                        </div>
                        {entry.reason && <p className="text-sm text-muted-foreground mt-1">{entry.reason}</p>}
                        {entry.changes && Object.keys(entry.changes).length > 0 && (
                          <pre className="text-xs bg-muted rounded px-2 py-1 mt-1 overflow-x-auto">{JSON.stringify(entry.changes, null, 2)}</pre>
                        )}
                      </div>
                      <time className="text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Operations ═══ */}
        <TabsContent value="operations" className="space-y-6 mt-4">
          {/* Cache Purge */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cache Management</CardTitle>
              <CardDescription>Purge all cached data for this tenant (Redis)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Reason (required)</Label>
                <Textarea value={cacheReason} onChange={(e) => setCacheReason(e.target.value)} placeholder="Why are you purging the cache?" rows={2} />
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={cachePurgeMutation.isPending || cacheReason.trim().length < 5}
                onClick={() => cachePurgeMutation.mutate({ reason: cacheReason.trim() })}
              >
                {cachePurgeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Purge Cache
              </Button>
            </CardContent>
          </Card>

          {/* Rate-Limit Dashboard */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5" /> Rate-Limit Dashboard</CardTitle>
              <CardDescription>Operational health indicators for this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              {rateLimit ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-md border p-4 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Seat-Limit Denials</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{rateLimit.seat_limit_denials.last_1h}</span>
                      <span className="text-xs text-muted-foreground">/ 1h</span>
                      {rateLimit.seat_limit_denials.is_spiking && <Badge variant="destructive" className="text-[10px]">SPIKE</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">24h: {rateLimit.seat_limit_denials.last_24h} · 7d: {rateLimit.seat_limit_denials.last_7d}</p>
                  </div>

                  <div className="rounded-md border p-4 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Admin Actions</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{rateLimit.admin_actions.last_1h}</span>
                      <span className="text-xs text-muted-foreground">/ 1h</span>
                      {rateLimit.admin_actions.is_spiking && <Badge variant="destructive" className="text-[10px]">SPIKE</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Threshold: {rateLimit.admin_actions.spike_threshold}</p>
                  </div>

                  <div className="rounded-md border p-4 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Invite Velocity</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{rateLimit.invite_velocity.last_24h}</span>
                      <span className="text-xs text-muted-foreground">/ 24h</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading rate-limit data...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Dialogs ═══ */}

      {/* Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Tenant Status</DialogTitle>
            <DialogDescription>Current: {tenant.status}. This action is audited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="closed">Closed (permanent)</SelectItem>
                </SelectContent>
              </Select>
              {newStatus === 'closed' && (
                <p className="text-xs text-destructive font-medium">Closing a tenant is permanent and cannot be undone.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Why are you changing this status?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button
              variant={newStatus === 'closed' ? 'destructive' : 'default'}
              disabled={statusMutation.isPending || statusReason.trim().length < 5}
              onClick={() => statusMutation.mutate({ status: newStatus, reason: statusReason.trim() })}
            >
              {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {newStatus === tenant.status ? 'No Change' : `Set to ${newStatus}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seats Dialog */}
      <Dialog open={seatsDialogOpen} onOpenChange={setSeatsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Seat Limit</DialogTitle>
            <DialogDescription>
              Currently {tenant.active_users} active users out of {tenant.max_users} allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Max Users</Label>
              <Input type="number" min={tenant.active_users} max={1000} value={newMaxUsers} onChange={(e) => setNewMaxUsers(e.target.value)} />
              <p className="text-xs text-muted-foreground">Min: {tenant.active_users} (current active)</p>
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea value={seatsReason} onChange={(e) => setSeatsReason(e.target.value)} placeholder="e.g. Customer upgraded" rows={3} />
            </div>
            {needsSlugConfirmation && (
              <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Large increase — more than 2× current limit.</p>
                <Label>Type <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{tenant.slug}</code> to confirm</Label>
                <Input value={slugConfirm} onChange={(e) => setSlugConfirm(e.target.value)} placeholder={tenant.slug} autoComplete="off" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeatsDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={seatsMutation.isPending || seatsReason.trim().length < 5 || (needsSlugConfirmation && slugConfirm !== tenant.slug)}
              onClick={() => {
                const parsed = parseInt(newMaxUsers, 10)
                if (isNaN(parsed) || parsed < 1 || parsed > 1000) { toast.error('Must be 1-1000'); return }
                seatsMutation.mutate({ maxUsers: parsed, reason: seatsReason.trim() })
              }}
            >
              {seatsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic Action Dialog (deactivate/reactivate/revoke) */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionTarget?.type?.replace('-', ' ')}</DialogTitle>
            <DialogDescription>
              {actionTarget?.type === 'deactivate' && `Deactivate ${actionTarget.label}. This will set the user to inactive.`}
              {actionTarget?.type === 'reactivate' && `Reactivate ${actionTarget.label}. This will re-enable the user (seat-limit permitting).`}
              {actionTarget?.type === 'revoke-invite' && `Revoke the invitation to ${actionTarget.label}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Why are you performing this action?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button
              variant={actionTarget?.type === 'deactivate' || actionTarget?.type === 'revoke-invite' ? 'destructive' : 'default'}
              disabled={userActionMutation.isPending || inviteRevokeMutation.isPending || actionReason.trim().length < 5}
              onClick={handleActionSubmit}
            >
              {(userActionMutation.isPending || inviteRevokeMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
