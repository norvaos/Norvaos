'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

// Human-readable labels for route segments
const SEGMENT_LABELS: Record<string, string> = {
  '': 'Home',
  contacts: 'Contacts',
  matters: 'Matters',
  leads: 'Leads',
  tasks: 'Tasks',
  calendar: 'Calendar',
  documents: 'Documents',
  billing: 'Billing',
  reports: 'Reports',
  settings: 'Settings',
  communications: 'Email',
  chat: 'Chat',
  bookings: 'Bookings',
  dashboards: 'Dashboards',
  immigration: 'Immigration',
  tools: 'Tools',
  'visitor-visa-invitation': 'Visa Invitation',
  'time-tracking': 'Time Tracking',
  'practice-areas': 'Practice Areas & Matter Types',
  'matter-types': 'Practice Areas & Matter Types',
  'deadline-types': 'Deadline Types',
  pipelines: 'Pipelines',
  'workflow-templates': 'Workflow Templates',
  'document-slot-templates': 'Document Slots',
  forms: 'Forms',
  automations: 'Automations',
  roles: 'Roles',
  users: 'Users',
  general: 'General',
}

/**
 * Convert a route segment to a human-readable label.
 * Falls back to title-casing if no explicit mapping exists.
 */
function segmentLabel(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  // UUIDs — don't render
  if (/^[0-9a-f]{8}-/.test(segment)) return ''
  // Fallback: title-case with dashes replaced
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Breadcrumbs() {
  const pathname = usePathname()

  // Don't show breadcrumbs on the root dashboard
  if (pathname === '/' || pathname === '') return null

  const segments = pathname.split('/').filter(Boolean)

  // Build crumbs: [{ label, href }]
  const crumbs: { label: string; href: string }[] = []
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    const label = segmentLabel(segment)
    if (!label) {
      // UUID segment — keep href building but skip rendering
      continue
    }
    crumbs.push({ label, href: currentPath })
  }

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link
        href="/"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="size-3.5" />
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <Fragment key={crumb.href}>
            <ChevronRight className="size-3 text-muted-foreground/50" />
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors truncate max-w-[200px]"
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
