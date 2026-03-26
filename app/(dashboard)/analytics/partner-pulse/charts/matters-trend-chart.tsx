'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { MatterTrendData } from '@/lib/queries/reports'

interface Props {
  data: MatterTrendData[]
}

export default function MattersTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No trend data available.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ left: 10, right: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="opened"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Opened"
        />
        <Line
          type="monotone"
          dataKey="closed"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Closed"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
