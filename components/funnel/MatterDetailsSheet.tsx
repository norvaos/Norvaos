'use client'

import { useMemo } from 'react'
import {
  Briefcase,
  Calendar,
  FileText,
  Hash,
  MapPin,
  Shield,
  User,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useQuery } from '@tanstack/react-query'
import { useMatter } from '@/lib/queries/matters'
import { useMatterImmigration } from '@/lib/queries/immigration'
import { useMatterPeople } from '@/lib/queries/matter-people'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

interface MatterDetailsSheetProps {
  matterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  className?: string
}) {
  if (!value && value !== 0) return null
  return (
    <div className={cn('flex items-start gap-3 py-1.5', className)}>
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      {!Icon && <div className="w-3.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {children}
    </h3>
  )
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null
  const variant =
    status === 'active'
      ? 'default'
      : status === 'closed_won'
        ? 'secondary'
        : 'outline'
  return (
    <Badge variant={variant} className="capitalize text-xs">
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function PersonCard({
  name,
  role,
}: {
  name: string
  role: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground capitalize">{role.replace(/_/g, ' ')}</p>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MatterDetailsSheet({
  matterId,
  open,
  onOpenChange,
}: MatterDetailsSheetProps) {
  const { data: matter, isLoading: matterLoading } = useMatter(matterId)
  const { data: immigration, isLoading: immigrationLoading } =
    useMatterImmigration(matterId)
  const { data: people, isLoading: peopleLoading } = useMatterPeople(matterId)

  // Resolve matter type name
  const { data: matterTypeName } = useQuery({
    queryKey: ['matter-type-name', matter?.matter_type_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_types')
        .select('name')
        .eq('id', matter!.matter_type_id!)
        .single()
      return (data as { name: string } | null)?.name ?? null
    },
    enabled: !!matter?.matter_type_id,
    staleTime: 10 * 60_000,
  })

  // Resolve responsible lawyer name from user ID
  const { data: lawyerName } = useQuery({
    queryKey: ['user-name', matter?.responsible_lawyer_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', matter!.responsible_lawyer_id!)
        .single()
      return (data as { full_name: string } | null)?.full_name ?? null
    },
    enabled: !!matter?.responsible_lawyer_id,
    staleTime: 10 * 60_000,
  })

  const isLoading = matterLoading || immigrationLoading || peopleLoading

  const principalApplicant = useMemo(
    () => people?.find((p) => p.person_role === 'principal_applicant'),
    [people],
  )

  const dependents = useMemo(
    () => people?.filter((p) => p.person_role !== 'principal_applicant') ?? [],
    [people],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">
            {matter?.title ?? 'Matter Details'}
          </SheetTitle>
          {matter && (
            <div className="flex items-center gap-2">
              <StatusBadge status={matter.status} />
              {matter.priority && (
                <Badge variant="outline" className="text-xs capitalize">
                  {matter.priority}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-1 pb-6">
            {/* ── Case Overview ─────────────────────────────────────── */}
            <SectionLabel>Case Overview</SectionLabel>
            <DetailRow
              icon={Hash}
              label="Matter Number"
              value={matter?.matter_number}
            />
            <DetailRow
              icon={FileText}
              label="Matter Type"
              value={matterTypeName ?? (matter?.matter_type_id ? 'Loading…' : 'Not set')}
            />
            <DetailRow
              icon={Calendar}
              label="Date Opened"
              value={matter?.created_at ? formatDate(matter.created_at) : null}
            />
            <DetailRow
              icon={Briefcase}
              label="Responsible Lawyer"
              value={lawyerName ?? (matter?.responsible_lawyer_id ? 'Loading…' : null)}
            />

            <Separator className="my-3" />

            {/* ── Immigration Details ──────────────────────────────── */}
            {immigration && (
              <>
                <SectionLabel>Immigration Details</SectionLabel>
                <DetailRow
                  icon={Shield}
                  label="Programme Category"
                  value={
                    immigration.program_category
                      ? immigration.program_category.replace(/_/g, ' ')
                      : null
                  }
                />
                <DetailRow
                  icon={Hash}
                  label="Application Number"
                  value={immigration.application_number}
                />
                <DetailRow
                  icon={Hash}
                  label="UCI Number"
                  value={immigration.uci_number}
                />
                <DetailRow
                  icon={MapPin}
                  label="Country of Citizenship"
                  value={immigration.country_of_citizenship}
                />
                <DetailRow
                  icon={MapPin}
                  label="Country of Residence"
                  value={immigration.country_of_residence}
                />
                <DetailRow
                  icon={FileText}
                  label="Current Visa Status"
                  value={
                    immigration.current_visa_status
                      ? immigration.current_visa_status.replace(/_/g, ' ')
                      : null
                  }
                />
                <DetailRow
                  icon={Calendar}
                  label="Visa Expiry"
                  value={
                    immigration.current_visa_expiry
                      ? formatDate(immigration.current_visa_expiry)
                      : null
                  }
                />

                {/* Application Dates */}
                {(immigration.date_filed ||
                  immigration.date_biometrics ||
                  immigration.date_medical ||
                  immigration.date_decision) && (
                  <>
                    <Separator className="my-3" />
                    <SectionLabel>Application Dates</SectionLabel>
                    <DetailRow
                      icon={Calendar}
                      label="Date Filed"
                      value={
                        immigration.date_filed
                          ? formatDate(immigration.date_filed)
                          : null
                      }
                    />
                    <DetailRow
                      icon={Calendar}
                      label="Biometrics"
                      value={
                        immigration.date_biometrics
                          ? formatDate(immigration.date_biometrics)
                          : null
                      }
                    />
                    <DetailRow
                      icon={Calendar}
                      label="Medical"
                      value={
                        immigration.date_medical
                          ? formatDate(immigration.date_medical)
                          : null
                      }
                    />
                    <DetailRow
                      icon={Calendar}
                      label="Decision"
                      value={
                        immigration.date_decision
                          ? formatDate(immigration.date_decision)
                          : null
                      }
                    />
                  </>
                )}

                <Separator className="my-3" />
              </>
            )}

            {/* ── People & Dependents ─────────────────────────────── */}
            <SectionLabel>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                People ({people?.length ?? 0})
              </span>
            </SectionLabel>

            {principalApplicant && (
              <PersonCard
                name={`${principalApplicant.first_name ?? ''} ${principalApplicant.last_name ?? ''}`.trim() || 'Unnamed'}
                role="Principal Applicant"
              />
            )}

            {dependents.map((p) => (
              <PersonCard
                key={p.id}
                name={`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'}
                role={p.role_label ?? p.person_role ?? 'Dependent'}
              />
            ))}

            {(!people || people.length === 0) && (
              <p className="text-xs text-muted-foreground py-2">
                No people added to this matter yet.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
