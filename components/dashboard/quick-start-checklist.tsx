'use client'

import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, UserCog, Target, Landmark, Scale } from 'lucide-react'
import Link from 'next/link'

interface ChecklistItem {
  id: string
  title: string
  description: string
  href: string
  icon: React.ElementType
  isComplete: boolean
}

export function QuickStartChecklist({
  hasContacts,
  hasTrustAccount,
}: {
  hasContacts: boolean
  hasTrustAccount: boolean
}) {
  const { appUser } = useUser()
  const { tenant } = useTenant()

  const hasProfile = !!(appUser?.first_name && appUser?.last_name && tenant?.name)

  const items: ChecklistItem[] = [
    {
      id: 'profile',
      title: 'Complete your profile',
      description: 'Add your name and verify your firm details.',
      href: '/settings/profile',
      icon: UserCog,
      isComplete: hasProfile,
    },
    {
      id: 'contact',
      title: 'Create your first contact',
      description: 'Add a client or lead to start building your practice.',
      href: '/contacts',
      icon: Target,
      isComplete: hasContacts,
    },
    {
      id: 'trust',
      title: 'Configure trust accounting',
      description: 'Set up your trust bank account for Law Society compliance.',
      href: '/settings/trust-accounts',
      icon: Landmark,
      isComplete: hasTrustAccount,
    },
  ]

  const completedCount = items.filter((i) => i.isComplete).length
  const allDone = completedCount === items.length

  if (allDone) return null

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Scale className="size-5 text-primary" />
          <CardTitle className="text-base">Quick Start</CardTitle>
        </div>
        <CardDescription>
          {completedCount} of {items.length} steps complete — get your firm set up in minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              {item.isComplete ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/40" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${item.isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
