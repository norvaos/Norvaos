'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { formatFullName } from '@/lib/utils/formatters'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Plus,
  User,
  Building2,
  X,
  ChevronDown,
} from 'lucide-react'
import { ContactForm } from '@/components/contacts/contact-form'
import { useCreateContact } from '@/lib/queries/contacts'
import type { ContactFormValues } from '@/lib/schemas/contact'
import { toast } from 'sonner'

type Contact = Database['public']['Tables']['contacts']['Row']

function useContactSearch(tenantId: string, search: string) {
  return useQuery({
    queryKey: ['contact-search', tenantId, search],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('last_name')
        .limit(8)

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email_primary.ilike.%${search}%,organization_name.ilike.%${search}%,phone_primary.ilike.%${search}%`
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data as Contact[]
    },
    enabled: !!tenantId,
  })
}

export function useContactById(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-by-id', contactId],
    queryFn: async () => {
      if (!contactId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!contactId,
  })
}

interface ContactSearchProps {
  value?: string
  onChange: (contactId: string) => void
  tenantId: string
  placeholder?: string
}

export function ContactSearch({ value, onChange, tenantId, placeholder = 'Search contacts...' }: ContactSearchProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const { data: contacts, isLoading: searchLoading } = useContactSearch(tenantId, search)
  const { data: selectedContact } = useContactById(value)
  const createContact = useCreateContact()

  const handleSelect = useCallback((contactId: string) => {
    onChange(contactId)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange('')
    setSearch('')
  }, [onChange])

  const handleCreateContact = async (values: ContactFormValues) => {
    try {
      const result = await createContact.mutateAsync({
        ...values,
        tenant_id: tenantId,
      })
      onChange(result.id)
      setShowCreateDialog(false)
      setSearch('')
      toast.success('Contact created and linked')
    } catch {
      // Error handled by mutation
    }
  }

  const displayName = selectedContact
    ? formatFullName(selectedContact.first_name, selectedContact.last_name) || selectedContact.organization_name || selectedContact.email_primary
    : ''

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value && displayName ? (
              <span className="truncate">{displayName}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <div className="flex items-center gap-1">
              {value && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleClear() }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleClear() } }}
                  className="rounded-full p-0.5 hover:bg-slate-200 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[300px] max-w-[400px] p-0"
          align="start"
          side="bottom"
          collisionPadding={16}
          avoidCollisions
        >
          <div className="p-2 border-b">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 shadow-none h-8 focus-visible:ring-0"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[180px] overflow-y-auto">
            {searchLoading ? (
              <div className="p-2 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : contacts && contacts.length > 0 ? (
              <div className="p-1">
                {contacts.map((contact) => {
                  const name = formatFullName(contact.first_name, contact.last_name) || contact.organization_name || 'Unnamed'
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleSelect(contact.id)}
                      className={`flex items-center gap-3 w-full px-2 py-1.5 text-left rounded-md hover:bg-slate-100 ${
                        value === contact.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center">
                        {contact.contact_type === 'organization' ? (
                          <Building2 className="h-3.5 w-3.5 text-slate-500" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {contact.email_primary || contact.phone_primary || contact.organization_name || ''}
                        </p>
                      </div>
                      {contact.contact_type === 'organization' && (
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">Org</Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-sm text-slate-500">
                {search ? 'No contacts found' : 'Type to search contacts'}
              </div>
            )}
          </div>

          <Separator />
          <div className="p-1">
            <button
              onClick={() => { setShowCreateDialog(true); setOpen(false) }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-blue-600 rounded-md hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Create New Contact
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Create contact dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to link to this matter.
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            mode="create"
            onSubmit={handleCreateContact}
            isLoading={createContact.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
