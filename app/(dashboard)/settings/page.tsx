'use client'

import Link from 'next/link'
import {
  User,
  Building2,
  Users,
  Shield,
  Layers,
  GitBranch,
  Briefcase,
  SlidersHorizontal,
  Plug,
  Zap,
  FileInput,
  CreditCard,
  ListChecks,
  FileCheck,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsCard {
  title: string
  description: string
  href: string
  icon: React.ElementType
  color: string
}

const settingsCards: { section: string; items: SettingsCard[] }[] = [
  {
    section: 'General',
    items: [
      {
        title: 'Profile',
        description: 'Your personal account settings',
        href: '/settings/profile',
        icon: User,
        color: 'text-blue-600 bg-blue-50',
      },
      {
        title: 'Firm Settings',
        description: 'Firm name, address, and branding',
        href: '/settings/firm',
        icon: Building2,
        color: 'text-indigo-600 bg-indigo-50',
      },
      {
        title: 'Users',
        description: 'Manage team members and invitations',
        href: '/settings/users',
        icon: Users,
        color: 'text-violet-600 bg-violet-50',
      },
      {
        title: 'Roles',
        description: 'Permissions and access control',
        href: '/settings/roles',
        icon: Shield,
        color: 'text-purple-600 bg-purple-50',
      },
    ],
  },
  {
    section: 'Practice',
    items: [
      {
        title: 'Practice Areas',
        description: 'Configure areas of law your firm handles',
        href: '/settings/practice-areas',
        icon: Layers,
        color: 'text-emerald-600 bg-emerald-50',
      },
      {
        title: 'Matter Types',
        description: 'Matter types, pipelines, and workflow stages',
        href: '/settings/matter-types',
        icon: Briefcase,
        color: 'text-teal-600 bg-teal-50',
      },
      {
        title: 'Deadline Types',
        description: 'Configure deadline categories and auto-calculation rules',
        href: '/settings/deadline-types',
        icon: Clock,
        color: 'text-red-600 bg-red-50',
      },
      {
        title: 'Pipelines',
        description: 'Lead and matter pipeline stages',
        href: '/settings/pipelines',
        icon: GitBranch,
        color: 'text-cyan-600 bg-cyan-50',
      },
      {
        title: 'Task Templates',
        description: 'Reusable task lists and checklists',
        href: '/settings/task-templates',
        icon: ListChecks,
        color: 'text-sky-600 bg-sky-50',
      },
      {
        title: 'Document Templates',
        description: 'Required documents per immigration case type',
        href: '/settings/document-templates',
        icon: FileCheck,
        color: 'text-green-600 bg-green-50',
      },
      {
        title: 'Workflow Templates',
        description: 'Auto-create tasks on stage transitions',
        href: '/settings/workflow-templates',
        icon: Zap,
        color: 'text-yellow-600 bg-yellow-50',
      },
    ],
  },
  {
    section: 'Advanced',
    items: [
      {
        title: 'Custom Fields',
        description: 'Add custom data fields to your records',
        href: '/settings/custom-fields',
        icon: SlidersHorizontal,
        color: 'text-amber-600 bg-amber-50',
      },
      {
        title: 'Automations',
        description: 'Workflow rules and automated actions',
        href: '/settings/automations',
        icon: Zap,
        color: 'text-orange-600 bg-orange-50',
      },
      {
        title: 'Integrations',
        description: 'Connect third-party tools and services',
        href: '/settings/integrations',
        icon: Plug,
        color: 'text-rose-600 bg-rose-50',
      },
      {
        title: 'Intake Forms',
        description: 'Build intake forms and share public links',
        href: '/settings/forms',
        icon: FileInput,
        color: 'text-pink-600 bg-pink-50',
      },
      {
        title: 'Billing & Plan',
        description: 'Subscription, invoices, and payment',
        href: '/settings/billing-plan',
        icon: CreditCard,
        color: 'text-slate-600 bg-slate-100',
      },
    ],
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your firm settings, users, and preferences.
        </p>
      </div>

      {settingsCards.map((group) => (
        <div key={group.section}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            {group.section}
          </h2>
          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 min-[900px]:grid-cols-3 gap-3">
            {group.items.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex items-start gap-3 rounded-lg border bg-white p-4 transition-all hover:shadow-sm hover:border-slate-300"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      card.color
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 group-hover:text-primary transition-colors">
                      {card.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
