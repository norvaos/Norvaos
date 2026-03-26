'use client'

import { useQuery } from '@tanstack/react-query'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import {
  Building2, Users, Loader2, Search, MoreHorizontal,
  Mail, Calendar, Shield,
} from 'lucide-react'

interface Tenant {
  id: string
  name: string
  slug: string
  subscription_tier: string | null
  subscription_status: string | null
  max_users: number | null
  created_at: string | null
  jurisdiction: string | null
}

export default function FirmsPage() {
  const dark = useNexusDark()

  const { data, isLoading } = useQuery<{ data: { tenants: Tenant[] } }>({
    queryKey: ['nexus-overview'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/overview')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const card = dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'
  const h = dark ? 'text-white' : 'text-gray-900'
  const sub = dark ? 'text-white/40' : 'text-gray-500'
  const dim = dark ? 'text-white/20' : 'text-gray-300'

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className={cn('h-6 w-6 animate-spin', dark ? 'text-amber-400/50' : 'text-amber-500')} />
    </div>
  )

  const tenants = data?.data?.tenants ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold tracking-tight', h)}>Firms</h1>
          <p className={cn('text-sm mt-0.5', sub)}>All registered law firms on the platform</p>
        </div>
        <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white')}>
          <Search className={cn('h-4 w-4', dim)} />
          <input
            type="text"
            placeholder="Search firms..."
            className={cn('bg-transparent text-sm outline-none placeholder:text-inherit w-48', dim)}
          />
        </div>
      </div>

      {/* Firm cards grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenants.map((t) => {
          const colour = { starter: '#3B82F6', professional: '#8B5CF6', enterprise: '#F59E0B' }[t.subscription_tier ?? ''] ?? '#6b7280'
          const sColour = t.subscription_status === 'active' ? '#22c55e' : t.subscription_status === 'trialing' ? '#06b6d4' : '#f59e0b'
          return (
            <div key={t.id} className={cn('rounded-xl border p-5 transition-all hover:scale-[1.01]', card)}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', dark ? 'bg-white/[0.04]' : 'bg-gray-50')}>
                    <Building2 className={cn('h-5 w-5', dark ? 'text-white/30' : 'text-gray-400')} />
                  </div>
                  <div>
                    <div className={cn('text-sm font-bold', h)}>{t.name}</div>
                    <div className={cn('mono text-xs', dim)}>{t.slug}</div>
                  </div>
                </div>
                <button className={cn('p-1 rounded-md transition-colors', dark ? 'hover:bg-white/[0.04] text-white/20' : 'hover:bg-gray-100 text-gray-300')}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: colour + '12', color: colour, border: `1px solid ${colour}20` }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colour }} />
                  {t.subscription_tier ?? 'none'}
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{ backgroundColor: sColour + '10', color: sColour, border: `1px solid ${sColour}20` }}>
                  {t.subscription_status ?? 'unknown'}
                </span>
              </div>

              <div className={cn('space-y-2 text-xs', sub)}>
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  <span>Max {t.max_users ?? ' - '} seats</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Jurisdiction: {t.jurisdiction ?? 'CA'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Joined {t.created_at ? new Date(t.created_at).toLocaleDateString('en-CA') : ' - '}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {tenants.length === 0 && (
        <div className={cn('rounded-xl border p-12 text-center', card)}>
          <Building2 className={cn('h-10 w-10 mx-auto mb-3', dim)} />
          <p className={cn('text-sm font-medium', h)}>No firms yet</p>
          <p className={cn('text-xs mt-1', sub)}>Firms will appear here when they sign up.</p>
        </div>
      )}
    </div>
  )
}
