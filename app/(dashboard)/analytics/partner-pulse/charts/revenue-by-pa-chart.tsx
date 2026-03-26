'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import type { RevenueByPAData } from '@/lib/queries/reports'

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

interface Props {
  data: RevenueByPAData[]
}

export default function RevenueByPAChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No revenue data for this period.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => fmtCurrency(v)}
        />
        <YAxis
          type="category"
          dataKey="practice_area_name"
          width={120}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value) => [fmtCurrency(Number(value)), 'Revenue']}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="total_billed" name="Revenue" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.practice_area_color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
