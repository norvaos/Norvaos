'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useContact, useUpdateContact, useDeleteContact } from '@/lib/queries/contacts'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import { MATTER_STATUSES, MATTER_CONTACT_ROLES } from '@/lib/utils/constants'
import {
  formatDate,
  formatPhoneNumber,
  formatFullName,
  formatInitials,
} from '@/lib/utils/formatters'
import { ContactForm } from '@/components/contacts/contact-form'
import type { ContactFormValues } from '@/lib/schemas/contact'
import { DocumentUpload } from '@/components/shared/document-upload'
import { useContactIntakeSubmissions } from '@/lib/queries/intake-forms'
import { TagManager } from '@/components/shared/tag-manager'
import { NotesEditor } from '@/components/shared/notes-editor'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { useCreateAuditLog } from '@/lib/queries/audit-logs'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Building2,
  User,
  Briefcase,
  FileText,
  MessageSquare,
  Loader2,
  Clock,
  Paperclip,
  ClipboardList,
  Plus,
  Search,
  Link,
} from 'lucide-react'
import { toast } from 'sonner'
import { MatterCreateSheet } from '@/components/matters/matter-create-sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

type MatterContact = Database['public']['Tables']['matter_contacts']['Row']
type Matter = Database['public']['Tables']['matters']['Row']

// -------------------------------------------------------------------
// Custom hooks for contact-related data
// -------------------------------------------------------------------

function useContactMatters(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-matters', contactId],
    queryFn: async () => {
      const supabase = createClient()

      // Get matter_contacts for this contact
      const { data: matterContacts, error: mcError } = await supabase
        .from('matter_contacts')
        .select('*')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)

      if (mcError) throw mcError
      if (!matterContacts || matterContacts.length === 0) return []

      // Fetch the corresponding matters
      const matterIds = matterContacts.map((mc: MatterContact) => mc.matter_id)
      const { data: matters, error: mError } = await supabase
        .from('matters')
        .select('*')
        .in('id', matterIds)
        .eq('tenant_id', tenantId)

      if (mError) throw mError

      // Combine matter data with role info
      const typedMatterContacts = matterContacts as MatterContact[]
      return (matters as Matter[]).map((matter) => {
        const mc = typedMatterContacts.find((mc) => mc.matter_id === matter.id)
        return {
          ...matter,
          role: mc?.role ?? 'client',
          is_primary: mc?.is_primary ?? false,
        }
      })
    },
    enabled: !!contactId && !!tenantId,
  })
}

// -------------------------------------------------------------------
// Main page component
// -------------------------------------------------------------------

export default function ContactDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contactId = params.id as string
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  const { data: contact, isLoading, isError } = useContact(contactId)
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()
  const createAuditLog = useCreateAuditLog()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Loading state
  if (isLoading) {
    return <ContactDetailSkeleton />
  }

  // Error state
  if (isError || !contact) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Contacts
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">
            Contact not found or failed to load.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push('/contacts')}
          >
            Return to Contacts
          </Button>
        </div>
      </div>
    )
  }

  const isOrganization = contact.contact_type === 'organization'
  const displayName = isOrganization
    ? contact.organization_name ?? 'Unnamed Organisation'
    : formatFullName(contact.first_name, contact.last_name) || 'Unnamed Contact'
  const initials = isOrganization
    ? (contact.organization_name?.slice(0, 2) ?? '??').toUpperCase()
    : formatInitials(contact.first_name, contact.last_name)

  function handleUpdate(values: ContactFormValues) {
    updateContact.mutate(
      {
        id: contactId,
        ...values,
        email_primary: values.email_primary || null,
        email_secondary: values.email_secondary || null,
        website: values.website || null,
        phone_primary: values.phone_primary || null,
        phone_secondary: values.phone_secondary || null,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        middle_name: values.middle_name || null,
        preferred_name: values.preferred_name || null,
        date_of_birth: values.date_of_birth || null,
        organization_name: values.organization_name || null,
        organization_id: values.organization_id || null,
        job_title: values.job_title || null,
        address_line1: values.address_line1 || null,
        address_line2: values.address_line2 || null,
        city: values.city || null,
        province_state: values.province_state || null,
        postal_code: values.postal_code || null,
        source: values.source || null,
        source_detail: values.source_detail || null,
        notes: values.notes || null,
        phone_type_secondary: values.phone_type_secondary || null,
      },
      {
        onSuccess: () => {
          setEditOpen(false)
          createAuditLog.mutate({
            tenant_id: tenantId,
            user_id: appUser?.id || null,
            entity_type: 'contact',
            entity_id: contactId,
            action: 'update',
            changes: values as any,
          })
        },
      }
    )
  }

  function handleArchive() {
    deleteContact.mutate(contactId, {
      onSuccess: () => {
        router.push('/contacts')
      },
    })
  }

  // Build default values for the edit form
  const editDefaults: Partial<ContactFormValues> = {
    contact_type: contact.contact_type as 'individual' | 'organization',
    first_name: contact.first_name ?? undefined,
    last_name: contact.last_name ?? undefined,
    middle_name: contact.middle_name ?? undefined,
    preferred_name: contact.preferred_name ?? undefined,
    date_of_birth: contact.date_of_birth ?? undefined,
    organization_name: contact.organization_name ?? undefined,
    organization_id: contact.organization_id ?? undefined,
    job_title: contact.job_title ?? undefined,
    email_primary: contact.email_primary ?? undefined,
    email_secondary: contact.email_secondary ?? undefined,
    phone_primary: contact.phone_primary ?? undefined,
    phone_secondary: contact.phone_secondary ?? undefined,
    phone_type_primary: contact.phone_type_primary ?? 'mobile',
    phone_type_secondary: contact.phone_type_secondary ?? undefined,
    website: contact.website ?? undefined,
    address_line1: contact.address_line1 ?? undefined,
    address_line2: contact.address_line2 ?? undefined,
    city: contact.city ?? undefined,
    province_state: contact.province_state ?? undefined,
    postal_code: contact.postal_code ?? undefined,
    country: contact.country ?? 'Canada',
    source: contact.source ?? undefined,
    source_detail: contact.source_detail ?? undefined,
    email_opt_in: contact.email_opt_in,
    sms_opt_in: contact.sms_opt_in,
    notes: contact.notes ?? undefined,
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/contacts')}
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to Contacts
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarFallback className="text-base font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">
                {displayName}
              </h1>
              <Badge variant="secondary" className="gap-1 capitalize">
                {isOrganization ? (
                  <Building2 className="size-3" />
                ) : (
                  <User className="size-3" />
                )}
                {isOrganization ? 'Organisation' : 'Individual'}
              </Badge>
            </div>
            {!isOrganization && contact.job_title && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {contact.job_title}
              </p>
            )}
            {contact.email_primary && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {contact.email_primary}
              </p>
            )}
            <div className="mt-2">
              <TagManager entityType="contact" entityId={contactId} tenantId={tenantId} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 size-4" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-4" />
                Edit Contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="mr-2 size-4" />
                Archive Contact
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matters">Matters</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="intake">Intake</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <OverviewTab contact={contact} tenantId={tenantId} contactId={contactId} />
        </TabsContent>

        {/* Matters Tab */}
        <TabsContent value="matters">
          <MattersTab contactId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <DocumentUpload entityType="contact" entityId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Intake Tab */}
        <TabsContent value="intake" className="space-y-4">
          <IntakeTab contactId={contactId} />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <ActivityTimeline tenantId={tenantId} contactId={contactId} entityType="contact" entityId={contactId} />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <NotesEditor tenantId={tenantId} contactId={contactId} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Edit Contact</SheetTitle>
            <SheetDescription>
              Update the details for {displayName}.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="px-6 py-4">
              <ContactForm
                mode="edit"
                defaultValues={editDefaults}
                onSubmit={handleUpdate}
                isLoading={updateContact.isPending}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {displayName}? This action will archive the contact and they will no longer appear in your contacts list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleArchive()
                setDeleteOpen(false)
              }}
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// -------------------------------------------------------------------
// Overview Tab
// -------------------------------------------------------------------

function OverviewTab({
  contact,
  tenantId,
  contactId,
}: {
  contact: Database['public']['Tables']['contacts']['Row']
  tenantId: string
  contactId: string
}) {
  const isOrganization = contact.contact_type === 'organization'

  const hasAddress =
    contact.address_line1 ||
    contact.city ||
    contact.province_state ||
    contact.postal_code

  const customFields =
    contact.custom_fields && typeof contact.custom_fields === 'object'
      ? (contact.custom_fields as Record<string, string>)
      : null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Personal / Organisation Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            {isOrganization ? (
              <Building2 className="size-4 text-muted-foreground" />
            ) : (
              <User className="size-4 text-muted-foreground" />
            )}
            {isOrganization ? 'Organisation Details' : 'Personal Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isOrganization ? (
            <>
              <InfoRow label="Organisation Name" value={contact.organization_name} />
              <InfoRow label="Website" value={contact.website} />
            </>
          ) : (
            <>
              <InfoRow
                label="Full Name"
                value={formatFullName(contact.first_name, contact.last_name)}
              />
              {contact.middle_name && (
                <InfoRow label="Middle Name" value={contact.middle_name} />
              )}
              {contact.preferred_name && (
                <InfoRow label="Preferred Name" value={contact.preferred_name} />
              )}
              {contact.date_of_birth && (
                <InfoRow
                  label="Date of Birth"
                  value={formatDate(contact.date_of_birth, 'dd MMMM yyyy')}
                />
              )}
              {contact.job_title && (
                <InfoRow label="Job Title" value={contact.job_title} />
              )}
            </>
          )}
          <Separator />
          <InfoRow label="Source" value={contact.source} />
          {contact.source_detail && (
            <InfoRow label="Source Detail" value={contact.source_detail} />
          )}
          <InfoRow
            label="Created"
            value={formatDate(contact.created_at, 'dd MMM yyyy')}
          />
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" />
            Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Primary Email</p>
              <p className="text-sm text-slate-900">
                {contact.email_primary ?? '-'}
              </p>
            </div>
          </div>
          {contact.email_secondary && (
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Secondary Email</p>
                <p className="text-sm text-slate-900">
                  {contact.email_secondary}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">
                Primary Phone ({contact.phone_type_primary})
              </p>
              <p className="text-sm text-slate-900">
                {contact.phone_primary
                  ? formatPhoneNumber(contact.phone_primary)
                  : '-'}
              </p>
            </div>
          </div>
          {contact.phone_secondary && (
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">
                  Secondary Phone
                  {contact.phone_type_secondary
                    ? ` (${contact.phone_type_secondary})`
                    : ''}
                </p>
                <p className="text-sm text-slate-900">
                  {formatPhoneNumber(contact.phone_secondary)}
                </p>
              </div>
            </div>
          )}
          {!isOrganization && contact.website && (
            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <p className="text-sm text-slate-900">{contact.website}</p>
              </div>
            </div>
          )}
          <Separator />
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Email opt-in:</span>
              <Badge variant={contact.email_opt_in ? 'default' : 'secondary'} className="text-[10px]">
                {contact.email_opt_in ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">SMS opt-in:</span>
              <Badge variant={contact.sms_opt_in ? 'default' : 'secondary'} className="text-[10px]">
                {contact.sms_opt_in ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAddress ? (
            <div className="space-y-1 text-sm">
              {contact.address_line1 && (
                <p className="text-slate-900">{contact.address_line1}</p>
              )}
              {contact.address_line2 && (
                <p className="text-slate-900">{contact.address_line2}</p>
              )}
              <p className="text-slate-900">
                {[contact.city, contact.province_state].filter(Boolean).join(', ')}
                {contact.postal_code ? ` ${contact.postal_code}` : ''}
              </p>
              <p className="text-slate-600">{contact.country}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No address on file.</p>
          )}
        </CardContent>
      </Card>

      {/* Custom Fields */}
      {customFields && Object.keys(customFields).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              Custom Fields
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(customFields).map(([key, value]) => (
              <InfoRow key={key} label={key} value={String(value)} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity — spans full width */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MiniTimeline
            tenantId={tenantId}
            entityType="contact"
            entityId={contactId}
            contactId={contactId}
            limit={6}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// -------------------------------------------------------------------
// Matters Tab
// -------------------------------------------------------------------

function useMatterSearch(tenantId: string, search: string) {
  return useQuery({
    queryKey: ['matter-search', tenantId, search],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('id, title, matter_number, status, date_opened')
        .eq('tenant_id', tenantId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(10)

      if (search) {
        query = query.ilike('title', `%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenantId && search.length > 0,
  })
}

function MattersTab({
  contactId,
  tenantId,
}: {
  contactId: string
  tenantId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: matters, isLoading } = useContactMatters(contactId, tenantId)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [matterSearch, setMatterSearch] = useState('')
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [linkRole, setLinkRole] = useState('client')
  const [linking, setLinking] = useState(false)

  const { data: searchResults } = useMatterSearch(tenantId, matterSearch)

  // Filter out already-linked matters
  const linkedMatterIds = new Set(matters?.map((m) => m.id) ?? [])
  const filteredResults = searchResults?.filter((m) => !linkedMatterIds.has(m.id)) ?? []

  async function handleLinkMatter() {
    if (!selectedMatterId) return
    setLinking(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('matter_contacts').insert({
        tenant_id: tenantId,
        matter_id: selectedMatterId,
        contact_id: contactId,
        role: linkRole,
        is_primary: false,
      })
      if (error) throw error
      toast.success('Contact linked to matter')
      queryClient.invalidateQueries({ queryKey: ['contact-matters', contactId] })
      setLinkDialogOpen(false)
      setMatterSearch('')
      setSelectedMatterId('')
      setLinkRole('client')
    } catch {
      toast.error('Failed to link matter')
    } finally {
      setLinking(false)
    }
  }

  function getStatusConfig(status: string) {
    const found = MATTER_STATUSES.find((s) => s.value === status)
    return found ?? { label: status, color: '#6b7280' }
  }

  function getRoleLabel(role: string) {
    const found = MATTER_CONTACT_ROLES.find((r) => r.value === role)
    return found?.label ?? role
  }

  const addButton = (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
        <Link className="mr-1.5 size-3.5" />
        Link Existing
      </Button>
      <Button size="sm" onClick={() => setCreateSheetOpen(true)}>
        <Plus className="mr-1.5 size-3.5" />
        New Matter
      </Button>
    </div>
  )

  return (
    <>
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
      ) : !matters || matters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">No linked matters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This contact is not linked to any matters yet.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {addButton}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">{addButton}</div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matters.map((matter) => {
                  const statusConfig = getStatusConfig(matter.status)
                  return (
                    <TableRow
                      key={matter.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => router.push(`/matters/${matter.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        <div>
                          {matter.title}
                          {matter.matter_number && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              #{matter.matter_number}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: `${statusConfig.color}15`,
                            color: statusConfig.color,
                            borderColor: `${statusConfig.color}30`,
                          }}
                          className="border"
                        >
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {getRoleLabel(matter.role)}
                        {matter.is_primary && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(matter.date_opened, 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Link Existing Matter Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link to Existing Matter</DialogTitle>
            <DialogDescription>
              Search for a matter and link this contact to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search matters by title..."
                value={matterSearch}
                onChange={(e) => { setMatterSearch(e.target.value); setSelectedMatterId('') }}
                className="pl-9"
              />
            </div>
            {matterSearch && (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border divide-y">
                {filteredResults.length > 0 ? (
                  filteredResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMatterId(m.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        selectedMatterId === m.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <Briefcase className="size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.title}</p>
                        <p className="text-xs text-slate-500">
                          {m.matter_number ? `#${m.matter_number} · ` : ''}
                          {m.status}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-slate-500">No matters found</p>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700">Role in Matter</label>
              <Select value={linkRole} onValueChange={setLinkRole}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkMatter} disabled={!selectedMatterId || linking}>
              {linking && <Loader2 className="mr-2 size-4 animate-spin" />}
              Link Matter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Matter Sheet */}
      <MatterCreateSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        defaultContactId={contactId}
      />
    </>
  )
}

// -------------------------------------------------------------------
// Intake Tab
// -------------------------------------------------------------------

interface IntakeField {
  id: string
  field_type: string
  label: string
  sort_order: number
  mapping?: string
  allow_other?: boolean
}

function IntakeTab({ contactId }: { contactId: string }) {
  const { data: submissions, isLoading } = useContactIntakeSubmissions(contactId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!submissions || submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-slate-900">
            No intake submissions
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This contact has not submitted any intake forms.
          </p>
        </CardContent>
      </Card>
    )
  }

  function formatFieldValue(field: IntakeField, val: unknown): string {
    if (val === null || val === undefined) return '—'
    if (Array.isArray(val)) {
      return val.map((v: string) => {
        if (typeof v === 'string' && v.startsWith('__other__:')) return `Other: ${v.replace('__other__:', '')}`
        return v
      }).join(', ')
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>
      if (obj.selected === '__other__' && obj.custom) return `Other: ${obj.custom}`
      return String(obj.selected ?? JSON.stringify(val))
    }
    return String(val)
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub) => {
        const formInfo = sub.intake_forms
        const fields = (Array.isArray(formInfo.fields) ? formInfo.fields : []) as unknown as IntakeField[]
        const data = (sub.data ?? {}) as Record<string, unknown>

        return (
          <Card key={sub.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="size-4 text-muted-foreground" />
                {formInfo.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Submitted on {formatDate(sub.created_at, 'dd MMM yyyy \'at\' HH:mm')}
              </p>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-lg border">
                {fields
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((field) => {
                    const val = data[field.id]
                    if (val === undefined) return null
                    const isFile = field.field_type === 'file'
                    return (
                      <div key={field.id} className="flex gap-3 px-3 py-2">
                        <span className="shrink-0 text-xs font-medium text-muted-foreground w-[160px] pt-0.5">
                          {field.label}
                        </span>
                        <span className="text-sm text-slate-800 break-words min-w-0">
                          {isFile && typeof val === 'string' && val.startsWith('http') ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <Paperclip className="size-3" />
                              Download
                            </a>
                          ) : (
                            formatFieldValue(field, val)
                          )}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// -------------------------------------------------------------------
// Helper components
// -------------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-900">{value || '-'}</p>
    </div>
  )
}

// -------------------------------------------------------------------
// Skeleton
// -------------------------------------------------------------------

function ContactDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  )
}
