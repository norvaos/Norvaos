'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Lock,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { roleSchema, type RoleFormValues } from '@/lib/schemas/settings'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { EmptyState } from '@/components/shared/empty-state'

interface RoleRow {
  id: string
  name: string
  description: string | null
  permissions: Record<string, Record<string, boolean>>
  is_system: boolean
  tenant_id: string
  user_count?: number
}

const DEFAULT_ROLE_NAMES = ['Admin', 'Lawyer', 'Paralegal', 'Clerk']

const PERMISSION_MODULES = [
  {
    key: 'contacts',
    label: 'Contacts',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'matters',
    label: 'Matters',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'leads',
    label: 'Leads',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'billing',
    label: 'Billing',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'reports',
    label: 'Reports',
    actions: ['view', 'export'],
  },
  {
    key: 'settings',
    label: 'Settings',
    actions: ['view', 'edit'],
  },
]

function buildDefaultPermissions(): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {}
  for (const mod of PERMISSION_MODULES) {
    perms[mod.key] = {}
    for (const action of mod.actions) {
      perms[mod.key][action] = false
    }
  }
  return perms
}

function countEnabledPermissions(permissions: Record<string, Record<string, boolean>>): number {
  let count = 0
  for (const mod of Object.values(permissions)) {
    for (const enabled of Object.values(mod)) {
      if (enabled) count++
    }
  }
  return count
}

function totalPermissionsCount(): number {
  let count = 0
  for (const mod of PERMISSION_MODULES) {
    count += mod.actions.length
  }
  return count
}

export default function SettingsRolesPage() {
  const supabase = createClient()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: ['settings', 'roles', tenant?.id],
    queryFn: async () => {
      if (!tenant) return []
      const { data: rolesData, error } = await supabase
        .from('roles')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name')
      if (error) throw error

      // Get user counts for each role
      const rolesWithCounts: RoleRow[] = []
      for (const role of rolesData ?? []) {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('role_id', role.id)
        rolesWithCounts.push({
          ...role,
          permissions: (role.permissions ?? {}) as Record<string, Record<string, boolean>>,
          is_system: role.is_system || DEFAULT_ROLE_NAMES.includes(role.name),
          user_count: count ?? 0,
        })
      }
      return rolesWithCounts
    },
    enabled: !!tenant,
  })

  const form = useForm<RoleFormValues>({
    resolver: standardSchemaResolver(roleSchema),
    defaultValues: {
      name: '',
      description: '',
      permissions: buildDefaultPermissions(),
    },
  })

  const createRole = useMutation({
    mutationFn: async (values: RoleFormValues) => {
      if (!tenant) throw new Error('No tenant found')
      const { error } = await supabase.from('roles').insert({
        tenant_id: tenant.id,
        name: values.name,
        description: values.description || null,
        permissions: values.permissions,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Role created successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      setCreateOpen(false)
      form.reset({ name: '', description: '', permissions: buildDefaultPermissions() })
    },
    onError: (error) => {
      toast.error('Failed to create role.', { description: error.message })
    },
  })

  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', roleId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Role deleted successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      setDeleteConfirmId(null)
    },
    onError: (error) => {
      toast.error('Failed to delete role.', { description: error.message })
    },
  })

  function onCreateSubmit(values: RoleFormValues) {
    createRole.mutate(values)
  }

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
            <p className="text-muted-foreground">Manage user roles and permissions.</p>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
          <p className="text-muted-foreground">
            Manage user roles and their associated permissions.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Role</DialogTitle>
              <DialogDescription>
                Define a new role with specific permissions for your firm.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Senior Lawyer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Briefly describe this role's responsibilities"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <h4 className="mb-3 text-sm font-medium">Permissions</h4>
                  <div className="space-y-4">
                    {PERMISSION_MODULES.map((mod) => (
                      <div key={mod.key} className="rounded-md border p-4">
                        <p className="mb-2 text-sm font-medium">{mod.label}</p>
                        <div className="flex flex-wrap gap-4">
                          {mod.actions.map((action) => (
                            <FormField
                              key={`${mod.key}.${action}`}
                              control={form.control}
                              name={`permissions.${mod.key}.${action}`}
                              render={({ field }) => (
                                <FormItem className="flex items-center gap-2">
                                  <FormControl>
                                    <Switch
                                      checked={field.value as boolean}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="!mt-0 text-sm capitalize">
                                    {action}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRole.isPending}>
                    {createRole.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Role
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!roles || roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No roles configured"
          description="Create roles to define permissions for your team members."
          actionLabel="Create Role"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const enabledCount = countEnabledPermissions(role.permissions)
            const total = totalPermissionsCount()
            const isDefault = role.is_system || DEFAULT_ROLE_NAMES.includes(role.name)

            return (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">{role.name}</CardTitle>
                    </div>
                    {isDefault && (
                      <Badge variant="secondary">
                        <Lock className="mr-1 h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    {role.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {role.user_count} {role.user_count === 1 ? 'user' : 'users'}
                    </div>
                    <Separator />
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Permissions ({enabledCount}/{total})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {PERMISSION_MODULES.map((mod) => {
                          const modPerms = role.permissions[mod.key]
                          const hasAny = modPerms && Object.values(modPerms).some(Boolean)
                          if (!hasAny) return null
                          const enabledActions = mod.actions.filter(
                            (a) => modPerms?.[a]
                          )
                          return (
                            <Badge key={mod.key} variant="outline" className="text-xs">
                              {mod.label} ({enabledActions.length})
                            </Badge>
                          )
                        })}
                        {enabledCount === 0 && (
                          <span className="text-xs text-muted-foreground">
                            No permissions set
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                {!isDefault && (
                  <CardFooter className="justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(role.id)}
                      disabled={deleteRole.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this role? Users assigned to this role will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteRole.mutate(deleteConfirmId)}
              disabled={deleteRole.isPending}
            >
              {deleteRole.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
