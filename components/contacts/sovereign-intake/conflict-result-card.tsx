'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Briefcase, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConflictContactCardProps {
  type: 'contact' | 'matter'
  name: string
  detail: string  // email for contacts, matter_number for matters
  status: string  // client_status for contacts, matter status for matters
  className?: string
}

export function ConflictResultCard({
  type,
  name,
  detail,
  status,
  className,
}: ConflictContactCardProps) {
  const isContact = type === 'contact'

  return (
    <Card
      className={cn(
        'border-amber-500/20 bg-amber-950/30/50 animate-in fade-in slide-in-from-bottom-2 duration-300',
        className
      )}
    >
      <CardContent className="py-2.5 px-3 flex items-center gap-3">
        <div
          className={cn(
            'size-8 rounded-full flex items-center justify-center shrink-0',
            'bg-amber-950/40 text-amber-600'
          )}
        >
          {isContact ? (
            <User className="size-3.5" />
          ) : (
            <Briefcase className="size-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-slate-800 truncate">{name}</p>
            <Badge
              variant="outline"
              className="text-[8px] shrink-0 border-amber-500/30 bg-amber-950/30 text-amber-400"
            >
              {isContact ? 'Existing Contact' : 'Active Matter'}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
        </div>
        <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
      </CardContent>
    </Card>
  )
}
