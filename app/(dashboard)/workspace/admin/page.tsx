'use client'

import { useQuery } from '@tanstack/react-query'
import { Settings, Briefcase, Users, Activity, CheckCircle2, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { formatDate } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const supabase = createClient()

const QUICK_LINKS = [
  { label: 'Matter Types', href: '/settings/matter-types', icon: Briefcase },
  { label: 'Practice Areas', href: '/settings/practice-areas', icon: Briefcase },
  { label: 'Workflow Templates', href: '/settings/workflow-templates', icon: Settings },
  { label: 'User Management', href: '/settings/access-control', icon: Users },
  { label: 'Billing Config', href: '/settings', icon: Settings },
  { label: 'Automation Rules', href: '/settings/automation-rules', icon: Activity },
]

export default function AdminWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  // Total active matters
  const { data: mattersCount = 0 } = useQuery({
    queryKey: ['workspace-admin-matters-count', tenantId],
    queryFn: async () => {
      const { count } = await supabase
        .from('matters')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'closed_won')
        .neq('status', 'closed_lost')
      return count ?? 0
    },
    enabled: !!tenantId,
  })

  // Total active users
  const { data: usersCount = 0 } = useQuery({
    queryKey: ['workspace-admin-users-count', tenantId],
    queryFn: async () => {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
      return count ?? 0
    },
    enabled: !!tenantId,
  })

  // Recent activities (last 20)
  const { data: recentActivities = [] } = useQuery({
    queryKey: ['workspace-admin-activities', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('id, title, activity_type, created_at, matter_id, contact_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Onboarding wizard status
  const { data: onboarding } = useQuery({
    queryKey: ['workspace-admin-onboarding', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_onboarding_wizard')
        .select('id, status, current_step, mode, answers, updated_at')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      return data
    },
    enabled: !!tenantId,
  })

  // Compute onboarding progress
  const onboardingPct = (() => {
    if (!onboarding) return null
    const totalSteps = 8 // reasonable estimate; wizard defines the actual total
    return Math.min(100, Math.round((onboarding.current_step / totalSteps) * 100))
  })()

  const activityTypeColour = (type: string) => {
    if (type.includes('error')) return 'bg-red-100 text-red-600'
    if (type.includes('create')) return 'bg-green-100 text-green-600'
    if (type.includes('delete')) return 'bg-red-100 text-red-600'
    if (type.includes('update') || type.includes('edit')) return 'bg-blue-100 text-blue-600'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="size-6 text-primary" />
          Admin Workspace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          System health, onboarding progress, and quick configuration links.
        </p>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Active Matters</p>
          <p className="text-2xl font-bold">{mattersCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Active Users</p>
          <p className="text-2xl font-bold">{usersCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Recent Activities</p>
          <p className="text-2xl font-bold">{recentActivities.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Onboarding</p>
          <p className="text-2xl font-bold">
            {onboardingPct !== null ? `${onboardingPct}%` : ' - '}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Quick Links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="size-4 text-primary" />
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm h-auto py-2.5">
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{label}</span>
                    <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Onboarding Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-primary" />
              Onboarding Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!onboarding ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No onboarding wizard data found.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={onboarding.status === 'completed' ? 'default' : 'secondary'}>
                    {onboarding.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium">{onboarding.mode}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Step</span>
                  <span className="font-medium">{onboarding.current_step}</span>
                </div>
                {onboardingPct !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Completion</span>
                      <span>{onboardingPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${onboardingPct}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Last updated {formatDate(onboarding.updated_at)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Recent Activity
              </span>
              <Badge variant="secondary">{recentActivities.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent activity to show.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {recentActivities.map((act) => (
                  <li key={act.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium shrink-0 ${activityTypeColour(act.activity_type)}`}>
                      {act.activity_type}
                    </span>
                    <span className="flex-1 truncate text-foreground">{act.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(act.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
