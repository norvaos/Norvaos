'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { MattersByPAData } from '@/lib/queries/reports'

interface Props {
  data: MattersByPAData[]
}

export default function MattersByPAChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No active matters with a practice area.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="practice_area_name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          label={({ name, value }) => `${name} (${value})`}
          labelLine={{ strokeWidth: 1 }}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.practice_area_color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [Number(value), 'Matters']}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
