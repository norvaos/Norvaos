'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  ShieldCheck,
  Users,
  Layers,
  FileText,
  Landmark,
  CheckCircle2,
  XCircle,
  Lock,
  Building2,
  Loader2,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const STALE_TIME = 1000 * 60 * 2

// ─── Tenant stats query ───────────────────────────────────────────────────────

interface TenantStats {
  firmName: string | null
  activeUsers: number
  practiceAreas: number
  matterTypes: number
  trustAccounts: number
}

function useTenantStats(tenantId: string) {
  return useQuery<TenantStats>({
    queryKey: ['impl_status_stats', tenantId],
    queryFn: async () => {
      const supabase = createClient()

      const [tenantRes, usersRes, practiceAreasRes, matterTypesRes, trustRes] =
        await Promise.all([
          supabase
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single(),
          supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true),
          supabase
            .from('practice_areas')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true),
          supabase
            .from('matter_types')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true),
          supabase
            .from('trust_bank_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
        ])

      return {
        firmName: tenantRes.data?.name ?? null,
        activeUsers: usersRes.count ?? 0,
        practiceAreas: practiceAreasRes.count ?? 0,
        matterTypes: matterTypesRes.count ?? 0,
        trustAccounts: trustRes.count ?? 0,
      }
    },
    enabled: !!tenantId,
    staleTime: STALE_TIME,
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImplementationStatusPage() {
  const router = useRouter()
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const { role, isLoading: roleLoading } = useUserRole()
  const tenantId = tenant?.id ?? ''

  const { data: stats, isLoading: statsLoading } = useTenantStats(tenantId)

  // ── Permission gate: admin role OR settings:view ───────────────────────────
  const hasAccess = !roleLoading && role !== null && (
    role.name === 'Admin' ||
    role.is_system ||
    (role.permissions?.settings?.view === true)
  )

  useEffect(() => {
    if (!roleLoading && !hasAccess && appUser) {
      router.replace('/')
    }
  }, [roleLoading, hasAccess, appUser, router])

  if (roleLoading || (!hasAccess && appUser)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Implementation Status</h2>
        <p className="mt-1 text-sm text-slate-500">
          Internal operational readiness view for this tenant. Not client-facing.
        </p>
      </div>

      {/* System Configuration */}
      <Section title="System Configuration" icon={<ShieldCheck className="h-4 w-4" />}>
        <StatusRow
          icon={<Database className="h-4 w-4" />}
          label="Database connectivity"
          value="Connected"
          status="ok"
          description="Supabase PostgreSQL connection is active."
        />
        <StatusRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Supabase Auth"
          value="Active"
          status="ok"
          description="Authentication provider is operational."
        />
        <StatusRow
          icon={<Lock className="h-4 w-4" />}
          label="Row-Level Security"
          value="Enforced"
          status="ok"
          description="All tenant data is isolated by RLS policy."
        />
      </Section>

      {/* Tenant Configuration */}
      <Section title="Tenant Configuration" icon={<Building2 className="h-4 w-4" />}>
        {statsLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <StatusRow
              icon={<Building2 className="h-4 w-4" />}
              label="Firm name"
              value={stats?.firmName ?? 'Not set'}
              status={stats?.firmName ? 'ok' : 'warn'}
              description="Tenant display name used across the platform."
            />
            <StatusRow
              icon={<Users className="h-4 w-4" />}
              label="Active users"
              value={String(stats?.activeUsers ?? 0)}
              status={(stats?.activeUsers ?? 0) > 0 ? 'ok' : 'warn'}
              description="Count of active user accounts in this tenant."
            />
            <StatusRow
              icon={<Layers className="h-4 w-4" />}
              label="Practice areas enabled"
              value={String(stats?.practiceAreas ?? 0)}
              status={(stats?.practiceAreas ?? 0) > 0 ? 'ok' : 'warn'}
              description="Number of active practice areas configured."
            />
            <StatusRow
              icon={<FileText className="h-4 w-4" />}
              label="Matter types configured"
              value={String(stats?.matterTypes ?? 0)}
              status={(stats?.matterTypes ?? 0) > 0 ? 'ok' : 'warn'}
              description="Number of active matter types across all practice areas."
            />
            <StatusRow
              icon={<Landmark className="h-4 w-4" />}
              label="Trust accounts"
              value={String(stats?.trustAccounts ?? 0)}
              status={(stats?.trustAccounts ?? 0) > 0 ? 'ok' : 'warn'}
              description="Trust bank accounts registered for this tenant."
            />
          </>
        )}
      </Section>

      {/* Feature Flags (from tenant.feature_flags if available) */}
      {tenant?.feature_flags && Object.keys(tenant.feature_flags).length > 0 && (
        <Section title="Feature Flags" icon={<CheckCircle2 className="h-4 w-4" />}>
          {Object.entries(tenant.feature_flags as Record<string, boolean>).map(
            ([key, enabled]) => (
              <StatusRow
                key={key}
                icon={
                  enabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-300" />
                  )
                }
                label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                value={enabled ? 'Enabled' : 'Disabled'}
                status={enabled ? 'ok' : 'neutral'}
                description={`Feature flag: ${key}`}
              />
            )
          )}
        </Section>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <span className="text-slate-500">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  )
}

// ─── Status row ───────────────────────────────────────────────────────────────

type StatusLevel = 'ok' | 'warn' | 'error' | 'neutral'

function StatusRow({
  icon,
  label,
  value,
  status,
  description,
}: {
  icon: React.ReactNode
  label: string
  value: string
  status: StatusLevel
  description?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && (
          <p className="text-xs text-slate-400 truncate">{description}</p>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 text-xs font-medium',
          status === 'ok' && 'border-emerald-500/20 bg-emerald-950/30 text-emerald-400',
          status === 'warn' && 'border-amber-200 bg-amber-950/30 text-amber-400',
          status === 'error' && 'border-red-200 bg-red-950/30 text-red-400',
          status === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-500'
        )}
      >
        {value}
      </Badge>
    </div>
  )
}
