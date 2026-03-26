'use client'

/**
 * /admin/global-expiry
 *
 * Displays all clients sorted by "Days to Expiry" with a colour-coded heatmap.
 * Colour bands: Sovereign Red (<90 days), Amber Pulse (90-180), Grey (>180).
 * Auto-refreshes every 30 seconds via TanStack Query.
 */

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Globe,
  Clock,
  AlertTriangle,
  Loader2,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ExpiryRecord {
  id: string
  contact_name: string
  document_type: string
  expiry_date: string
  days_remaining: number
  matter_id: string
  matter_number: string
}

type ColourBand = 'red' | 'amber' | 'grey'

function getColourBand(days: number): ColourBand {
  if (days < 90) return 'red'
  if (days <= 180) return 'amber'
  return 'grey'
}

function getRowClasses(band: ColourBand): string {
  switch (band) {
    case 'red':
      return 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
    case 'amber':
      return 'border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10'
    case 'grey':
    default:
      return ''
  }
}

function getBadgeVariant(band: ColourBand) {
  switch (band) {
    case 'red':
      return 'destructive' as const
    case 'amber':
      return 'outline' as const
    case 'grey':
    default:
      return 'secondary' as const
  }
}

function getBadgeClasses(band: ColourBand): string {
  switch (band) {
    case 'amber':
      return 'border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    default:
      return ''
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function GlobalExpiryDashboardPage() {
  const { data, isLoading } = useQuery<ExpiryRecord[]>({
    queryKey: ['global-expiry'],
    queryFn: async () => {
      const res = await fetch('/api/admin/global-expiry')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 30000,
  })

  const records = data ?? []

  const counts = records.reduce(
    (acc, r) => {
      const band = getColourBand(r.days_remaining)
      acc[band] += 1
      return acc
    },
    { red: 0, amber: 0, grey: 0 } as Record<ColourBand, number>,
  )

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Global Expiry Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            All client documents sorted by days to expiry
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-red-300 dark:border-red-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sovereign Red (&lt;90 days)
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {isLoading ? '—' : counts.red}
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Amber Pulse (90–180 days)
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {isLoading ? '—' : counts.amber}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Safe (&gt;180 days)
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">
              {isLoading ? '—' : counts.grey}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">
            Loading expiry data…
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && records.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-muted-foreground">
              No expiry records found.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Expiry Table */}
      {!isLoading && records.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      Contact Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Document Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Expiry Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Days Remaining
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Matter
                    </th>
                    <th className="px-4 py-3 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const band = getColourBand(record.days_remaining)
                    return (
                      <tr
                        key={record.id}
                        className={cn(
                          'border-b transition-colors hover:bg-muted/30',
                          getRowClasses(band),
                        )}
                      >
                        <td className="px-4 py-3 font-medium">
                          {record.contact_name}
                        </td>
                        <td className="px-4 py-3">{record.document_type}</td>
                        <td className="px-4 py-3">
                          {formatDate(record.expiry_date)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getBadgeVariant(band)}
                            className={cn(getBadgeClasses(band))}
                          >
                            {record.days_remaining} days
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/matters/${record.matter_id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {record.matter_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/matters/${record.matter_id}`}>
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
