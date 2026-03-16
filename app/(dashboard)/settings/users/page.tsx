'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MoreHorizontal,
  Plus,
  Send,
  Shield,
  UserMinus,
  UserCheck,
  Users,
  XCircle,
  Clock,
  Link2,
  Pencil,
  KeyRound,
  Mail,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { inviteUserSchema, type InviteUserFormValues } from '@/lib/schemas/settings'

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { EmptyState } from '@/components/shared/empty-state'

interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role_id: string | null
  is_active: boolean
  last_login_at: string | null
  role_name: string | null
}

interface RoleOption {
  id: string
  name: string
}

function getStatusBadge(user: UserRow) {
  if (!user.is_active) {
    return <Badge variant="destructive">Deactivated</Badge>
  }
  if (!user.last_login_at) {
    return <Badge variant="secondary">Invited</Badge>
  }
  return <Badge variant="default">Active</Badge>
}

export default function SettingsUsersPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changeEmailOpen, setChangeEmailOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const { data: users, isLoading } = useQuery({
    queryKey: ['settings', 'users', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!tenant) return []
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role_id, is_active, last_login_at')
        .eq('tenant_id', tenant.id)
        .order('first_name')
      if (error) throw error
      // Fetch roles to map names
      const { data: rolesData } = await supabase
        .from('roles')
        .select('id, name')
        .eq('tenant_id', tenant.id)
      const roleMap = Object.fromEntries((rolesData ?? []).map(r => [r.id, r.name]))
      return (data ?? []).map(u => ({
        ...u,
        role_name: u.role_id ? roleMap[u.role_id] ?? null : null,
      })) as UserRow[]
    },
    enabled: !!tenant,
  })

  const { data: roles } = useQuery({
    queryKey: ['settings', 'roles-list', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!tenant) return []
      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .order('name')
      if (error) throw error
      return (data ?? []) as RoleOption[]
    },
    enabled: !!tenant,
  })

  const inviteForm = useForm<InviteUserFormValues>({
    resolver: standardSchemaResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
    },
  })

  const { data: pendingInvites } = useQuery({
    queryKey: ['settings', 'invites', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!tenant) return []
      const { data, error } = await supabase
        .from('user_invites')
        .select('id, first_name, last_name, email, role_id, token, status, created_at, expires_at')
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant,
  })

  const inviteUser = useMutation({
    mutationFn: async (values: InviteUserFormValues) => {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        // Attach machine code for onError to parse
        const err = new Error(data.error ?? 'Failed to send invitation')
        ;(err as any).code = data.code ?? null
        ;(err as any).reason = data.reason ?? null
        ;(err as any).active_user_count = data.active_user_count ?? null
        ;(err as any).max_users = data.max_users ?? null
        ;(err as any).pending_invites = data.pending_invites ?? null
        throw err
      }
      return data
    },
    onSuccess: () => {
      toast.success('Invitation sent successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'invites'] })
      setInviteOpen(false)
      inviteForm.reset()
    },
    onError: (error: any) => {
      if (error.code === 'SEAT_LIMIT_REACHED') {
        if (error.reason === 'PENDING_INVITE_CAP') {
          toast.error('Too many pending invitations', {
            description: `You have ${error.pending_invites} active invitations. Revoke unused invitations or wait for them to expire before sending new ones.`,
          })
        } else {
          toast.error('Seat limit reached', {
            description: `Your firm has ${error.active_user_count} of ${error.max_users} seats in use. Deactivate a user or contact your administrator to increase the limit.`,
          })
        }
      } else {
        toast.error('Failed to invite user.', { description: error.message })
      }
    },
  })

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await fetch(`/api/settings/users/invites/${inviteId}/revoke`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke invitation')
    },
    onSuccess: () => {
      toast.success('Invitation revoked.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'invites'] })
    },
    onError: (error) => {
      toast.error('Failed to revoke invitation.', { description: error.message })
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update role')
    },
    onSuccess: () => {
      toast.success('User role updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setEditRoleOpen(false)
      setEditingUser(null)
    },
    onError: (error) => {
      toast.error('Failed to update role.', { description: error.message })
    },
  })

  const deactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/settings/users/${userId}/deactivate`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to deactivate user')
    },
    onSuccess: () => {
      toast.success('User deactivated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: (error) => {
      toast.error('Failed to deactivate user.', { description: error.message })
    },
  })

  const updateUser = useMutation({
    mutationFn: async ({ userId, first_name, last_name }: { userId: string; first_name: string; last_name: string }) => {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name, last_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update user')
    },
    onSuccess: () => {
      toast.success('User updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setEditUserOpen(false)
      setEditingUser(null)
    },
    onError: (error) => {
      toast.error('Failed to update user.', { description: error.message })
    },
  })

  const changePassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to change password')
    },
    onSuccess: () => {
      toast.success('Password changed successfully.')
      setChangePasswordOpen(false)
      setEditingUser(null)
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) => {
      toast.error('Failed to change password.', { description: error.message })
    },
  })

  const reactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reactivate user')
    },
    onSuccess: () => {
      toast.success('User reactivated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: (error) => {
      toast.error('Failed to reactivate user.', { description: error.message })
    },
  })

  const changeEmail = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to change email')
    },
    onSuccess: () => {
      toast.success('Email changed successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setChangeEmailOpen(false)
      setEditingUser(null)
      setNewEmail('')
    },
    onError: (error) => {
      toast.error('Failed to change email.', { description: error.message })
    },
  })

  function onInviteSubmit(values: InviteUserFormValues) {
    inviteUser.mutate(values)
  }

  function handleEditUser(user: UserRow) {
    setEditingUser(user)
    setEditFirstName(user.first_name ?? '')
    setEditLastName(user.last_name ?? '')
    setEditUserOpen(true)
  }

  function handleChangePassword(user: UserRow) {
    setEditingUser(user)
    setNewPassword('')
    setConfirmPassword('')
    setChangePasswordOpen(true)
  }

  function handleChangeEmail(user: UserRow) {
    setEditingUser(user)
    setNewEmail(user.email)
    setChangeEmailOpen(true)
  }

  function handleSaveEmail() {
    if (!editingUser || !newEmail) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      toast.error('Please enter a valid email address.')
      return
    }
    if (newEmail === editingUser.email) {
      toast.error('New email is the same as the current email.')
      return
    }
    changeEmail.mutate({ userId: editingUser.id, email: newEmail })
  }

  function handleSaveUser() {
    if (!editingUser) return
    updateUser.mutate({ userId: editingUser.id, first_name: editFirstName, last_name: editLastName })
  }

  function handleSavePassword() {
    if (!editingUser || !newPassword) return
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }
    changePassword.mutate({ userId: editingUser.id, password: newPassword })
  }

  function handleEditRole(user: UserRow) {
    setEditingUser(user)
    setSelectedRoleId(user.role_id ?? '')
    setEditRoleOpen(true)
  }

  function handleSaveRole() {
    if (!editingUser || !selectedRoleId) return
    updateRole.mutate({ userId: editingUser.id, roleId: selectedRoleId })
  }

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Users</h2>
            <p className="text-muted-foreground">Manage team members and their roles.</p>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="rounded-md border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage team members and their access roles.
            {tenant && (
              <span className="ml-1">
                Your plan allows {tenant.max_users} active {tenant.max_users === 1 ? 'user' : 'users'}. Pending invitations do not consume seats.
              </span>
            )}
          </p>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new team member. They will receive an email to set up their account.
                {tenant && ` Only active users count toward your ${tenant.max_users}-seat limit. Invitations are capped separately.`}
              </DialogDescription>
            </DialogHeader>
            <Form {...inviteForm}>
              <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={inviteForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={inviteForm.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={inviteForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <p className="text-sm text-muted-foreground">
                  Invited users are automatically assigned the <strong>Admin</strong> role.
                </p>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInviteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteUser.isPending}>
                    {inviteUser.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Invitation
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!users || users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description="Invite team members to get started with your firm."
          actionLabel="Invite User"
          onAction={() => setInviteOpen(true)}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.first_name} {user.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role_name ?? 'No role'}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(user)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.last_login_at
                      ? formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true })
                      : 'Never'}
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
                        <DropdownMenuItem onClick={() => handleEditUser(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditRole(user)}>
                          <Shield className="mr-2 h-4 w-4" />
                          Edit Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangePassword(user)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Change Password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeEmail(user)}>
                          <Mail className="mr-2 h-4 w-4" />
                          Change Email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deactivateUser.mutate(user.id)}
                          disabled={!user.is_active}
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                        {!user.is_active && (
                          <DropdownMenuItem
                            onClick={() => reactivateUser.mutate(user.id)}
                            disabled={reactivateUser.isPending}
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            Reactivate
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

      {/* Pending Invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Pending Invitations ({pendingInvites.length})
          </h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">
                      {invite.first_name} {invite.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{invite.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const link = `${window.location.origin}/invite/${invite.token}`
                            navigator.clipboard.writeText(link)
                            toast.success('Invite link copied!', { description: link })
                          }}
                          title="Copy invite link"
                        >
                          <Link2 className="h-4 w-4" />
                          <span className="sr-only">Copy invite link</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => revokeInvite.mutate(invite.id)}
                          disabled={revokeInvite.isPending}
                        >
                          <XCircle className="h-4 w-4" />
                          <span className="sr-only">Revoke invitation</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update the name for {editingUser?.first_name} {editingUser?.last_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name</label>
              <Input
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <Input
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending || !editFirstName || !editLastName}>
              {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for {editingUser?.first_name} {editingUser?.last_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePassword} disabled={changePassword.isPending || !newPassword || !confirmPassword}>
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Email Dialog */}
      <Dialog open={changeEmailOpen} onOpenChange={setChangeEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Email</DialogTitle>
            <DialogDescription>
              Update the login email for {editingUser?.first_name} {editingUser?.last_name}. The user will need to use the new email to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Email</label>
              <Input value={editingUser?.email ?? ''} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeEmailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEmail} disabled={changeEmail.isPending || !newEmail}>
              {changeEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the role for {editingUser?.first_name} {editingUser?.last_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole} disabled={updateRole.isPending || !selectedRoleId}>
              {updateRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
