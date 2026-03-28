'use client'

import { useState } from 'react'
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Users,
  Key,
  Eye,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import {
  useSupervision,
  useAddSupervision,
  useRemoveSupervision,
  useDelegations,
  useCreateDelegation,
  useRevokeDelegation,
  useBreakGlassGrants,
  useGrantBreakGlass,
  useRevokeBreakGlass,
} from '@/lib/queries/matter-access'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// ─── Add Supervision Dialog ──────────────────────────────────────────────────

function AddSupervisionDialog({
  open,
  onOpenChange,
  onAdd,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (supervisorId: string, superviseeId: string) => void
  isPending: boolean
}) {
  const [supervisorId, setSupervisorId] = useState('')
  const [superviseeId, setSuperviseeId] = useState('')

  function handleAdd() {
    if (!supervisorId.trim() || !superviseeId.trim()) {
      toast.error('Both supervisor and supervisee user IDs are required')
      return
    }
    onAdd(supervisorId.trim(), superviseeId.trim())
    setSupervisorId('')
    setSuperviseeId('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Add Supervision Relationship</DialogTitle>
          <DialogDescription>
            Create a supervisor-supervisee pair. The supervisor will be able to view matters assigned to the supervisee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supervisor">Supervisor User ID</Label>
            <Input
              id="supervisor"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              placeholder="Enter supervisor user ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supervisee">Supervisee User ID</Label>
            <Input
              id="supervisee"
              value={superviseeId}
              onChange={(e) => setSuperviseeId(e.target.value)}
              placeholder="Enter supervisee user ID"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add Relationship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Delegation Dialog ────────────────────────────────────────────────

function CreateDelegationDialog({
  open,
  onOpenChange,
  onCreate,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (params: {
    delegateUserId: string
    matterId: string | null
    accessLevel: 'read' | 'read_write'
    reason: string | null
    expiresAt: string | null
  }) => void
  isPending: boolean
}) {
  const [delegateUserId, setDelegateUserId] = useState('')
  const [matterId, setMatterId] = useState('')
  const [accessLevel, setAccessLevel] = useState<'read' | 'read_write'>('read')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  function handleCreate() {
    if (!delegateUserId.trim()) {
      toast.error('Delegate user ID is required')
      return
    }
    onCreate({
      delegateUserId: delegateUserId.trim(),
      matterId: matterId.trim() || null,
      accessLevel,
      reason: reason.trim() || null,
      expiresAt: expiresAt || null,
    })
    setDelegateUserId('')
    setMatterId('')
    setAccessLevel('read')
    setReason('')
    setExpiresAt('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Create Delegation</DialogTitle>
          <DialogDescription>
            Delegate matter access to another team member. They will gain the specified access level.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="delegate">Delegate User ID</Label>
            <Input
              id="delegate"
              value={delegateUserId}
              onChange={(e) => setDelegateUserId(e.target.value)}
              placeholder="Enter delegate user ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="matter">Matter ID (optional)</Label>
            <Input
              id="matter"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              placeholder="Leave blank for all matters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="access-level">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as 'read' | 'read_write')}>
              <SelectTrigger id="access-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read Only</SelectItem>
                <SelectItem value="read_write">Read & Write</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this delegation needed?"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires">Expires At (optional)</Label>
            <Input
              id="expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create Delegation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Grant Break-Glass Dialog ────────────────────────────────────────────────

function GrantBreakGlassDialog({
  open,
  onOpenChange,
  onGrant,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGrant: (params: {
    grantedTo: string
    matterId: string | null
    reason: string
    expiresAt: string
  }) => void
  isPending: boolean
}) {
  const [grantedTo, setGrantedTo] = useState('')
  const [matterId, setMatterId] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  // Default to 24 hours from now, max 72 hours
  const maxExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 16)

  function handleGrant() {
    if (!grantedTo.trim()) {
      toast.error('User ID is required')
      return
    }
    if (!reason.trim()) {
      toast.error('Reason is required for break-glass access')
      return
    }
    if (!expiresAt) {
      toast.error('Expiry time is required (max 72 hours)')
      return
    }

    const expiryDate = new Date(expiresAt)
    const maxDate = new Date(Date.now() + 72 * 60 * 60 * 1000)
    if (expiryDate > maxDate) {
      toast.error('Break-glass access cannot exceed 72 hours')
      return
    }

    onGrant({
      grantedTo: grantedTo.trim(),
      matterId: matterId.trim() || null,
      reason: reason.trim(),
      expiresAt: new Date(expiresAt).toISOString(),
    })
    setGrantedTo('')
    setMatterId('')
    setReason('')
    setExpiresAt('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-500" />
            Grant Break-Glass Access
          </DialogTitle>
          <DialogDescription>
            Emergency access grant. All break-glass actions are logged and audited.
            Maximum duration is 72 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-md border border-amber-500/20 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-400">
              Break-glass access should only be used in emergencies. This action will be logged in the audit trail
              and all activity during the grant period will be tracked.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bg-user">Grant To (User ID)</Label>
            <Input
              id="bg-user"
              value={grantedTo}
              onChange={(e) => setGrantedTo(e.target.value)}
              placeholder="Enter user ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bg-matter">Matter ID (optional)</Label>
            <Input
              id="bg-matter"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              placeholder="Leave blank for all matters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bg-reason">Reason (required)</Label>
            <Textarea
              id="bg-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why emergency access is needed"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bg-expires">Expires At (max 72h)</Label>
            <Input
              id="bg-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              max={maxExpiry}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGrant} disabled={isPending} variant="destructive">
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Grant Emergency Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AccessControlSettingsPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const { role } = useUserRole()

  // Data hooks
  const { data: supervision, isLoading: supervisionLoading } = useSupervision()
  const { data: delegations, isLoading: delegationsLoading } = useDelegations()
  const { data: breakGlassGrants, isLoading: breakGlassLoading } = useBreakGlassGrants()

  // Mutation hooks
  const addSupervision = useAddSupervision()
  const removeSupervision = useRemoveSupervision()
  const createDelegation = useCreateDelegation()
  const revokeDelegation = useRevokeDelegation()
  const grantBreakGlass = useGrantBreakGlass()
  const revokeBreakGlass = useRevokeBreakGlass()

  // Dialog state
  const [supervisionDialogOpen, setSupervisionDialogOpen] = useState(false)
  const [delegationDialogOpen, setDelegationDialogOpen] = useState(false)
  const [breakGlassDialogOpen, setBreakGlassDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ type: 'supervision' | 'delegation' | 'break-glass'; id: string } | null>(null)

  // Permission check
  const canView = role?.name === 'Admin' || role?.permissions?.settings?.view === true
  const canEdit = role?.name === 'Admin' || role?.permissions?.settings?.edit === true

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Access Denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view access control settings.
          </p>
        </div>
      </div>
    )
  }

  const isLoading = supervisionLoading || delegationsLoading || breakGlassLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  function handleRevoke() {
    if (!revokeTarget) return
    switch (revokeTarget.type) {
      case 'supervision':
        removeSupervision.mutate(revokeTarget.id)
        break
      case 'delegation':
        revokeDelegation.mutate(revokeTarget.id)
        break
      case 'break-glass':
        revokeBreakGlass.mutate(revokeTarget.id)
        break
    }
    setRevokeDialogOpen(false)
    setRevokeTarget(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Access Control</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage supervision relationships, delegations, and emergency break-glass access grants.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="supervision" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="supervision" className="gap-1.5">
            <Users className="size-3.5" />
            Supervision
          </TabsTrigger>
          <TabsTrigger value="delegations" className="gap-1.5">
            <Key className="size-3.5" />
            Delegations
          </TabsTrigger>
          <TabsTrigger value="break-glass" className="gap-1.5">
            <AlertTriangle className="size-3.5" />
            Break-Glass
          </TabsTrigger>
        </TabsList>

        {/* Supervision Tab */}
        <TabsContent value="supervision" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Supervisor-Supervisee Pairs</CardTitle>
                <CardDescription>
                  Supervisors can view all matters assigned to their supervisees.
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => setSupervisionDialogOpen(true)}>
                  <Plus className="mr-2 size-3.5" />
                  Add Pair
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!supervision || supervision.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
                  <Users className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">No supervision relationships</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add supervisor-supervisee pairs to enable hierarchical matter access.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {supervision.map((pair: Record<string, unknown>) => (
                    <div
                      key={pair.id as string}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-950/30 text-blue-600">
                          <Eye className="size-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            Supervisor: {(pair.supervisor_id as string)?.slice(0, 8)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Supervisee: {(pair.supervisee_id as string)?.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600"
                          onClick={() => {
                            setRevokeTarget({ type: 'supervision', id: pair.id as string })
                            setRevokeDialogOpen(true)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delegations Tab */}
        <TabsContent value="delegations" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Active Delegations</CardTitle>
                <CardDescription>
                  Delegate matter access to team members with configurable access levels.
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => setDelegationDialogOpen(true)}>
                  <Plus className="mr-2 size-3.5" />
                  Create Delegation
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!delegations || delegations.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
                  <Key className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">No active delegations</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create delegations to grant temporary or permanent matter access to team members.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {delegations.map((delegation) => (
                    <div
                      key={delegation.id as string}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                          <Key className="size-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">
                              Delegate: {(delegation.delegate_user_id as string)?.slice(0, 8)}...
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {delegation.access_level === 'read_write' ? 'Read & Write' : 'Read Only'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {delegation.matter_id ? `Matter: ${(delegation.matter_id as string).slice(0, 8)}...` : 'All matters'}
                            {delegation.expires_at && (
                              <> &middot; Expires: {new Date(delegation.expires_at as string).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600"
                          onClick={() => {
                            setRevokeTarget({ type: 'delegation', id: delegation.id as string })
                            setRevokeDialogOpen(true)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Break-Glass Tab */}
        <TabsContent value="break-glass" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Break-Glass Grants
                </CardTitle>
                <CardDescription>
                  Emergency access grants with a maximum duration of 72 hours. All actions are logged.
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" className="border-amber-500/20 text-amber-400 hover:bg-amber-950/30" onClick={() => setBreakGlassDialogOpen(true)}>
                  <Plus className="mr-2 size-3.5" />
                  Grant Access
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!breakGlassGrants || breakGlassGrants.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
                  <Shield className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">No active break-glass grants</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Break-glass access should only be used in emergency situations.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {breakGlassGrants.map((grant) => {
                    const isExpired = grant.expires_at
                      ? new Date(grant.expires_at as string) < new Date()
                      : false
                    return (
                      <div
                        key={grant.id as string}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex size-8 items-center justify-center rounded-lg ${isExpired ? 'bg-slate-50 text-slate-400' : 'bg-amber-950/30 text-amber-600'}`}>
                            <AlertTriangle className="size-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">
                                Granted to: {(grant.granted_to as string)?.slice(0, 8)}...
                              </p>
                              {isExpired ? (
                                <Badge variant="secondary" className="text-xs">Expired</Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-500/20 bg-amber-950/30 text-amber-400 text-xs">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Reason: {(grant.reason as string) ?? 'N/A'}
                              {grant.expires_at && (
                                <> &middot; Expires: {new Date(grant.expires_at as string).toLocaleString()}</>
                              )}
                            </p>
                          </div>
                        </div>
                        {canEdit && !isExpired && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-500 hover:text-red-600"
                            onClick={() => {
                              setRevokeTarget({ type: 'break-glass', id: grant.id as string })
                              setRevokeDialogOpen(true)
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddSupervisionDialog
        open={supervisionDialogOpen}
        onOpenChange={setSupervisionDialogOpen}
        onAdd={(supervisorId, superviseeId) => {
          addSupervision.mutate({ supervisorId, superviseeId }, {
            onSuccess: () => setSupervisionDialogOpen(false),
          })
        }}
        isPending={addSupervision.isPending}
      />

      <CreateDelegationDialog
        open={delegationDialogOpen}
        onOpenChange={setDelegationDialogOpen}
        onCreate={(params) => {
          createDelegation.mutate(params, {
            onSuccess: () => setDelegationDialogOpen(false),
          })
        }}
        isPending={createDelegation.isPending}
      />

      <GrantBreakGlassDialog
        open={breakGlassDialogOpen}
        onOpenChange={setBreakGlassDialogOpen}
        onGrant={(params) => {
          grantBreakGlass.mutate(params, {
            onSuccess: () => setBreakGlassDialogOpen(false),
          })
        }}
        isPending={grantBreakGlass.isPending}
      />

      {/* Revoke Confirmation */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {revokeTarget?.type === 'supervision' ? 'Supervision' : revokeTarget?.type === 'delegation' ? 'Delegation' : 'Break-Glass Access'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.type === 'break-glass'
                ? 'This will immediately revoke emergency access. The user will lose access to the associated matters.'
                : 'This action will take effect immediately. The affected user will lose the associated access.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
