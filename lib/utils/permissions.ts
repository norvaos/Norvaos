interface Permissions {
  [entity: string]: {
    [action: string]: boolean
  }
}

interface UserRole {
  permissions: Permissions
  is_system: boolean
  name: string
}

export function hasPermission(
  role: UserRole | null | undefined,
  entity: string,
  action: string
): boolean {
  if (!role) return false
  if (role.name === 'Admin') return true
  return role.permissions?.[entity]?.[action] === true
}

export function canView(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'view')
}

export function canCreate(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'create')
}

export function canEdit(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'edit')
}

export function canDelete(role: UserRole | null | undefined, entity: string): boolean {
  return hasPermission(role, entity, 'delete')
}

export const ENTITIES = [
  'contacts',
  'matters',
  'leads',
  'tasks',
  'documents',
  'communications',
  'billing',
  'reports',
  'settings',
  'users',
  'roles',
] as const

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const

export type Entity = (typeof ENTITIES)[number]
export type Action = (typeof ACTIONS)[number]
