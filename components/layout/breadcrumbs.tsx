'use client'

import { Fragment, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { useI18n } from '@/lib/i18n/i18n-provider'

export function Breadcrumbs() {
  const pathname = usePathname()
  const { t } = useI18n()

  // Human-readable labels for route segments  -  uses t() for i18n
  const segmentLabels: Record<string, string> = useMemo(
    () => ({
      '': t('nav.home'),
      contacts: t('nav.contacts'),
      matters: t('nav.matters'),
      leads: t('nav.leads'),
      tasks: t('nav.tasks'),
      calendar: t('nav.calendar'),
      documents: t('nav.documents'),
      billing: t('nav.billing'),
      reports: t('nav.reports'),
      settings: t('nav.settings'),
      communications: t('nav.communications'),
      chat: t('nav.chat'),
      bookings: t('nav.bookings'),
      dashboards: t('nav.dashboards'),
      immigration: t('nav.immigration'),
      tools: t('nav.tools'),
      'visitor-visa-invitation': t('nav.visitor_visa_invitation'),
      'time-tracking': t('nav.time_tracking'),
      'practice-areas': t('nav.practice_areas'),
      'matter-types': t('nav.practice_areas'),
      'deadline-types': t('nav.deadline_types'),
      pipelines: t('nav.pipelines'),
      'workflow-templates': t('nav.workflow_templates'),
      'document-slot-templates': t('nav.document_slot_templates'),
      forms: t('nav.forms'),
      automations: t('nav.automations'),
      roles: t('nav.roles'),
      users: t('nav.users'),
      general: t('nav.general'),
    }),
    [t],
  )

  /**
   * Convert a route segment to a human-readable label.
   * Falls back to title-casing if no explicit mapping exists.
   */
  function segmentLabel(segment: string): string {
    if (segmentLabels[segment]) return segmentLabels[segment]
    // UUIDs  -  don't render
    if (/^[0-9a-f]{8}-/.test(segment)) return ''
    // Fallback: title-case with dashes replaced
    return segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

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
      // UUID segment  -  keep href building but skip rendering
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
