'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useContact, useUpdateContact, useDeleteContact, useContactDependencies } from '@/lib/queries/contacts'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import { MATTER_STATUSES, MATTER_CONTACT_ROLES } from '@/lib/utils/constants'
import {
  formatDate,
  formatDateTime,
  formatPhoneNumber,
  formatFullName,
  formatInitials,
} from '@/lib/utils/formatters'
import { ContactForm } from '@/components/contacts/contact-form'
import type { ContactFormValues } from '@/lib/schemas/contact'
import { DocumentUpload } from '@/components/shared/document-upload'
import { useTasks } from '@/lib/queries/tasks'
import { TaskCreateDialog } from '@/components/tasks/task-create-dialog'
import { useContactIntakeSubmissions } from '@/lib/queries/intake-forms'
import { useContactCheckIns } from '@/lib/queries/check-ins'
import type { KioskQuestion } from '@/lib/types/kiosk-question'
import { TagManager } from '@/components/shared/tag-manager'
import { NotesEditor } from '@/components/shared/notes-editor'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { useCreateAuditLog } from '@/lib/queries/audit-logs'
import { ContactBookingsTab } from '@/components/contacts/contact-bookings-tab'
import { useAppointments } from '@/lib/queries/booking'
import { ConflictReviewPanel, ConflictStatusBadge } from '@/components/contacts/conflict-review-panel'
import { ContactTeamManager } from '@/components/contacts/contact-team-manager'
import { useContactAssignments, getAssignmentRoleLabel } from '@/lib/queries/contact-assignments'
import { PipelineProgress, PipelineStageBadge } from '@/components/contacts/pipeline-progress'
import { InteractionsPanel } from '@/components/shared/interactions-panel'
import { hasPermission } from '@/lib/utils/permissions'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { ScreeningAnswersPanel } from '@/components/shared/screening-answers-panel'

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  AlertCircle,
  ArrowLeft,
  LayoutDashboard,
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
  CheckCircle2,
  FileStack,
  UserCircle,
  CalendarDays,
  ShieldCheck,
  Crown,
  Plane,
  Users2,
  Save,
  ChevronDown,
  ChevronUp,
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

function useContactStats(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-stats', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const [mattersRes, leadsRes, tasksRes, docsRes] = await Promise.all([
        supabase.from('matter_contacts').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
      ])
      return {
        matterCount: mattersRes.count ?? 0,
        leadCount: leadsRes.count ?? 0,
        taskCount: tasksRes.count ?? 0,
        documentCount: docsRes.count ?? 0,
      }
    },
    enabled: !!contactId && !!tenantId,
  })
}

function useContactActiveLead(contactId: string) {
  return useQuery({
    queryKey: ['contact-active-lead', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .select('id, status')
        .eq('contact_id', contactId)
        .in('status', ['open', 'new', 'contacted', 'qualified', 'pitched'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!contactId,
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
  const [activeTab, setActiveTab] = useState('overview')
  const { data: deps } = useContactDependencies(contactId)
  const { data: stats } = useContactStats(contactId, tenantId)
  const { data: activeLead } = useContactActiveLead(contactId)
  const { data: teamAssignments } = useContactAssignments(contactId)
  const { role: userRole } = useUserRole()

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
    email_opt_in: contact.email_opt_in ?? undefined,
    sms_opt_in: contact.sms_opt_in ?? undefined,
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
            <div className="flex items-center gap-2 flex-wrap">
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
              {(stats?.matterCount ?? 0) > 0 && (
                <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                  <Briefcase className="size-3" />
                  Client
                </Badge>
              )}
              {(stats?.leadCount ?? 0) > 0 && (stats?.matterCount ?? 0) === 0 && (
                <Badge className="gap-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                  <UserCircle className="size-3" />
                  Lead
                </Badge>
              )}
              {/* Assigned team avatars (tooltip on hover for name + role) */}
              {teamAssignments && teamAssignments.length > 0 && (
                <TooltipProvider delayDuration={150}>
                  <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
                    {teamAssignments.map((a) => {
                      const name = formatFullName(a.user_first_name, a.user_last_name) || a.user_email || 'Unknown'
                      const inits = formatInitials(a.user_first_name, a.user_last_name)
                      return (
                        <Tooltip key={a.id}>
                          <TooltipTrigger asChild>
                            <div className="relative cursor-default">
                              <Avatar size="sm" className={`size-6 ${a.is_primary ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                                <AvatarFallback className="text-[10px]">{inits}</AvatarFallback>
                              </Avatar>
                              {a.is_primary && (
                                <Crown className="absolute -top-1 -right-1 size-2.5 text-amber-500 fill-amber-500" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            <p className="font-medium">{name}</p>
                            <p className="text-muted-foreground">{getAssignmentRoleLabel(a.role)}</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                </TooltipProvider>
              )}
            </div>
            {!isOrganization && contact.job_title && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {contact.job_title}
                {contact.organization_name && ` at ${contact.organization_name}`}
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {contact.email_primary && (
                <a
                  href={`mailto:${contact.email_primary}`}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Mail className="size-3.5" />
                  {contact.email_primary}
                </a>
              )}
              {contact.phone_primary && (
                <a
                  href={`tel:${contact.phone_primary}`}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Phone className="size-3.5" />
                  {formatPhoneNumber(contact.phone_primary)}
                </a>
              )}
            </div>
            <div className="mt-2">
              <TagManager entityType="contact" entityId={contactId} tenantId={tenantId} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeLead && (
            <Button
              size="sm"
              onClick={() => router.push(`/command/lead/${activeLead.id}`)}
            >
              <LayoutDashboard className="mr-1.5 size-4" />
              Command Centre
            </Button>
          )}
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matters">Matters</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="family">Family</TabsTrigger>
          <TabsTrigger value="conflict-review">Conflict Review</TabsTrigger>
          <TabsTrigger value="intake">Intake</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="interactions">Interactions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <OverviewTab contact={contact} tenantId={tenantId} contactId={contactId} stats={stats} onTabChange={setActiveTab} />
        </TabsContent>

        {/* Matters Tab */}
        <TabsContent value="matters">
          <MattersTab contactId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <ContactTasksTab contactId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <DocumentUpload entityType="contact" entityId={contactId} tenantId={tenantId} entityName={displayName} />
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications" className="space-y-4">
          <CommunicationsTab contactId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Family Members Tab */}
        <TabsContent value="family" className="space-y-4">
          <FamilyTab contactId={contactId} tenantId={tenantId} />
        </TabsContent>

        {/* Conflict Review Tab */}
        <TabsContent value="conflict-review" className="space-y-4">
          <ContactTeamManager contactId={contactId} tenantId={tenantId} />
          <ConflictReviewPanel
            contactId={contactId}
            conflictScore={contact.conflict_score ?? 0}
            conflictStatus={contact.conflict_status ?? 'not_run'}
            canApprove={hasPermission(userRole, 'conflicts', 'approve')}
          />
        </TabsContent>

        {/* Intake Tab */}
        <TabsContent value="intake" className="space-y-4">
          <IntakeTab contactId={contactId} tenantId={tenantId} tenantSettings={tenant?.settings as Record<string, unknown> | undefined} />
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-4">
          <ContactBookingsTab contactId={contactId} contactName={displayName} tenantId={tenantId} />
        </TabsContent>

        {/* Interactions Tab */}
        <TabsContent value="interactions" className="space-y-4">
          <InteractionsPanel
            contactId={contactId}
            contactName={displayName}
            tenantId={tenantId}
            userId={appUser?.id}
          />
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
            <DialogTitle>Archive Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive {displayName}? They will no longer appear in your contacts list.
            </DialogDescription>
          </DialogHeader>
          {deps?.hasLinkedRecords && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">This contact has linked records:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                {deps.matterCount > 0 && (
                  <li>{deps.matterCount} matter{deps.matterCount > 1 ? 's' : ''}</li>
                )}
                {deps.leadCount > 0 && (
                  <li>{deps.leadCount} active lead{deps.leadCount > 1 ? 's' : ''}</li>
                )}
                {deps.taskCount > 0 && (
                  <li>{deps.taskCount} open task{deps.taskCount > 1 ? 's' : ''}</li>
                )}
              </ul>
              <p className="mt-1.5 text-xs">Archiving will not delete these records, but the contact will be hidden from lists.</p>
            </div>
          )}
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
              Archive Contact
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

/** Fetch individual contacts linked to an organization via organization_id */
function useOrganizationContacts(orgContactId: string, tenantId: string, isOrg: boolean) {
  return useQuery({
    queryKey: ['org-contacts', orgContactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, job_title, email_primary, phone_primary')
        .eq('tenant_id', tenantId)
        .eq('organization_id', orgContactId)
        .eq('is_archived', false)
        .order('first_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!orgContactId && !!tenantId && isOrg,
  })
}

function OverviewTab({
  contact,
  tenantId,
  contactId,
  stats,
  onTabChange,
}: {
  contact: Database['public']['Tables']['contacts']['Row']
  tenantId: string
  contactId: string
  stats?: { matterCount: number; leadCount: number; taskCount: number; documentCount: number }
  onTabChange: (tab: string) => void
}) {
  const router = useRouter()
  const isOrganization = contact.contact_type === 'organization'
  const { data: orgContacts } = useOrganizationContacts(contactId, tenantId, isOrganization)
  const { data: appointments } = useAppointments(tenantId, { contactId, upcoming: true })
  const updateContact = useUpdateContact()

  // Pipeline stage change handler
  const handlePipelineStageChange = (newStage: string) => {
    updateContact.mutate({
      id: contactId,
      pipeline_stage: newStage,
      milestone: newStage,
      milestone_updated_at: new Date().toISOString(),
    })
  }

  const hasAddress =
    contact.address_line1 ||
    contact.city ||
    contact.province_state ||
    contact.postal_code

  const customFields =
    contact.custom_fields && typeof contact.custom_fields === 'object'
      ? (contact.custom_fields as Record<string, string>)
      : null

  const daysSinceLastContact = contact.last_contacted_at
    ? Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Left column: Details (spans 2 cols) */}
      <div className="md:col-span-2 space-y-4">
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
                {orgContacts && orgContacts.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Contact Persons</p>
                      <div className="space-y-2">
                        {orgContacts.map((person) => (
                          <div
                            key={person.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded-md p-1.5 -mx-1.5 transition-colors"
                            onClick={() => router.push(`/contacts/${person.id}`)}
                          >
                            <Avatar size="sm">
                              <AvatarFallback className="text-[10px]">
                                {formatInitials(person.first_name, person.last_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {formatFullName(person.first_name, person.last_name)}
                              </p>
                              {person.job_title && (
                                <p className="text-xs text-muted-foreground truncate">{person.job_title}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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
                    value={formatDate(contact.date_of_birth)}
                  />
                )}
                {contact.job_title && (
                  <InfoRow label="Job Title" value={contact.job_title} />
                )}
                {contact.organization_name && (
                  <InfoRow label="Organization" value={contact.organization_name} />
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
              value={formatDate(contact.created_at)}
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
                {contact.email_primary ? (
                  <a href={`mailto:${contact.email_primary}`} className="text-sm text-primary hover:underline">
                    {contact.email_primary}
                  </a>
                ) : (
                  <p className="text-sm text-slate-900">-</p>
                )}
              </div>
            </div>
            {contact.email_secondary && (
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Secondary Email</p>
                  <a href={`mailto:${contact.email_secondary}`} className="text-sm text-primary hover:underline">
                    {contact.email_secondary}
                  </a>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">
                  Primary Phone ({contact.phone_type_primary})
                </p>
                {contact.phone_primary ? (
                  <a href={`tel:${contact.phone_primary}`} className="text-sm text-primary hover:underline">
                    {formatPhoneNumber(contact.phone_primary)}
                  </a>
                ) : (
                  <p className="text-sm text-slate-900">-</p>
                )}
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
                  <a href={`tel:${contact.phone_secondary}`} className="text-sm text-primary hover:underline">
                    {formatPhoneNumber(contact.phone_secondary)}
                  </a>
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
            {/* Address */}
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                {hasAddress ? (
                  <div className="space-y-0.5 text-sm">
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
                    {contact.country && (
                      <p className="text-slate-600">{contact.country}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No address on file</p>
                )}
              </div>
            </div>
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

        {/* Recent Activity */}
        <Card>
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

      {/* Right column: Stats sidebar */}
      <div className="space-y-4">
        {/* Pipeline Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              Pipeline
              <PipelineStageBadge stage={contact.pipeline_stage ?? 'new_lead'} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineProgress
              currentStage={contact.pipeline_stage ?? 'new_lead'}
              compact
              onStageChange={handlePipelineStageChange}
              isUpdating={updateContact.isPending}
            />
          </CardContent>
        </Card>

        {/* Conflict Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              Conflict Check
              <ConflictStatusBadge status={contact.conflict_status ?? 'not_run'} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => onTabChange('conflict-review')}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4" />
                  Risk Score
                </div>
                <span className="text-sm font-semibold text-slate-900">{contact.conflict_score ?? 0}/100</span>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Quick Stats (clickable) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => onTabChange('matters')}
              className="flex w-full items-center justify-between hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Briefcase className="size-4" />
                Matters
              </div>
              <span className="text-sm font-semibold text-slate-900">{stats?.matterCount ?? 0}</span>
            </button>
            <button
              onClick={() => router.push('/leads')}
              className="flex w-full items-center justify-between hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCircle className="size-4" />
                Leads
              </div>
              <span className="text-sm font-semibold text-slate-900">{stats?.leadCount ?? 0}</span>
            </button>
            <button
              onClick={() => onTabChange('tasks')}
              className="flex w-full items-center justify-between hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4" />
                Tasks
              </div>
              <span className="text-sm font-semibold text-slate-900">{stats?.taskCount ?? 0}</span>
            </button>
            <button
              onClick={() => onTabChange('documents')}
              className="flex w-full items-center justify-between hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileStack className="size-4" />
                Documents
              </div>
              <span className="text-sm font-semibold text-slate-900">{stats?.documentCount ?? 0}</span>
            </button>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                Last Contacted
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {daysSinceLastContact !== null
                  ? daysSinceLastContact === 0
                    ? 'Today'
                    : `${daysSinceLastContact}d ago`
                  : 'Never'}
              </span>
            </div>
            <button
              onClick={() => onTabChange('interactions')}
              className="flex w-full items-center justify-between hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="size-4" />
                Interactions
              </div>
              <span className="text-sm font-semibold text-slate-900">{contact.interaction_count}</span>
            </button>
            {/* Upcoming Appointments (inside Quick Stats — clickable to Appointments tab) */}
            {appointments && appointments.length > 0 && (
              <>
                <Separator />
                <button
                  onClick={() => onTabChange('appointments')}
                  className="w-full text-left hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <CalendarDays className="size-4" />
                    Upcoming Appointments
                  </div>
                  <div className="space-y-2">
                    {appointments.slice(0, 3).map((appt) => {
                      const d = appt.appointment_date
                        ? new Date(appt.appointment_date + 'T00:00:00')
                        : null
                      const startTime = appt.start_time ?? ''
                      const [h = 0, m = 0] = startTime ? startTime.split(':').map(Number) : [0, 0]
                      const ampm = h >= 12 ? 'PM' : 'AM'
                      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
                      const timeStr = startTime
                        ? `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
                        : 'Time TBD'
                      const lawyerName = [appt.user_first_name, appt.user_last_name].filter(Boolean).join(' ')
                      return (
                        <div key={appt.id} className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded bg-primary/10 text-primary">
                            <span className="text-[9px] font-medium leading-none">
                              {d ? d.toLocaleDateString('en-US', { month: 'short' }) : '---'}
                            </span>
                            <span className="text-xs font-bold leading-none">{d ? d.getDate() : '-'}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-900">{timeStr}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {lawyerName && `${lawyerName} · `}{appt.duration_minutes} min
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0">
                            {appt.status === 'confirmed' ? 'Confirmed' : appt.status}
                          </Badge>
                        </div>
                      )
                    })}
                    {appointments.length > 3 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        +{appointments.length - 3} more
                      </p>
                    )}
                  </div>
                </button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Milestones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50">
                  <Plus className="size-3 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-700">First Created</p>
                  <p className="text-xs text-muted-foreground">{formatDate(contact.created_at)}</p>
                </div>
              </div>
              {contact.last_contacted_at && (
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                    <Phone className="size-3 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Last Contacted</p>
                    <p className="text-xs text-muted-foreground">{formatDate(contact.last_contacted_at)}</p>
                  </div>
                </div>
              )}
              {contact.has_portal_access && contact.portal_last_login && (
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-50">
                    <Globe className="size-3 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Last Portal Login</p>
                    <p className="text-xs text-muted-foreground">{formatDate(contact.portal_last_login)}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
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
                  const statusConfig = getStatusConfig(matter.status ?? '')
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
                        {formatDate(matter.date_opened)}
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
// Tasks Tab
// -------------------------------------------------------------------

function ContactTasksTab({
  contactId,
  tenantId,
}: {
  contactId: string
  tenantId: string
}) {
  const [showCompleted, setShowCompleted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useTasks({
    tenantId,
    contactId,
    showCompleted,
    pageSize: 50,
  })

  const tasks = data?.tasks ?? []

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50 border-red-200'
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default: return 'text-slate-600 bg-slate-50 border-slate-200'
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'done': return <CheckCircle2 className="size-4 text-emerald-500" />
      case 'working_on_it': return <Clock className="size-4 text-blue-500" />
      case 'stuck': return <AlertCircle className="size-4 text-red-500" />
      case 'cancelled': return <Archive className="size-4 text-slate-400" />
      default: return <div className="size-4 rounded-full border-2 border-slate-300" />
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-slate-300"
              />
              Show completed
            </label>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            New Task
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-6">
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-slate-900">No tasks</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {showCompleted ? 'No tasks found for this contact.' : 'No open tasks for this contact.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Task</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>{getStatusIcon(task.status ?? '')}</TableCell>
                    <TableCell>
                      <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-slate-900'}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${getPriorityColor(task.priority ?? '')}`}>
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {task.due_date ? formatDate(task.due_date) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {(task.status ?? '').replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        contactId={contactId}
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

function IntakeTab({ contactId, tenantSettings, tenantId }: { contactId: string; tenantSettings?: Record<string, unknown>; tenantId: string }) {
  const { data: submissions, isLoading } = useContactIntakeSubmissions(contactId)
  const { data: checkIns, isLoading: checkInsLoading } = useContactCheckIns(contactId)

  // Fetch screening answers from the contact's most recent lead (front desk intake)
  const { data: screeningLead } = useQuery({
    queryKey: ['contact-screening-lead', contactId, tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id, custom_intake_data, created_at')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 60_000,
  })

  const hasScreeningData = !!(screeningLead?.custom_intake_data &&
    Object.keys(screeningLead.custom_intake_data as Record<string, unknown>).length > 0)

  // Build a map of kiosk question IDs → question objects for label resolution
  const kioskConfig = (tenantSettings?.kiosk_config ?? {}) as Record<string, unknown>
  const kioskQuestions = (kioskConfig.kiosk_questions ?? []) as KioskQuestion[]
  const questionMap = new Map(kioskQuestions.map((q) => [q.id, q]))

  if (isLoading || checkInsLoading) {
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

  const hasSubmissions = submissions && submissions.length > 0
  const hasCheckIns = checkIns && checkIns.length > 0

  if (!hasSubmissions && !hasCheckIns && !hasScreeningData) {
    return (
      <div className="space-y-4">
        <ScreeningAnswersPanel
          customIntakeData={screeningLead?.custom_intake_data as Record<string, unknown> | null | undefined}
          defaultCollapsed={false}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">
              No intake submissions or check-in records
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This contact has not submitted any intake forms or checked in via the kiosk.
            </p>
          </CardContent>
        </Card>
      </div>
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

  function formatCheckInAnswer(val: unknown): string {
    if (val === null || val === undefined) return '—'
    if (Array.isArray(val)) return val.join(', ')
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    return String(val)
  }

  return (
    <div className="space-y-4">
      {/* Screening answers from front desk intake */}
      <ScreeningAnswersPanel
        customIntakeData={screeningLead?.custom_intake_data as Record<string, unknown> | null | undefined}
        defaultCollapsed={false}
      />

      {/* Check-in sessions (kiosk) */}
      {hasCheckIns && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">Kiosk Check-Ins</h3>
          {checkIns!.map((session) => {
            const meta = (session.metadata ?? {}) as Record<string, unknown>
            const answers = (meta.answers ?? {}) as Record<string, unknown>
            const answerEntries = Object.entries(answers).filter(([key]) => !key.startsWith('_'))

            return (
              <Card key={session.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    Kiosk Check-In
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Completed on {formatDateTime(session.completed_at ?? session.created_at)}
                  </p>
                </CardHeader>
                <CardContent>
                  {answerEntries.length > 0 ? (
                    <div className="divide-y rounded-lg border">
                      {answerEntries.map(([qId, val]) => {
                        const question = questionMap.get(qId)
                        return (
                          <div key={qId} className="flex gap-3 px-3 py-2">
                            <span className="shrink-0 text-xs font-medium text-muted-foreground w-[160px] pt-0.5">
                              {question?.label ?? qId}
                            </span>
                            <span className="text-sm text-slate-800 break-words min-w-0">
                              {formatCheckInAnswer(val)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No questions were answered during this check-in.</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}

      {/* Intake form submissions */}
      {hasSubmissions && (
        <>
          {hasCheckIns && <h3 className="text-sm font-medium text-muted-foreground">Intake Form Submissions</h3>}
          {submissions!.map((sub) => {
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
                    Submitted on {formatDateTime(sub.created_at)}
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
        </>
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Immigration History Tab
// -------------------------------------------------------------------

const IMMIGRATION_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'immigration_status',  label: 'Immigration Status' },
  { key: 'visa_type',           label: 'Visa Type' },
  { key: 'visa_expiry',         label: 'Visa Expiry Date' },
  { key: 'country_of_birth',    label: 'Country of Birth' },
  { key: 'citizenship',         label: 'Citizenship' },
  { key: 'passport_number',     label: 'Passport Number' },
  { key: 'passport_expiry',     label: 'Passport Expiry' },
  { key: 'prior_applications',  label: 'Prior Applications' },
  { key: 'travel_history',      label: 'Travel History' },
  { key: 'refusals',            label: 'Refusals / Refused Countries' },
  { key: 'entry_date',          label: 'Date of Entry (Canada)' },
  { key: 'sin_number',          label: 'SIN / Work Permit #' },
  { key: 'notes',               label: 'Immigration Notes' },
]

function ImmigrationTab({
  contact,
  contactId,
  tenantId,
}: {
  contact: Database['public']['Tables']['contacts']['Row']
  contactId: string
  tenantId: string
}) {
  const updateContact = useUpdateContact()
  const queryClient = useQueryClient()

  // immigration_data is a JSONB column on contacts
  const rawData = contact.immigration_data
  const immigrationData: Record<string, string> =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, string>)
      : {}

  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState(true)

  function handleChange(key: string, value: string) {
    setEditing((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const merged = { ...immigrationData, ...editing }
      await updateContact.mutateAsync({
        id: contactId,
        immigration_data: merged,
      })
      queryClient.invalidateQueries({ queryKey: ['contact', contactId] })
      setEditing({})
      toast.success('Immigration data saved')
    } catch {
      toast.error('Failed to save immigration data')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = Object.keys(editing).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-slate-900">Immigration History &amp; Status</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedSections((v) => !v)}
          >
            {expandedSections ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {expandedSections && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {IMMIGRATION_FIELDS.map(({ key, label }) => {
              const currentValue = editing[key] ?? immigrationData[key] ?? ''
              const isModified = key in editing
              return (
                <div key={key} className="grid grid-cols-3 gap-3 items-start">
                  <label className="text-xs font-medium text-muted-foreground pt-2 col-span-1">
                    {label}
                  </label>
                  <div className="col-span-2">
                    <Input
                      value={currentValue}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={`Enter ${label.toLowerCase()}…`}
                      className={`h-8 text-sm ${isModified ? 'border-blue-400 ring-1 ring-blue-200' : ''}`}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {!expandedSections && Object.keys(immigrationData).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Plane className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">No immigration data on file</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Expand the section above to enter immigration details.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Communications Tab
// -------------------------------------------------------------------

function useCommunications(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-communications', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communications')
        .select('id, channel, subject, body, created_at, direction, status, ai_summary')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    enabled: !!contactId && !!tenantId,
  })
}

function CommunicationsTab({
  contactId,
  tenantId,
}: {
  contactId: string
  tenantId: string
}) {
  const { data: comms, isLoading } = useCommunications(contactId, tenantId)

  function getChannelIcon(channel: string) {
    switch (channel) {
      case 'email': return <Mail className="size-4 text-blue-500" />
      case 'phone': case 'call': return <Phone className="size-4 text-green-500" />
      case 'sms': return <MessageSquare className="size-4 text-purple-500" />
      default: return <MessageSquare className="size-4 text-slate-400" />
    }
  }

  function getChannelLabel(channel: string) {
    const labels: Record<string, string> = {
      email: 'Email',
      phone: 'Phone',
      call: 'Call',
      sms: 'SMS',
      meeting: 'Meeting',
      note: 'Note',
    }
    return labels[channel] ?? channel
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!comms || comms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-slate-900">No communications on record</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Emails, calls, and messages with this contact will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {comms.map((comm) => (
        <Card key={comm.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-none">{getChannelIcon(comm.channel)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700 capitalize">
                    {getChannelLabel(comm.channel)}
                  </span>
                  {comm.direction && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
                      {comm.direction}
                    </Badge>
                  )}
                  {comm.status && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 capitalize">
                      {comm.status}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDateTime(comm.created_at)}
                  </span>
                </div>
                {comm.subject && (
                  <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">{comm.subject}</p>
                )}
                {comm.ai_summary ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{comm.ai_summary}</p>
                ) : comm.body ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{comm.body}</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// -------------------------------------------------------------------
// Family Members Tab
// -------------------------------------------------------------------

type ContactRelRow = Database['public']['Tables']['contact_relationships']['Row']

interface RelatedContactInfo {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
}

type RelWithContact = ContactRelRow & {
  _perspective_type: string
  related_contact: RelatedContactInfo | null
}

function useContactRelationships(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-relationships', contactId],
    queryFn: async () => {
      const supabase = createClient()
      // Fetch both directions: contact_id_a = this contact, OR contact_id_b = this contact
      const [resA, resB] = await Promise.all([
        supabase
          .from('contact_relationships')
          .select('id, tenant_id, contact_id_a, contact_id_b, relationship_type, reverse_type, notes, created_at, related_contact:contacts!contact_relationships_contact_id_b_fkey(id, first_name, last_name, email_primary)')
          .eq('contact_id_a', contactId),
        supabase
          .from('contact_relationships')
          .select('id, tenant_id, contact_id_a, contact_id_b, relationship_type, reverse_type, notes, created_at, related_contact:contacts!contact_relationships_contact_id_a_fkey(id, first_name, last_name, email_primary)')
          .eq('contact_id_b', contactId),
      ])

      if (resA.error) throw resA.error
      if (resB.error) throw resB.error

      const fromA: RelWithContact[] = (resA.data ?? []).map((r) => {
        const rc = (r as unknown as { related_contact: RelatedContactInfo | null }).related_contact
        return { id: r.id, tenant_id: r.tenant_id, contact_id_a: r.contact_id_a, contact_id_b: r.contact_id_b, relationship_type: r.relationship_type, reverse_type: r.reverse_type ?? null, notes: r.notes ?? null, created_at: r.created_at ?? null, _perspective_type: r.relationship_type, related_contact: rc ?? null }
      })
      const fromB: RelWithContact[] = (resB.data ?? []).map((r) => {
        const rc = (r as unknown as { related_contact: RelatedContactInfo | null }).related_contact
        return { id: r.id, tenant_id: r.tenant_id, contact_id_a: r.contact_id_a, contact_id_b: r.contact_id_b, relationship_type: r.relationship_type, reverse_type: r.reverse_type ?? null, notes: r.notes ?? null, created_at: r.created_at ?? null, _perspective_type: r.reverse_type ?? r.relationship_type, related_contact: rc ?? null }
      })

      return [...fromA, ...fromB]
    },
    enabled: !!contactId && !!tenantId,
  })
}

const RELATIONSHIP_TYPES = [
  'spouse',
  'parent',
  'child',
  'sibling',
  'dependent',
  'employer',
  'colleague',
  'partner',
  'referral_source',
  'other',
]

function FamilyTab({
  contactId,
  tenantId,
}: {
  contactId: string
  tenantId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: relationships, isLoading } = useContactRelationships(contactId, tenantId)

  const [addOpen, setAddOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [selectedRelated, setSelectedRelated] = useState<RelatedContactInfo | null>(null)
  const [relType, setRelType] = useState('spouse')
  const [relNotes, setRelNotes] = useState('')
  const [adding, setAdding] = useState(false)

  // Search contacts
  const { data: searchResults } = useQuery({
    queryKey: ['contact-search-family', tenantId, searchValue],
    queryFn: async () => {
      if (!searchValue) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .neq('id', contactId)
        .or(`first_name.ilike.%${searchValue}%,last_name.ilike.%${searchValue}%,email_primary.ilike.%${searchValue}%`)
        .limit(8)
      if (error) throw error
      return (data ?? []) as RelatedContactInfo[]
    },
    enabled: !!tenantId && searchValue.length > 0,
  })

  async function handleAddRelationship() {
    if (!selectedRelated) return
    setAdding(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('contact_relationships').insert({
        tenant_id: tenantId,
        contact_id_a: contactId,
        contact_id_b: selectedRelated.id,
        relationship_type: relType,
        notes: relNotes || null,
      })
      if (error) throw error
      toast.success('Relationship added')
      queryClient.invalidateQueries({ queryKey: ['contact-relationships', contactId] })
      setAddOpen(false)
      setSearchValue('')
      setSelectedRelated(null)
      setRelType('spouse')
      setRelNotes('')
    } catch {
      toast.error('Failed to add relationship')
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users2 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-slate-900">
            Family Members &amp; Relationships
            {relationships && relationships.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">({relationships.length})</span>
            )}
          </h3>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Add Relationship
        </Button>
      </div>

      {!relationships || relationships.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">No relationships on file</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Link family members, spouses, employers, or other related contacts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const person = rel.related_contact
            const name = person
              ? [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unnamed'
              : 'Unknown Contact'
            const inits = person
              ? [person.first_name?.[0], person.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
              : '?'
            const typeLabel = rel._perspective_type
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())

            return (
              <Card key={rel.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="text-xs font-semibold">{inits}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{name}</p>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {typeLabel}
                        </Badge>
                      </div>
                      {person?.email_primary && (
                        <p className="text-xs text-muted-foreground truncate">{person.email_primary}</p>
                      )}
                      {rel.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{rel.notes}</p>
                      )}
                    </div>
                    {person?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/contacts/${person.id}`)}
                      >
                        View Profile
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Relationship Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Relationship</DialogTitle>
            <DialogDescription>
              Link this contact to another person in your database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search contacts by name or email…"
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setSelectedRelated(null) }}
                className="pl-9"
              />
            </div>
            {searchValue && (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border divide-y">
                {(searchResults ?? []).length > 0 ? (
                  (searchResults ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedRelated(c)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        selectedRelated?.id === c.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <User className="size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                        </p>
                        {c.email_primary && (
                          <p className="text-xs text-slate-500 truncate">{c.email_primary}</p>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-slate-500">No contacts found</p>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700">Relationship Type</label>
              <Select value={relType} onValueChange={setRelType}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
              <Input
                className="mt-1"
                value={relNotes}
                onChange={(e) => setRelNotes(e.target.value)}
                placeholder="e.g. Married since 2015"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRelationship} disabled={!selectedRelated || adding}>
              {adding && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add Relationship
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
