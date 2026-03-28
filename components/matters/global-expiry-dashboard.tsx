'use client'

import { useQuery } from '@tanstack/react-query'
import { Shield, AlertTriangle, Clock, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface ExpiryEntry {
  contact_id: string
  contact_name: string
  document_type: string
  expiry_date: string
  days_until_expiry: number
  matter_id: string | null
  matter_title: string | null
}

function getUrgencyColour(days: number): { bg: string; text: string; badge: 'default' | 'destructive' | 'secondary' } {
  if (days <= 0) return { bg: 'bg-red-950/30 dark:bg-red-950/40', text: 'text-red-400 dark:text-red-300', badge: 'destructive' }
  if (days < 90) return { bg: 'bg-red-950/30 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', badge: 'destructive' }
  if (days < 180) return { bg: 'bg-amber-950/30 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', badge: 'default' }
  return { bg: 'bg-muted/30', text: 'text-muted-foreground', badge: 'secondary' }
}

function formatDocType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function GlobalExpiryDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'expiry-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/admin/expiry-dashboard')
      if (!res.ok) throw new Error('Failed to fetch expiry dashboard')
      return res.json() as Promise<{ entries: ExpiryEntry[]; scanned_at: string }>
    },
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const entries = data?.entries ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold">Sentinel Pulse  -  Global Expiry Dashboard</h2>
        </div>
        {data?.scanned_at && (
          <p className="text-xs text-muted-foreground">
            Last scan: {new Date(data.scanned_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-950/300" /> &lt;90 days (Sovereign Red)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-950/300 animate-pulse" /> 90–180 days (Amber Pulse)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> &gt;180 days (Grey)</span>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 dark:border-emerald-800 bg-emerald-950/30 dark:bg-emerald-950/30 px-4 py-8 justify-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm text-emerald-400 dark:text-emerald-300">No upcoming expiries detected  -  all clients secure</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const urgency = getUrgencyColour(entry.days_until_expiry)
            return (
              <div
                key={`${entry.contact_id}-${entry.document_type}`}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-4 py-3 transition-colors',
                  urgency.bg,
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {entry.days_until_expiry < 90 ? (
                    <AlertTriangle className={cn('h-4 w-4 shrink-0', urgency.text)} />
                  ) : (
                    <Clock className={cn('h-4 w-4 shrink-0', urgency.text)} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.contact_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDocType(entry.document_type)}  -  expires {entry.expiry_date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={urgency.badge} className="text-xs">
                    {entry.days_until_expiry <= 0
                      ? `Expired ${Math.abs(entry.days_until_expiry)}d ago`
                      : `${entry.days_until_expiry}d remaining`}
                  </Badge>
                  {entry.matter_id && (
                    <Link
                      href={`/matters/${entry.matter_id}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
