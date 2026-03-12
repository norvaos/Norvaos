'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Briefcase,
  Users,
  DollarSign,
  Calendar,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { RequirePermission } from '@/components/require-permission'
import { formatDate, formatCurrency } from '@/lib/utils/formatters'
import type { Database } from '@/lib/types/database'
import {
  InfoRow,
  getBillingLabel,
  getUserName,
  type Matter,
  type UserRow,
  type PracticeArea,
} from './matter-tab-helpers'

export function OverviewTab({
  matter,
  users,
  practiceArea,
  tenantId,
  matterId,
  hasImmigration,
  immigrationData,
}: {
  matter: Matter
  users: UserRow[] | undefined
  practiceArea: PracticeArea | undefined
  tenantId: string
  matterId: string
  hasImmigration?: boolean
  immigrationData?: Database['public']['Tables']['matter_immigration']['Row'] | null
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Matter Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-muted-foreground" />
            Matter Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Matter Number" value={matter.matter_number} />
          <InfoRow label="Title" value={matter.title} />
          {matter.description && (
            <InfoRow label="Description" value={matter.description} />
          )}
          <Separator />
          <InfoRow label="Practice Area" value={practiceArea?.name ?? '-'} />
          {matter.matter_type && (
            <InfoRow label="Matter Type" value={matter.matter_type} />
          )}
          {hasImmigration && immigrationData && (
            <>
              {immigrationData.country_of_citizenship && (
                <InfoRow label="Country of Citizenship" value={immigrationData.country_of_citizenship} />
              )}
              {immigrationData.current_visa_status && (
                <InfoRow label="Current Visa Status" value={immigrationData.current_visa_status} />
              )}
              {immigrationData.application_number && (
                <InfoRow label="Application #" value={immigrationData.application_number} />
              )}
              {immigrationData.uci_number && (
                <InfoRow label="UCI #" value={immigrationData.uci_number} />
              )}
            </>
          )}
          <InfoRow
            label="Date Opened"
            value={formatDate(matter.date_opened)}
          />
          {matter.date_closed && (
            <InfoRow
              label="Date Closed"
              value={formatDate(matter.date_closed)}
            />
          )}
          <InfoRow
            label="Created"
            value={formatDate(matter.created_at)}
          />
        </CardContent>
      </Card>

      {/* Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            label="Responsible Lawyer"
            value={getUserName(matter.responsible_lawyer_id, users)}
          />
          <InfoRow
            label="Originating Lawyer"
            value={getUserName(matter.originating_lawyer_id, users)}
          />
          {matter.team_member_ids && matter.team_member_ids.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Team Members</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {matter.team_member_ids.map((memberId) => (
                    <Badge key={memberId} variant="secondary" className="text-xs">
                      {getUserName(memberId, users)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Billing & Financial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DollarSign className="size-4 text-muted-foreground" />
            Billing & Financial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Billing Type" value={getBillingLabel(matter.billing_type)} />
          {matter.hourly_rate != null && (
            <InfoRow
              label="Hourly Rate"
              value={formatCurrency(matter.hourly_rate)}
            />
          )}
          <Separator />
          <InfoRow
            label="Estimated Value"
            value={matter.estimated_value != null ? formatCurrency(matter.estimated_value) : '-'}
          />
          {matter.weighted_value != null && (
            <InfoRow
              label="Weighted Value"
              value={formatCurrency(matter.weighted_value)}
            />
          )}
          <RequirePermission entity="billing" action="view" variant="inline" loadingVariant="inline">
            <>
              <Separator />
              <InfoRow
                label="Total Billed"
                value={formatCurrency(matter.total_billed)}
              />
              <InfoRow
                label="Total Paid"
                value={formatCurrency(matter.total_paid)}
              />
              <InfoRow
                label="Trust Balance"
                value={formatCurrency(matter.trust_balance)}
              />
            </>
          </RequirePermission>
        </CardContent>
      </Card>

      {/* Key Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            Key Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            label="Date Opened"
            value={formatDate(matter.date_opened)}
          />
          {matter.date_closed && (
            <InfoRow
              label="Date Closed"
              value={formatDate(matter.date_closed)}
            />
          )}
          <Separator />
          {matter.statute_of_limitations ? (
            <div>
              <p className="text-xs text-muted-foreground">Statute of Limitations</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-900">
                  {formatDate(matter.statute_of_limitations)}
                </p>
                {new Date(matter.statute_of_limitations) < new Date() && (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="mr-1 size-3" />
                    Expired
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <InfoRow label="Statute of Limitations" value="-" />
          )}
          {matter.next_deadline ? (
            <div>
              <p className="text-xs text-muted-foreground">Next Deadline</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-900">
                  {formatDate(matter.next_deadline)}
                </p>
                {new Date(matter.next_deadline) < new Date() && (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="mr-1 size-3" />
                    Overdue
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <InfoRow label="Next Deadline" value="-" />
          )}
          <Separator />
          <InfoRow
            label="Current Stage Since"
            value={formatDate(matter.stage_entered_at)}
          />
        </CardContent>
      </Card>

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
            entityType="matter"
            entityId={matterId}
            matterId={matterId}
            limit={6}
          />
        </CardContent>
      </Card>
    </div>
  )
}
