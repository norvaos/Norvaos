'use client'

import { useQuery } from '@tanstack/react-query'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import { Grid3X3, Loader2, Check, X, Zap, Rocket, Crown } from 'lucide-react'

interface FeatureMatrix {
  data: {
    features: string[]
    tiers: Record<string, Record<string, boolean>>
    tenant_features: Array<{
      tenant_id: string
      tenant_name: string
      tier: string
      effective: Record<string, boolean>
    }>
  }
}

const featureLabels: Record<string, string> = {
  matters: 'Matters',
  contacts: 'Contacts',
  documents: 'Documents',
  tasks: 'Tasks',
  billing: 'Billing',
  calendar: 'Calendar',
  leads: 'Leads',
  reports: 'Reports',
  trust_accounting: 'Trust Accounting',
  client_portal: 'Client Portal',
  ai_drafting: 'AI Drafting',
  custom_fields: 'Custom Fields',
  api_access: 'API Access',
  white_label: 'White Label',
  sla_support: 'SLA Support',
}

export default function FeaturesPage() {
  const dark = useNexusDark()

  const { data, isLoading } = useQuery<FeatureMatrix>({
    queryKey: ['nexus-feature-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/feature-matrix')
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

  const features = data?.data?.features ?? []
  const tiers = data?.data?.tiers ?? {}
  const tierNames = Object.keys(tiers)
  const tierIcons: Record<string, React.ReactNode> = {
    starter: <Zap className="h-4 w-4" />,
    professional: <Rocket className="h-4 w-4" />,
    enterprise: <Crown className="h-4 w-4" />,
  }
  const tierColours: Record<string, string> = {
    starter: '#3B82F6',
    professional: '#8B5CF6',
    enterprise: '#F59E0B',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn('text-2xl font-bold tracking-tight', h)}>Feature Matrix</h1>
        <p className={cn('text-sm mt-0.5', sub)}>Feature availability across subscription tiers</p>
      </div>

      {/* Matrix table */}
      <div className={cn('rounded-xl border overflow-hidden', card)}>
        <table className="w-full text-sm">
          <thead>
            <tr className={cn('border-b', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
              <th className={cn('text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider', sub)}>Feature</th>
              {tierNames.map((tier) => (
                <th key={tier} className="px-5 py-4 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: (tierColours[tier] ?? '#6b7280') + '15', color: tierColours[tier] ?? '#6b7280' }}>
                      {tierIcons[tier] ?? <Grid3X3 className="h-4 w-4" />}
                    </div>
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider', h)}>{tier}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, i) => (
              <tr key={feature} className={cn(
                'border-b last:border-0 transition-colors',
                dark ? `border-white/[0.03] ${i % 2 ? 'bg-white/[0.01]' : ''}` : `border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`,
              )}>
                <td className={cn('px-5 py-3 font-medium', h)}>
                  {featureLabels[feature] ?? feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </td>
                {tierNames.map((tier) => {
                  const enabled = tiers[tier]?.[feature] ?? false
                  return (
                    <td key={tier} className="px-5 py-3 text-center">
                      {enabled ? (
                        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10">
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                      ) : (
                        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10">
                          <X className="h-3.5 w-3.5 text-red-400/50" />
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {features.length === 0 && (
        <div className={cn('rounded-xl border p-12 text-center', card)}>
          <Grid3X3 className={cn('h-10 w-10 mx-auto mb-3', dim)} />
          <p className={cn('text-sm font-medium', h)}>No features configured</p>
          <p className={cn('text-xs mt-1', sub)}>Feature flags will appear here once configured.</p>
        </div>
      )}
    </div>
  )
}
