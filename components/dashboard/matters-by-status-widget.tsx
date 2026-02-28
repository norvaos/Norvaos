'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MATTER_STATUSES } from '@/lib/utils/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'

// Hoist constant style outside component to avoid re-creation
const tooltipStyle = {
  borderRadius: '8px',
  border: '1px solid hsl(var(--border))',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  fontSize: '12px',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tooltipFormatter = (value: any, name: any) => [String(value), String(name)]

function useMattersByStatus(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'matters-by-status', tenantId],
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('matters')
        .select('status')
        .eq('tenant_id', tenantId)

      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.status] = (counts[row.status] || 0) + 1
      }

      return MATTER_STATUSES
        .map((ms) => ({
          name: ms.label,
          value: counts[ms.value] ?? 0,
          color: ms.color,
          status: ms.value,
        }))
        .filter((r) => r.value > 0)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

export default function MattersByStatusWidget({ tenantId }: { tenantId: string }) {
  const { data: statusData, isLoading } = useMattersByStatus(tenantId)

  const total = useMemo(
    () => statusData?.reduce((sum, s) => sum + s.value, 0) ?? 0,
    [statusData]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Matters by Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
        ) : !statusData || statusData.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No matters yet"
            description="Create your first matter to see the breakdown here."
          />
        ) : (
          <div>
            <div className="mx-auto" style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={tooltipFormatter}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {statusData.map((item) => (
                <div key={item.status} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                  <span className="ml-auto font-medium">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t pt-3 text-center text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span> total matters
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
