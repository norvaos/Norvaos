'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import {
  ShieldCheck, Loader2, Play, CheckCircle2, XCircle,
  AlertTriangle, Clock, Table2, Lock,
} from 'lucide-react'

interface AuditResult {
  id: string
  ran_at: string
  total_tables: number
  tables_with_rls: number
  tables_missing_rls: string[]
  tables_without_tenant_id: string[]
  tenant_id_mutation_triggers: number
  passed: boolean
}

export default function IsolationAuditPage() {
  const dark = useNexusDark()
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)

  const { data, isLoading } = useQuery<{ data: AuditResult[] }>({
    queryKey: ['nexus-isolation-audit'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/isolation-audit')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const runAudit = useMutation({
    mutationFn: async () => {
      setRunning(true)
      const res = await fetch('/api/nexus/isolation-audit', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus-isolation-audit'] })
      setRunning(false)
    },
    onError: () => setRunning(false),
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

  const audits = data?.data ?? []
  const latest = audits[0]

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold tracking-tight', h)}>Tenant Isolation Audit</h1>
          <p className={cn('text-sm mt-0.5', sub)}>Verify RLS policies and tenant_id scoping across all tables</p>
        </div>
        <button
          onClick={() => runAudit.mutate()}
          disabled={running}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
            'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20',
            'hover:shadow-amber-500/30 hover:brightness-110 disabled:opacity-50',
          )}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Running...' : 'Run Audit'}
        </button>
      </div>

      {/* Latest result summary */}
      {latest && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className={cn('rounded-xl border p-5', card)}>
            <div className="flex items-center gap-2 mb-3">
              {latest.passed
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                : <XCircle className="h-5 w-5 text-red-500" />
              }
              <span className={cn('text-xs font-semibold uppercase tracking-wider', sub)}>Status</span>
            </div>
            <div className={cn('text-2xl font-bold', latest.passed ? 'text-emerald-500' : 'text-red-500')}>
              {latest.passed ? 'PASSED' : 'FAILED'}
            </div>
          </div>
          <div className={cn('rounded-xl border p-5', card)}>
            <div className="flex items-center gap-2 mb-3">
              <Table2 className={cn('h-5 w-5', dark ? 'text-amber-400/50' : 'text-amber-500')} />
              <span className={cn('text-xs font-semibold uppercase tracking-wider', sub)}>Tables Scanned</span>
            </div>
            <div className={cn('text-2xl font-bold', h)}>{latest.total_tables}</div>
          </div>
          <div className={cn('rounded-xl border p-5', card)}>
            <div className="flex items-center gap-2 mb-3">
              <Lock className={cn('h-5 w-5', dark ? 'text-emerald-400/50' : 'text-emerald-500')} />
              <span className={cn('text-xs font-semibold uppercase tracking-wider', sub)}>RLS Enabled</span>
            </div>
            <div className={cn('text-2xl font-bold', h)}>{latest.tables_with_rls}</div>
          </div>
          <div className={cn('rounded-xl border p-5', card)}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className={cn('h-5 w-5', dark ? 'text-blue-400/50' : 'text-blue-500')} />
              <span className={cn('text-xs font-semibold uppercase tracking-wider', sub)}>Mutation Triggers</span>
            </div>
            <div className={cn('text-2xl font-bold', h)}>{latest.tenant_id_mutation_triggers}</div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {latest && (latest.tables_missing_rls.length > 0 || latest.tables_without_tenant_id.length > 0) && (
        <div className="space-y-4">
          {latest.tables_missing_rls.length > 0 && (
            <div className={cn('rounded-xl border p-5', dark ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50')}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-sm font-bold text-red-500">Tables Missing RLS</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {latest.tables_missing_rls.map((t) => (
                  <span key={t} className="mono rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400">{t}</span>
                ))}
              </div>
            </div>
          )}
          {latest.tables_without_tenant_id.length > 0 && (
            <div className={cn('rounded-xl border p-5', dark ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-200 bg-amber-50')}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-bold text-amber-500">Tables Without tenant_id</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {latest.tables_without_tenant_id.map((t) => (
                  <span key={t} className="mono rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit history */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className={cn('h-4 w-4', sub)} />
          <span className={cn('text-base font-bold', h)}>Audit History</span>
        </div>
        <div className={cn('rounded-xl border overflow-hidden', card)}>
          <table className="w-full text-sm">
            <thead>
              <tr className={cn('border-b', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
                {['Status', 'Ran At', 'Tables', 'RLS', 'Missing RLS', 'No tenant_id', 'Triggers'].map((col) => (
                  <th key={col} className={cn('text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider', dim)}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audits.map((a, i) => (
                <tr key={a.id} className={cn(
                  'border-b last:border-0',
                  dark ? `border-white/[0.03] ${i % 2 ? 'bg-white/[0.01]' : ''}` : `border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`,
                )}>
                  <td className="px-4 py-3">
                    {a.passed
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> Pass</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500"><XCircle className="h-3.5 w-3.5" /> Fail</span>
                    }
                  </td>
                  <td className={cn('px-4 py-3 mono text-xs', sub)}>{new Date(a.ran_at).toLocaleString('en-CA')}</td>
                  <td className={cn('px-4 py-3', h)}>{a.total_tables}</td>
                  <td className={cn('px-4 py-3', h)}>{a.tables_with_rls}</td>
                  <td className={cn('px-4 py-3', a.tables_missing_rls.length > 0 ? 'text-red-400 font-bold' : sub)}>{a.tables_missing_rls.length}</td>
                  <td className={cn('px-4 py-3', a.tables_without_tenant_id.length > 0 ? 'text-amber-400 font-bold' : sub)}>{a.tables_without_tenant_id.length}</td>
                  <td className={cn('px-4 py-3', h)}>{a.tenant_id_mutation_triggers}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audits.length === 0 && (
            <div className={cn('p-12 text-center', sub)}>
              <ShieldCheck className={cn('h-10 w-10 mx-auto mb-3', dim)} />
              <p className="text-sm font-medium">No audits run yet</p>
              <p className="text-xs mt-1">Click &quot;Run Audit&quot; to check tenant isolation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
