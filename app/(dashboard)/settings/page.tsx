'use client'

import Link from 'next/link'
import {
  User,
  Building2,
  Users,
  Shield,
  Layers,
  GitBranch,
  SlidersHorizontal,
  Plug,
  Zap,
  FileInput,
  CreditCard,
  ListChecks,
  FileText,
  Clock,
  Receipt,
  Bell,
  MonitorSmartphone,
  Upload,
  FileStack,
  Inbox,
  Key,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION, BUILD_SHA, CORE_ENFORCEMENT_SPEC_VERSION } from '@/lib/config/version'

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
        color: 'text-blue-600 bg-blue-950/30',
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
        color: 'text-purple-600 bg-purple-950/30',
      },
      {
        title: 'Notifications',
        description: 'Email, push, and in-app notification preferences',
        href: '/settings/notifications',
        icon: Bell,
        color: 'text-amber-600 bg-amber-950/30',
      },
      {
        title: 'Billing & Plan',
        description: 'Subscription, invoices, and payment',
        href: '/settings/billing-plan',
        icon: CreditCard,
        color: 'text-slate-600 bg-slate-100',
      },
      {
        title: 'Email Accounts',
        description: 'Manage personal and shared mailbox connections',
        href: '/settings/email-accounts',
        icon: Inbox,
        color: 'text-sky-600 bg-sky-50',
      },
      {
        title: 'Access Control',
        description: 'Supervision, delegations, and break-glass access',
        href: '/settings/access-control',
        icon: Key,
        color: 'text-red-600 bg-red-950/30',
      },
    ],
  },
  {
    section: 'Practice',
    items: [
      {
        title: 'Practice Areas & Matter Types',
        description: 'Configure practice areas, matter types, pipelines, and workflow stages',
        href: '/settings/matter-types',
        icon: Layers,
        color: 'text-emerald-600 bg-emerald-950/30',
      },
      {
        title: 'Pipelines',
        description: 'Lead and matter pipeline stages',
        href: '/settings/pipelines',
        icon: GitBranch,
        color: 'text-cyan-600 bg-cyan-50',
      },
      {
        title: 'Deadline Types',
        description: 'Deadline categories and auto-calculation rules',
        href: '/settings/deadline-types',
        icon: Clock,
        color: 'text-red-600 bg-red-950/30',
      },
      {
        title: 'Templates',
        description: 'Reusable task lists and workflow automation rules for stage transitions',
        href: '/settings/task-templates',
        icon: ListChecks,
        color: 'text-sky-600 bg-sky-50',
      },
      {
        title: 'Document Settings',
        description: 'Required documents per case type and auto-generation of retainer and engagement letters',
        href: '/settings/document-templates',
        icon: FileText,
        color: 'text-violet-600 bg-violet-50',
      },
      {
        title: 'Forms & Document Library',
        description: 'Upload forms, manage required documents, map XFA fields, and sync IRCC form versions',
        href: '/settings/ircc-form-library',
        icon: FileStack,
        color: 'text-rose-600 bg-rose-50',
      },
      {
        title: 'Fees & Billing Presets',
        description: 'Services, government fees, disbursement presets, and default fee structures per matter type',
        href: '/settings/retainer-presets',
        icon: Receipt,
        color: 'text-lime-600 bg-lime-50',
      },
      {
        title: 'Fee Templates',
        description: 'Create and manage standardised fee structures for each matter type',
        href: '/settings/fee-templates',
        icon: CreditCard,
        color: 'text-green-600 bg-emerald-950/30',
      },
    ],
  },
  {
    section: 'Operations',
    items: [
      {
        title: 'Reception & Front Desk',
        description: 'Front desk zones, lobby kiosk, check-in languages, and visitor options',
        href: '/settings/front-desk',
        icon: MonitorSmartphone,
        color: 'text-teal-600 bg-teal-50',
      },
      {
        title: 'Data Import',
        description: 'Import data from Go High Level, Clio, or Officio',
        href: '/settings/data-import',
        icon: Upload,
        color: 'text-emerald-600 bg-emerald-950/30',
      },
      {
        title: 'Automation Rules',
        description: 'Post-submission document types and trigger configuration',
        href: '/settings/automation-rules',
        icon: Zap,
        color: 'text-orange-600 bg-orange-950/30',
      },
      {
        title: 'Expiry Reminders',
        description: 'Configure reminder timing rules for expiry dates',
        href: '/settings/expiry-reminders',
        icon: Bell,
        color: 'text-amber-600 bg-amber-950/30',
      },
    ],
  },
  {
    section: 'Platform',
    items: [
      {
        title: 'Custom Fields',
        description: 'Add custom data fields to your records',
        href: '/settings/custom-fields',
        icon: SlidersHorizontal,
        color: 'text-amber-600 bg-amber-950/30',
      },
      {
        title: 'Automations',
        description: 'Workflow rules and automated actions',
        href: '/settings/automations',
        icon: Zap,
        color: 'text-orange-600 bg-orange-950/30',
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
                  key={card.title}
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

      {/* System Info */}
      <div className="border-t pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          System Info
        </h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>App v{APP_VERSION}</span>
          <span>Build {BUILD_SHA}</span>
          <span>Enforcement Spec v{CORE_ENFORCEMENT_SPEC_VERSION}</span>
        </div>
      </div>
    </div>
  )
}
