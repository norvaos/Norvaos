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
  UserPlus,
  Copy,
  CheckCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { norvaToast } from '@/lib/utils/norva-branding'
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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusBadge(user: UserRow) {
  if (!user.is_active) return <Badge variant="destructive">Deactivated</Badge>
  if (!user.last_login_at) return <Badge variant="secondary">Invited</Badge>
  return <Badge variant="default">Active</Badge>
}

// ─── Created Credentials Modal ───────────────────────────────────────────────

function CreatedCredentialsModal({
  open,
  email,
  password,
  onClose,
}: {
  open: boolean
  email: string
  password: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function copyAll() {
    navigator.clipboard.writeText(`Email: ${email}\nTemporary Password: ${password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCheck className="w-5 h-5" />
            User Created Successfully
          </DialogTitle>
          <DialogDescription>
            Share these credentials with the new user. They will be required to set a new
            password when they first log in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg bg-slate-50 border p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</p>
            <p className="font-mono text-sm text-slate-900 break-all">{email}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Temporary Password</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm text-slate-900 flex-1 break-all">
                {showPw ? password : '••••••••••••••'}
              </p>
              <button
                onClick={() => setShowPw(!showPw)}
                className="text-slate-400 hover:text-slate-700 shrink-0"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <strong>Note:</strong> This password will not be shown again. Copy it now before closing.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={copyAll} className="flex-1">
            {copied ? (
              <><CheckCheck className="mr-2 h-4 w-4 text-emerald-600" />Copied!</>
            ) : (
              <><Copy className="mr-2 h-4 w-4" />Copy Credentials</>
            )}
          </Button>
          <Button onClick={onClose} className="flex-1">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsUsersPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const queryClient = useQueryClient()

  // Dialog state
  const [addUserOpen, setAddUserOpen]             = useState(false)
  const [addMode, setAddMode]                     = useState<'invite' | 'create'>('invite')
  const [editRoleOpen, setEditRoleOpen]           = useState(false)
  const [editUserOpen, setEditUserOpen]           = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changeEmailOpen, setChangeEmailOpen]     = useState(false)
  const [editingUser, setEditingUser]             = useState<UserRow | null>(null)
  const [selectedRoleId, setSelectedRoleId]       = useState('')

  // Create-user dialog state
  const [createFirstName, setCreateFirstName]     = useState('')
  const [createLastName, setCreateLastName]       = useState('')
  const [createEmail, setCreateEmail]             = useState('')
  const [createRoleId, setCreateRoleId]           = useState('')

  // Credentials reveal
  const [createdEmail, setCreatedEmail]           = useState('')
  const [createdPassword, setCreatedPassword]     = useState('')
  const [showCredentials, setShowCredentials]     = useState(false)

  // Edit state
  const [editFirstName, setEditFirstName]         = useState('')
  const [editLastName, setEditLastName]           = useState('')
  const [newPassword, setNewPassword]             = useState('')
  const [confirmPassword, setConfirmPassword]     = useState('')
  const [newEmail, setNewEmail]                   = useState('')

  // ─── Queries ────────────────────────────────────────────────────

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
      const { data: rolesData } = await supabase
        .from('roles')
        .select('id, name')
        .eq('tenant_id', tenant.id)
      const roleMap = Object.fromEntries((rolesData ?? []).map((r) => [r.id, r.name]))
      return (data ?? []).map((u) => ({
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

  // Pending invitations — filter out expired ones so they don't linger
  const { data: pendingInvites } = useQuery({
    queryKey: ['settings', 'invites', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!tenant) return []
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('user_invites')
        .select('id, first_name, last_name, email, role_id, token, status, created_at, expires_at')
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .gt('expires_at', now)          // ← only non-expired invites
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant,
  })

  // ─── Invite form ─────────────────────────────────────────────────

  const inviteForm = useForm<InviteUserFormValues>({
    resolver: standardSchemaResolver(inviteUserSchema),
    defaultValues: { email: '', first_name: '', last_name: '', role_id: '' },
  })

  // ─── Mutations ───────────────────────────────────────────────────

  const inviteUser = useMutation({
    mutationFn: async (values: InviteUserFormValues) => {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
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
      setAddUserOpen(false)
      inviteForm.reset()
    },
    onError: (error: any) => {
      if (error.code === 'SEAT_LIMIT_REACHED') {
        norvaToast('seat_limit', error.reason === 'PENDING_INVITE_CAP'
          ? `You have ${error.pending_invites} active invitations. Revoke unused ones first.`
          : `Your firm has ${error.active_user_count} of ${error.max_users} seats in use.`)
      } else {
        norvaToast('save_failed', error.message)
      }
    },
  })

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          first_name: createFirstName,
          last_name: createLastName,
          role_id: createRoleId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const err = new Error(data.error ?? 'Failed to create user')
        ;(err as any).code = data.code ?? null
        ;(err as any).reason = data.reason ?? null
        ;(err as any).active_user_count = data.active_user_count ?? null
        ;(err as any).max_users = data.max_users ?? null
        ;(err as any).pending_invites = data.pending_invites ?? null
        throw err
      }
      return data as { data: { user_id: string; temp_password: string } }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setAddUserOpen(false)
      setCreatedEmail(createEmail)
      setCreatedPassword(result.data.temp_password)
      setShowCredentials(true)
      // Reset create form
      setCreateFirstName('')
      setCreateLastName('')
      setCreateEmail('')
      setCreateRoleId('')
    },
    onError: (error: any) => {
      if (error.code === 'SEAT_LIMIT_REACHED') {
        norvaToast('seat_limit', `Your firm has ${error.active_user_count} of ${error.max_users} seats in use.`)
      } else {
        norvaToast('save_failed', error.message)
      }
    },
  })

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await fetch(`/api/settings/users/invites/${inviteId}/revoke`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke invitation')
    },
    onSuccess: () => {
      toast.success('Invitation revoked.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'invites'] })
    },
    onError: (error) => toast.error('Failed to revoke invitation.', { description: error.message }),
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
      toast.success('User role updated.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setEditRoleOpen(false)
      setEditingUser(null)
    },
    onError: (error) => toast.error('Failed to update role.', { description: error.message }),
  })

  const deactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/settings/users/${userId}/deactivate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to deactivate user')
    },
    onSuccess: () => {
      toast.success('User deactivated.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: (error) => toast.error('Failed to deactivate user.', { description: error.message }),
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
      toast.success('User updated.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setEditUserOpen(false)
      setEditingUser(null)
    },
    onError: (error) => toast.error('Failed to update user.', { description: error.message }),
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
      toast.success('Password changed.')
      setChangePasswordOpen(false)
      setEditingUser(null)
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) => toast.error('Failed to change password.', { description: error.message }),
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
      toast.success('User reactivated.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: (error) => toast.error('Failed to reactivate user.', { description: error.message }),
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
      toast.success('Email changed.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setChangeEmailOpen(false)
      setEditingUser(null)
      setNewEmail('')
    },
    onError: (error) => toast.error('Failed to change email.', { description: error.message }),
  })

  // ─── Handlers ────────────────────────────────────────────────────

  function openAddUser(mode: 'invite' | 'create') {
    setAddMode(mode)
    setAddUserOpen(true)
  }

  function handleSaveUser() {
    if (!editingUser) return
    updateUser.mutate({ userId: editingUser.id, first_name: editFirstName, last_name: editLastName })
  }

  function handleSavePassword() {
    if (!editingUser || !newPassword) return
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match.'); return }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters.'); return }
    changePassword.mutate({ userId: editingUser.id, password: newPassword })
  }

  function handleSaveEmail() {
    if (!editingUser || !newEmail) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) { toast.error('Please enter a valid email address.'); return }
    if (newEmail === editingUser.email) { toast.error('New email is the same as the current email.'); return }
    changeEmail.mutate({ userId: editingUser.id, email: newEmail })
  }

  function handleSaveRole() {
    if (!editingUser || !selectedRoleId) return
    updateRole.mutate({ userId: editingUser.id, roleId: selectedRoleId })
  }

  function handleCreateSubmit() {
    if (!createFirstName.trim() || !createLastName.trim() || !createEmail.trim()) {
      toast.error('All fields are required.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(createEmail)) { toast.error('Invalid email address.'); return }
    createUser.mutate()
  }

  // ─── Loading skeleton ─────────────────────────────────────────────

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h2 className="text-2xl font-bold tracking-tight">Users</h2></div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="rounded-md border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage team members and their access roles.
            {tenant && (
              <span className="ml-1">
                Your plan allows {tenant.max_users} active {tenant.max_users === 1 ? 'user' : 'users'}.
              </span>
            )}
          </p>
        </div>

        {/* Add User split buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openAddUser('invite')}>
            <Send className="mr-2 h-4 w-4" />
            Send Invite
          </Button>
          <Button onClick={() => openAddUser('create')}>
            <UserPlus className="mr-2 h-4 w-4" />
            Create Account
          </Button>
        </div>
      </div>

      {/* Users Table */}
      {!users || users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description="Add team members to get started."
          actionLabel="Create Account"
          onAction={() => openAddUser('create')}
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
                        <DropdownMenuItem onClick={() => { setEditingUser(user); setEditFirstName(user.first_name ?? ''); setEditLastName(user.last_name ?? ''); setEditUserOpen(true) }}>
                          <Pencil className="mr-2 h-4 w-4" />Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingUser(user); setSelectedRoleId(user.role_id ?? ''); setEditRoleOpen(true) }}>
                          <Shield className="mr-2 h-4 w-4" />Edit Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingUser(user); setNewPassword(''); setConfirmPassword(''); setChangePasswordOpen(true) }}>
                          <KeyRound className="mr-2 h-4 w-4" />Change Password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingUser(user); setNewEmail(user.email); setChangeEmailOpen(true) }}>
                          <Mail className="mr-2 h-4 w-4" />Change Email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.is_active ? (
                          <DropdownMenuItem variant="destructive" onClick={() => deactivateUser.mutate(user.id)}>
                            <UserMinus className="mr-2 h-4 w-4" />Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => reactivateUser.mutate(user.id)} disabled={reactivateUser.isPending}>
                            <UserCheck className="mr-2 h-4 w-4" />Reactivate
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

      {/* Pending Invites — only non-expired */}
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
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.first_name} {invite.last_name}</TableCell>
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
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          title="Copy invite link"
                          onClick={() => {
                            const link = `${window.location.origin}/invite/${invite.token}`
                            navigator.clipboard.writeText(link)
                            toast.success('Invite link copied!', { description: link })
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => revokeInvite.mutate(invite.id)}
                          disabled={revokeInvite.isPending}
                        >
                          <XCircle className="h-4 w-4" />
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

      {/* ═══ Add User Dialog (Invite OR Create) ═══ */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          {/* Mode switcher tabs */}
          <div className="flex rounded-lg border overflow-hidden mb-1">
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                addMode === 'invite'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setAddMode('invite')}
            >
              <Send className="inline-block mr-1.5 h-3.5 w-3.5" />
              Send Invite Email
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors border-l ${
                addMode === 'create'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setAddMode('create')}
            >
              <UserPlus className="inline-block mr-1.5 h-3.5 w-3.5" />
              Create Account
            </button>
          </div>

          {/* ── Invite mode ─────────────────────────────────────── */}
          {addMode === 'invite' && (
            <>
              <DialogHeader>
                <DialogTitle>Send Invite Email</DialogTitle>
                <DialogDescription>
                  The user will receive an email with a link to set up their account.
                </DialogDescription>
              </DialogHeader>
              <Form {...inviteForm}>
                <form onSubmit={inviteForm.handleSubmit((v) => inviteUser.mutate(v))} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={inviteForm.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl><Input placeholder="First name" {...field} /></FormControl>
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
                          <FormControl><Input placeholder="Last name" {...field} /></FormControl>
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
                        <FormControl><Input type="email" placeholder="user@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={inviteForm.control}
                    name="role_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roles?.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={inviteUser.isPending}>
                      {inviteUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Send Invitation
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          )}

          {/* ── Create Account mode ──────────────────────────────── */}
          {addMode === 'create' && (
            <>
              <DialogHeader>
                <DialogTitle>Create Account</DialogTitle>
                <DialogDescription>
                  Creates the account immediately with a temporary password. The user must set a new password when they first log in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">First Name</label>
                    <Input
                      value={createFirstName}
                      onChange={(e) => setCreateFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Last Name</label>
                    <Input
                      value={createLastName}
                      onChange={(e) => setCreateLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email Address</label>
                  <Input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={createRoleId} onValueChange={setCreateRoleId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2">
                  A temporary password will be generated. Share it with the user — they will be forced to change it on first login.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateSubmit}
                  disabled={createUser.isPending || !createFirstName || !createLastName || !createEmail}
                >
                  {createUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Create Account
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Credentials Reveal Modal ═══ */}
      <CreatedCredentialsModal
        open={showCredentials}
        email={createdEmail}
        password={createdPassword}
        onClose={() => setShowCredentials(false)}
      />

      {/* ═══ Edit User ═══ */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update the name for {editingUser?.first_name} {editingUser?.last_name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name</label>
              <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending || !editFirstName || !editLastName}>
              {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Change Password ═══ */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Set a new password for {editingUser?.first_name} {editingUser?.last_name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePassword} disabled={changePassword.isPending || !newPassword || !confirmPassword}>
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Change Email ═══ */}
      <Dialog open={changeEmailOpen} onOpenChange={setChangeEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Email</DialogTitle>
            <DialogDescription>Update the login email for {editingUser?.first_name} {editingUser?.last_name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Email</label>
              <Input value={editingUser?.email ?? ''} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Email</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEmail} disabled={changeEmail.isPending || !newEmail}>
              {changeEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Edit Role ═══ */}
      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>Change the role for {editingUser?.first_name} {editingUser?.last_name}.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleOpen(false)}>Cancel</Button>
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
