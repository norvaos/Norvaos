'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Rocket,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetupResponse {
  tenant: {
    id: string
    name: string
    slug: string
    status: string
    subscription_tier: string
    created_at: string
  }
  setup: {
    starter_pack_applied: string | null
    bootstrap_log: Array<{
      action: string
      starter_pack: string | null
      applied_at: string
      applied_by: string
      result: unknown
    }>
    roles_count: number
    roles: Array<{ name: string; is_system: boolean }>
    practice_areas_count: number
    practice_areas: Array<{ name: string; is_enabled: boolean }>
    active_user_count: number
    manual_checklist_completions: Array<{
      item_key: string
      completed_at: string
      completed_by: string | null
    }>
  }
  error: string | null
}

const STARTER_PACKS = [
  { value: 'immigration_canada', label: 'Immigration (Canada)' },
  { value: 'real_estate_ontario', label: 'Real Estate (Ontario)' },
  { value: 'general_practice', label: 'General Practice' },
]

function getTierBadge(tier: string) {
  const colours: Record<string, string> = {
    starter: 'bg-slate-100 text-slate-700',
    professional: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-purple-100 text-purple-700',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        colours[tier] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {tier}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TenantSetupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: tenantId } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  const [bootstrapOpen, setBootstrapOpen] = useState(false)
  const [selectedPack, setSelectedPack] = useState('')

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SetupResponse>({
    queryKey: ['admin', 'tenant-setup', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/setup`)
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to load setup state')
      }
      return res.json()
    },
    staleTime: 30_000,
  })

  const bootstrap = useMutation({
    mutationFn: async (starterPack: string) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starter_pack: starterPack }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Bootstrap failed')
      return body
    },
    onSuccess: (result) => {
      const { roles, practice_areas } = result.summary
      toast.success('Bootstrap complete.', {
        description: `Roles: ${roles.created} created, ${roles.skipped} skipped. Practice areas: ${practice_areas.created} created, ${practice_areas.skipped} skipped.`,
      })
      setBootstrapOpen(false)
      setSelectedPack('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenant-setup', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: (err) => {
      toast.error('Bootstrap failed.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const setup = data?.setup
  const tenant = data?.tenant

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/settings/admin/tenants')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{tenant?.name}</h2>
              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {tenant?.slug}
              </code>
              {tenant && getTierBadge(tenant.subscription_tier)}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load setup state. You may not have platform-admin access.</p>
        </div>
      )}

      {!isLoading && !isError && setup && tenant && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Left column ── */}
          <div className="space-y-6">
            {/* Tenant stats */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Tenant State
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize font-medium">{tenant.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Active users</dt>
                  <dd className="font-medium">{setup.active_user_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Roles</dt>
                  <dd className="font-medium">{setup.roles_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Practice areas</dt>
                  <dd className="font-medium">{setup.practice_areas_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Starter pack</dt>
                  <dd className="font-medium">
                    {setup.starter_pack_applied
                      ? STARTER_PACKS.find((p) => p.value === setup.starter_pack_applied)?.label ??
                        setup.starter_pack_applied
                      : <span className="text-muted-foreground">None applied</span>}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">
                    {formatDistanceToNow(new Date(tenant.created_at), { addSuffix: true })}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Bootstrap */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bootstrap
              </h3>
              <p className="text-xs text-muted-foreground">
                Seeds system roles and practice areas from a starter pack. Idempotent  -  already-applied actions are skipped.
              </p>
              <Button
                size="sm"
                onClick={() => setBootstrapOpen(true)}
              >
                <Rocket className="mr-1.5 h-4 w-4" />
                Run Bootstrap
              </Button>
            </div>

            {/* Roles */}
            {setup.roles.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Roles ({setup.roles_count})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {setup.roles.map((r) => (
                    <Badge key={r.name} variant={r.is_system ? 'default' : 'outline'} className="text-xs">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Practice areas */}
            {setup.practice_areas.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Practice Areas ({setup.practice_areas_count})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {setup.practice_areas.map((pa) => (
                    <Badge
                      key={pa.name}
                      variant={pa.is_enabled ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {pa.name}
                      {!pa.is_enabled && ' (disabled)'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            {/* Checklist completions */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Manual Checklist Completions
              </h3>
              {setup.manual_checklist_completions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No manual items completed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {setup.manual_checklist_completions.map((c) => (
                    <li key={c.item_key} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-medium">{c.item_key}</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(c.completed_at), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Bootstrap log */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bootstrap Log ({setup.bootstrap_log.length})
              </h3>
              {setup.bootstrap_log.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bootstrap actions applied yet.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {setup.bootstrap_log.map((entry, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono">{entry.action}</span>
                        <span className="ml-2 text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.applied_at), { addSuffix: true })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bootstrap dialog */}
      <Dialog open={bootstrapOpen} onOpenChange={setBootstrapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Bootstrap</DialogTitle>
            <DialogDescription>
              Select a starter pack to seed roles and practice areas for{' '}
              <strong>{tenant?.name}</strong>. Already-applied actions are skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="starter-pack">Starter Pack</Label>
              <Select value={selectedPack} onValueChange={setSelectedPack}>
                <SelectTrigger id="starter-pack">
                  <SelectValue placeholder="Select a starter pack…" />
                </SelectTrigger>
                <SelectContent>
                  {STARTER_PACKS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBootstrapOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bootstrap.mutate(selectedPack)}
              disabled={!selectedPack || bootstrap.isPending}
            >
              {bootstrap.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run Bootstrap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
