'use client'

import { useState } from 'react'
import {
  useContactAssignments,
  useAddContactAssignment,
  useRemoveContactAssignment,
  useSetPrimaryAssignment,
  ASSIGNMENT_ROLES,
  getAssignmentRoleLabel,
  type ContactAssignmentWithUser,
} from '@/lib/queries/contact-assignments'
import { useTeamMembers } from '@/lib/queries/reports'
import { formatFullName, formatInitials } from '@/lib/utils/formatters'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Star,
  Plus,
  MoreHorizontal,
  UserPlus,
  Trash2,
  Crown,
  Users,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface ContactTeamManagerProps {
  contactId: string
  tenantId: string
  currentUserId?: string
}

export function ContactTeamManager({
  contactId,
  tenantId,
  currentUserId,
}: ContactTeamManagerProps) {
  const { data: assignments, isLoading } = useContactAssignments(contactId)
  const { data: teamMembers } = useTeamMembers(tenantId)
  const addAssignment = useAddContactAssignment()
  const removeAssignment = useRemoveContactAssignment()
  const setPrimary = useSetPrimaryAssignment()

  const [addOpen, setAddOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('responsible')
  const [isPrimary, setIsPrimary] = useState(false)

  const primaryAssignment = assignments?.find((a) => a.is_primary)
  const otherAssignments = assignments?.filter((a) => !a.is_primary) ?? []

  // Users already assigned (to filter from add dropdown)
  const assignedUserRoles = new Set(
    (assignments ?? []).map((a) => `${a.user_id}:${a.role}`)
  )

  function handleAdd() {
    if (!selectedUserId || !selectedRole) {
      toast.error('Please select a team member and role')
      return
    }

    addAssignment.mutate(
      {
        tenantId,
        contactId,
        userId: selectedUserId,
        role: selectedRole,
        isPrimary,
        assignedBy: currentUserId,
      },
      {
        onSuccess: () => {
          setAddOpen(false)
          setSelectedUserId('')
          setSelectedRole('responsible')
          setIsPrimary(false)
        },
      }
    )
  }

  function handleRemove(assignmentId: string) {
    removeAssignment.mutate({ assignmentId, contactId })
  }

  function handleSetPrimary(assignmentId: string, userId: string) {
    setPrimary.mutate({ assignmentId, contactId, userId })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Assigned Team
          </div>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <UserPlus className="size-3.5" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-700">Add Team Member</p>

                {/* User select */}
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers?.map((m) => {
                      const alreadyAssigned = assignedUserRoles.has(`${m.id}:${selectedRole}`)
                      return (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          disabled={alreadyAssigned}
                        >
                          {m.full_name}
                          {alreadyAssigned && ' (assigned)'}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                {/* Role select */}
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Set as primary toggle */}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Set as primary handler
                </label>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={handleAdd}
                    disabled={addAssignment.isPending || !selectedUserId}
                  >
                    {addAssignment.isPending && (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    )}
                    Assign
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : !assignments || assignments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">
            No team members assigned yet
          </p>
        ) : (
          <>
            {/* Primary Handler */}
            {primaryAssignment && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Primary Handler
                </p>
                <AssignmentRow
                  assignment={primaryAssignment}
                  isPrimary
                  onRemove={handleRemove}
                  onSetPrimary={handleSetPrimary}
                />
              </div>
            )}

            {/* Other Team Members */}
            {otherAssignments.length > 0 && (
              <div>
                {primaryAssignment && <Separator className="my-2" />}
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Supporting Team
                </p>
                <div className="space-y-1">
                  {otherAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      isPrimary={false}
                      onRemove={handleRemove}
                      onSetPrimary={handleSetPrimary}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Individual Assignment Row ────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  isPrimary,
  onRemove,
  onSetPrimary,
}: {
  assignment: ContactAssignmentWithUser
  isPrimary: boolean
  onRemove: (id: string) => void
  onSetPrimary: (id: string, userId: string) => void
}) {
  const fullName =
    formatFullName(assignment.user_first_name, assignment.user_last_name) ||
    assignment.user_email ||
    'Unknown'
  const initials = formatInitials(
    assignment.user_first_name,
    assignment.user_last_name
  )

  return (
    <div className="flex items-center gap-2 group rounded-md p-1.5 -mx-1.5 hover:bg-slate-50 transition-colors">
      <Avatar size="sm">
        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-slate-900 truncate">{fullName}</p>
          {isPrimary && (
            <Crown className="size-3 text-amber-500 shrink-0" />
          )}
        </div>
        <Badge
          variant="secondary"
          className="text-[9px] px-1 py-0 h-4 mt-0.5"
        >
          {getAssignmentRoleLabel(assignment.role)}
        </Badge>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {!isPrimary && (
            <>
              <DropdownMenuItem
                onClick={() => onSetPrimary(assignment.id, assignment.user_id)}
              >
                <Star className="mr-2 size-3.5" />
                Set as Primary
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onRemove(assignment.id)}
          >
            <Trash2 className="mr-2 size-3.5" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
