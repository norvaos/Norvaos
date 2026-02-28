import { Lock, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface ComingSoonProps {
  title: string
  description: string
  phase?: string
  icon?: LucideIcon
}

export function ComingSoon({ title, description, phase = 'a Future Phase', icon: Icon = Lock }: ComingSoonProps) {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Card className="max-w-md text-center">
        <CardContent className="pt-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Icon className="h-6 w-6 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
          <div className="mt-4 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Coming in {phase}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
