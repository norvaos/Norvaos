'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ContactSearch } from '@/components/shared/contact-search'
import { Plus, Trash2, Users, Loader2, Star } from 'lucide-react'
import { MATTER_CONTACT_ROLES } from '@/lib/utils/constants'
import { formatFullName, formatPhoneNumber } from '@/lib/utils/formatters'
import { getRoleLabel } from './matter-tab-helpers'
import type { MatterContact, Contact } from './matter-tab-helpers'

// ── Local hook: useMatterContacts ─────────────────────────────────────────────

function useMatterContacts(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-contacts', matterId],
    queryFn: async () => {
      const supabase = createClient()

      // Get matter_contacts for this matter
      const { data: matterContacts, error: mcError } = await supabase
        .from('matter_contacts')
        .select('*')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)

      if (mcError) throw mcError
      if (!matterContacts || matterContacts.length === 0) return []

      // Fetch the corresponding contacts
      const contactIds = matterContacts.map((mc: MatterContact) => mc.contact_id)
      const { data: contacts, error: cError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', contactIds)
        .eq('tenant_id', tenantId)

      if (cError) throw cError

      // Combine contact data with role info
      const typedMatterContacts = matterContacts as MatterContact[]
      return (contacts as Contact[]).map((contact) => {
        const mc = typedMatterContacts.find((mc) => mc.contact_id === contact.id)
        return {
          ...contact,
          role: mc?.role ?? 'client',
          is_primary: mc?.is_primary ?? false,
        }
      })
    },
    enabled: !!matterId && !!tenantId,
  })
}

// ── ContactsTab component ─────────────────────────────────────────────────────

export function ContactsTab({
  matterId,
  tenantId,
}: {
  matterId: string
  tenantId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: contacts, isLoading } = useMatterContacts(matterId, tenantId)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [selectedRole, setSelectedRole] = useState('client')
  const [isPrimary, setIsPrimary] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  async function handleAddContact() {
    if (!selectedContactId) return
    setIsLinking(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('matter_contacts').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: selectedContactId,
        role: selectedRole,
        is_primary: isPrimary,
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      setAddDialogOpen(false)
      setSelectedContactId('')
      setSelectedRole('client')
      setIsPrimary(false)
      toast.success('Contact added to matter')
    } catch {
      toast.error('Failed to add contact')
    } finally {
      setIsLinking(false)
    }
  }

  async function handleRemoveContact(contactId: string) {
    // Prevent removing the last contact
    if ((contacts?.length ?? 0) <= 1) {
      toast.error('Cannot remove the last contact from a matter. At least one contact is required.')
      return
    }
    // Prevent removing the primary contact without reassigning
    const isPrimaryContact = contacts?.some((c) => c.id === contactId && c.is_primary)
    if (isPrimaryContact) {
      toast.error('Cannot remove the primary contact. Assign a new primary contact first.')
      return
    }
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_contacts')
        .delete()
        .eq('matter_id', matterId)
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      toast.success('Contact removed from matter')
    } catch {
      toast.error('Failed to remove contact')
    }
  }

  async function handleSetPrimary(contactId: string) {
    try {
      const supabase = createClient()
      // Clear current primary
      await supabase
        .from('matter_contacts')
        .update({ is_primary: false })
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
      // Set new primary
      const { error } = await supabase
        .from('matter_contacts')
        .update({ is_primary: true })
        .eq('matter_id', matterId)
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      queryClient.invalidateQueries({ queryKey: ['matter-primary-contact', matterId] })
      toast.success('Primary contact updated')
    } catch {
      toast.error('Failed to update primary contact')
    }
  }

  // IDs of contacts already linked
  const linkedContactIds = contacts?.map((c) => c.id) ?? []

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '' : `${contacts?.length ?? 0} contacts`}
        </p>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Add Contact
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !contacts || contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">
              No linked contacts
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This matter does not have any linked contacts yet.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="mr-1.5 size-4" />
              Add First Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => {
                const displayName =
                  contact.contact_type === 'organization'
                    ? contact.organization_name ?? 'Unnamed Organisation'
                    : formatFullName(contact.first_name, contact.last_name) || 'Unnamed Contact'
                return (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {displayName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          {getRoleLabel(contact.role)}
                        </span>
                        {contact.is_primary && (
                          <Badge variant="outline" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.email_primary ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.phone_primary
                        ? formatPhoneNumber(contact.phone_primary)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!contact.is_primary && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetPrimary(contact.id)
                            }}
                            title="Set as primary contact"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveContact(contact.id)
                          }}
                          title="Remove contact from matter"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact to Matter</DialogTitle>
            <DialogDescription>
              Search for an existing contact or create a new one to link to this matter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Contact *
              </label>
              <ContactSearch
                value={selectedContactId}
                onChange={setSelectedContactId}
                tenantId={tenantId}
                placeholder="Search contacts..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Role *
              </label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {MATTER_CONTACT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-primary"
                checked={isPrimary}
                onCheckedChange={(checked) => setIsPrimary(!!checked)}
              />
              <label htmlFor="is-primary" className="text-sm text-slate-600">
                Primary contact
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddContact}
              disabled={!selectedContactId || isLinking}
            >
              {isLinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
