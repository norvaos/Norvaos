'use client'

import { useState, useEffect } from 'react'
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
  Users,
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
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')

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
      role_id: '',
    },
  })

  const inviteUser = useMutation({
    mutationFn: async (values: InviteUserFormValues) => {
      const supabase = createClient()
      if (!tenant) throw new Error('No tenant found')
      const { error } = await supabase.from('users').insert({
        tenant_id: tenant.id,
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        role_id: values.role_id,
        status: 'invited',
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('User invited successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      setInviteOpen(false)
      inviteForm.reset()
    },
    onError: (error) => {
      toast.error('Failed to invite user.', { description: error.message })
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ role_id: roleId })
        .eq('id', userId)
      if (error) throw error
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
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ is_active: false, status: 'deactivated' })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('User deactivated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    },
    onError: (error) => {
      toast.error('Failed to deactivate user.', { description: error.message })
    },
  })

  function onInviteSubmit(values: InviteUserFormValues) {
    inviteUser.mutate(values)
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

                <FormField
                  control={inviteForm.control}
                  name="role_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles?.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                        <DropdownMenuItem onClick={() => handleEditRole(user)}>
                          <Shield className="mr-2 h-4 w-4" />
                          Edit Role
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
