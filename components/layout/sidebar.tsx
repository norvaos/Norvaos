'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  LogOut,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { navigation, type NavItem } from '@/lib/config/navigation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import type { DictionaryKey } from '@/lib/i18n/dictionaries/en'
import { useUIStore } from '@/lib/stores/ui-store'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFeatureFlags } from '@/lib/hooks/use-feature-flag'
import { usePrefetchOnHover } from '@/lib/hooks/use-prefetch-on-hover'
import { useFirmHealth } from '@/lib/hooks/use-firm-health'
import { useCertification } from '@/lib/hooks/use-certification'
import { matterKeys, MATTER_LIST_COLUMNS } from '@/lib/queries/matters'
import { contactKeys } from '@/lib/queries/contacts'
import { leadKeys } from '@/lib/queries/leads'
import { taskKeys } from '@/lib/queries/tasks'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Returns the user's initials from their first and last name.
 * Falls back to the first character of the email address.
 */
function getUserInitials(
  firstName: string | null,
  lastName: string | null,
  email: string
): string {
  if (firstName || lastName) {
    const first = firstName?.charAt(0) ?? ''
    const last = lastName?.charAt(0) ?? ''
    return `${first}${last}`.toUpperCase()
  }
  return email.charAt(0).toUpperCase()
}

/**
 * Determines whether a nav item is currently active based on the
 * browser pathname. The dashboard ("/") requires an exact match;
 * all other routes use a prefix match.
 */
function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NavItemButtonProps {
  item: NavItem
  isActive: boolean
  isCollapsed: boolean
  featureFlags: Record<string, boolean>
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

function NavItemButton({
  item,
  isActive,
  isCollapsed,
  featureFlags,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: NavItemButtonProps) {
  const { t } = useI18n()
  const Icon = item.icon
  const label = item.labelKey ? t(item.labelKey as DictionaryKey, item.title) : item.title

  // If the item has a feature flag requirement, check whether the flag is
  // enabled for the current tenant. Hidden items are not rendered at all.
  if (item.featureFlag && !featureFlags[item.featureFlag]) {
    return null
  }

  const href = item.comingSoon ? '/coming-soon' : item.href

  const content = (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colours',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed && 'justify-center px-0',
        item.deprecated && 'opacity-60'
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon className="size-5" />
      </span>

      {!isCollapsed && (
        <span className="truncate transition-opacity duration-200">
          {label}
        </span>
      )}

      {!isCollapsed && item.comingSoon && (
        <Lock className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
      )}

      {!isCollapsed && item.deprecated && (
        <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
          Legacy
        </span>
      )}
    </Link>
  )

  // In collapsed mode, wrap each item in a tooltip so the label is still
  // accessible on hover.
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <span className="flex items-center gap-1.5">
            {label}
            {item.comingSoon && <Lock className="size-3" />}
          </span>
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

// ---------------------------------------------------------------------------
// Collapsible nav item with children (dropdown)
// ---------------------------------------------------------------------------

interface NavDropdownProps {
  item: NavItem
  pathname: string
  isCollapsed: boolean
  featureFlags: Record<string, boolean>
}

function NavDropdown({ item, pathname, isCollapsed, featureFlags }: NavDropdownProps) {
  const { t } = useI18n()
  const Icon = item.icon
  const children = item.children ?? []
  const label = item.labelKey ? t(item.labelKey as DictionaryKey, item.title) : item.title

  // Auto-open when any child is active
  const anyChildActive = children.some((child) => isNavItemActive(child.href, pathname))
  const [open, setOpen] = useState(anyChildActive)

  // Collapsed mode: show parent icon with tooltip listing children
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'group relative flex items-center justify-center rounded-lg px-0 py-2 text-sm font-medium transition-colours',
              anyChildActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Icon className="size-5" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="flex flex-col gap-1 p-2">
          <span className="mb-1 text-xs font-medium text-muted-foreground">{label}</span>
          {children.map((child) => {
            const ChildIcon = child.icon
            const active = isNavItemActive(child.href, pathname)
            const childLabel = child.labelKey ? t(child.labelKey as DictionaryKey, child.title) : child.title
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors',
                  active ? 'text-primary font-medium' : 'text-foreground hover:bg-muted'
                )}
              >
                <ChildIcon className="size-3.5" />
                {childLabel}
              </Link>
            )
          })}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Expanded mode: accordion toggle
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colours',
          anyChildActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon className="size-5" />
        </span>
        <span className="truncate">{label}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {children.map((child) => (
            <NavItemButton
              key={child.href}
              item={child}
              isActive={isNavItemActive(child.href, pathname)}
              isCollapsed={false}
              featureFlags={featureFlags}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data prefetch helpers  -  warm the TanStack Query cache on hover
// ---------------------------------------------------------------------------

type PrefetchFn = (queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>) => void

/** Routes that benefit from TanStack Query cache warming on hover. */
const DATA_PREFETCH_ROUTES = new Set(['/matters', '/contacts', '/leads', '/tasks'])

/**
 * Builds a prefetchFn for a given nav href + tenantId.
 * Returns undefined for routes that don't benefit from data prefetching.
 */
function buildPrefetchFn(href: string, tenantId: string): PrefetchFn | undefined {
  const defaultParams = { tenantId }
  const staleTime = 1000 * 60 * 2 // 2 min  -  avoid re-fetching if data is fresh

  switch (href) {
    case '/matters':
      return (qc) => {
        const params = { ...defaultParams, page: 1, pageSize: 25, sortBy: 'created_at', sortDirection: 'desc' as const }
        qc.prefetchQuery({
          queryKey: matterKeys.list(params),
          queryFn: async () => {
            const supabase = createClient()
            const { data, count, error } = await supabase
              .from('matters')
              .select(MATTER_LIST_COLUMNS, { count: 'exact' })
              .eq('tenant_id', tenantId)
              .neq('status', 'archived')
              .neq('status', IMPORT_REVERTED_STATUS)
              .order('created_at', { ascending: false })
              .range(0, 24)
            if (error) throw error
            return { matters: data, totalCount: count ?? 0, page: 1, pageSize: 25, totalPages: Math.ceil((count ?? 0) / 25) }
          },
          staleTime,
        })
      }
    case '/contacts':
      return (qc) => {
        const params = { ...defaultParams, page: 1, pageSize: 25, sortBy: 'created_at', sortDirection: 'desc' as const }
        qc.prefetchQuery({
          queryKey: contactKeys.list(params),
          queryFn: async () => {
            const supabase = createClient()
            const { data, count, error } = await supabase
              .from('contacts')
              .select('id, tenant_id, first_name, last_name, email_primary, phone_primary, contact_type, source, organization_name, is_archived, created_at, created_by, preferred_name, job_title, city, province_state, country, last_contacted_at', { count: 'exact' })
              .eq('tenant_id', tenantId)
              .eq('is_archived', false)
              .order('created_at', { ascending: false })
              .range(0, 24)
            if (error) throw error
            return { contacts: data, totalCount: count ?? 0, page: 1, pageSize: 25, totalPages: Math.ceil((count ?? 0) / 25) }
          },
          staleTime,
        })
      }
    case '/leads':
      return (qc) => {
        const params = { ...defaultParams, page: 1, pageSize: 50, status: 'open', sortBy: 'created_at', sortDirection: 'desc' as const }
        qc.prefetchQuery({
          queryKey: leadKeys.list(params),
          queryFn: async () => {
            const supabase = createClient()
            const { data, count, error } = await supabase
              .from('leads')
              .select('id, tenant_id, contact_id, pipeline_id, stage_id, assigned_to, practice_area_id, status, temperature, source, estimated_value, next_follow_up, notes, stage_entered_at, created_at, updated_at', { count: 'exact' })
              .eq('tenant_id', tenantId)
              .eq('status', 'open')
              .order('created_at', { ascending: false })
              .range(0, 49)
            if (error) throw error
            return { leads: data, totalCount: count ?? 0, page: 1, pageSize: 50, totalPages: Math.ceil((count ?? 0) / 50) }
          },
          staleTime,
        })
      }
    case '/tasks':
      return (qc) => {
        const params = { ...defaultParams, page: 1, pageSize: 50, showCompleted: true, sortBy: 'due_date', sortDirection: 'asc' as const }
        qc.prefetchQuery({
          queryKey: taskKeys.list(params),
          queryFn: async () => {
            const supabase = createClient()
            const { data, count, error } = await supabase
              .from('tasks')
              .select('id, tenant_id, title, status, priority, due_date, due_time, assigned_to, matter_id, contact_id, created_at, task_type, category, is_billable, completed_at, is_deleted, parent_task_id, estimated_minutes', { count: 'exact' })
              .eq('tenant_id', tenantId)
              .eq('is_deleted', false)
              .order('due_date', { ascending: true, nullsFirst: false })
              .range(0, 49)
            if (error) throw error
            return { tasks: data, totalCount: count ?? 0, page: 1, pageSize: 50, totalPages: Math.ceil((count ?? 0) / 50) }
          },
          staleTime,
        })
      }
    default:
      return undefined
  }
}

/**
 * Wrapper around NavItemButton that adds TanStack Query data prefetching
 * via usePrefetchOnHover. Used for data-heavy nav items (matters, contacts,
 * leads, tasks) so the query cache is warm before the user navigates.
 */
function NavItemWithDataPrefetch({
  tenantId,
  routerPrefetch,
  ...props
}: NavItemButtonProps & { tenantId: string; routerPrefetch: () => void }) {
  const href = props.item.href
  const prefetchFn = useCallback<PrefetchFn>(
    (qc) => {
      const fn = buildPrefetchFn(href, tenantId)
      fn?.(qc)
    },
    [href, tenantId]
  )
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover(prefetchFn)

  return (
    <NavItemButton
      {...props}
      onMouseEnter={() => {
        routerPrefetch()
        onMouseEnter()
      }}
      onMouseLeave={onMouseLeave}
    />
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const { appUser, fullName } = useUser()
  const { tenant } = useTenant()
  const featureFlags = useFeatureFlags()
  const { shouldPulseAmber, riskLevel } = useFirmHealth()
  const { data: certification } = useCertification()
  const isCertified = certification?.isCertified ?? false

  const handleLogout = useCallback(async () => {
    await fetch('/auth/signout', { method: 'POST' })
    window.location.href = '/'
  }, [])

  /** Prefetch the Next.js page bundle + server data on hover */
  const handleNavPrefetch = useCallback(
    (href: string) => {
      router.prefetch(href)
    },
    [router]
  )

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          'sticky top-0 z-30 flex h-screen flex-col border-r border-[#e2e8f0] bg-white transition-all duration-300',
          sidebarCollapsed ? 'w-[72px]' : 'w-64',
          shouldPulseAmber && riskLevel === 'medium' && 'sovereign-pulse-amber',
          shouldPulseAmber && riskLevel === 'high' && 'sovereign-pulse-red',
        )}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Brand / Collapse toggle                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e2e8f0] px-4">
          {!sidebarCollapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {tenant?.logo_url ? (
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={28}
                  height={28}
                  className="size-7 shrink-0 rounded object-contain"
                />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
                  N
                </span>
              )}
              <span className="truncate text-base font-semibold text-foreground">
                {tenant?.name ?? 'NorvaOS'}
              </span>
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className={cn(
                  'size-8 shrink-0',
                  sidebarCollapsed && 'mx-auto'
                )}
                aria-label={sidebarCollapsed ? t('nav.expand_sidebar', 'Expand sidebar') : t('nav.collapse_sidebar', 'Collapse sidebar')}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="size-4" />
                ) : (
                  <ChevronLeft className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {sidebarCollapsed ? t('nav.expand_sidebar', 'Expand sidebar') : t('nav.collapse_sidebar', 'Collapse sidebar')}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Navigation                                                       */}
        {/* ---------------------------------------------------------------- */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <nav
            className={cn(
              'flex flex-col gap-4 py-3',
              sidebarCollapsed ? 'px-2' : 'px-3'
            )}
          >
            {navigation.map((section) => {
              // Filter items that are gated behind a feature flag that is not
              // enabled so we can skip rendering empty sections entirely.
              const visibleItems = section.items.filter(
                (item) => !item.featureFlag || featureFlags[item.featureFlag]
              )

              if (visibleItems.length === 0) return null

              return (
                <div key={section.title} className="flex flex-col gap-0.5">
                  {/* Section title -- hidden when collapsed */}
                  {!sidebarCollapsed && (
                    <span className="mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      {section.labelKey ? t(section.labelKey as DictionaryKey, section.title) : section.title}
                    </span>
                  )}

                  {visibleItems.map((item) => {
                    if (item.children && item.children.length > 0) {
                      return (
                        <NavDropdown
                          key={item.title}
                          item={item}
                          pathname={pathname}
                          isCollapsed={sidebarCollapsed}
                          featureFlags={featureFlags}
                        />
                      )
                    }

                    if (tenant?.id && DATA_PREFETCH_ROUTES.has(item.href)) {
                      return (
                        <NavItemWithDataPrefetch
                          key={item.href}
                          item={item}
                          isActive={isNavItemActive(item.href, pathname)}
                          isCollapsed={sidebarCollapsed}
                          featureFlags={featureFlags}
                          tenantId={tenant.id}
                          routerPrefetch={() => handleNavPrefetch(item.href)}
                        />
                      )
                    }

                    return (
                      <NavItemButton
                        key={item.href}
                        item={item}
                        isActive={isNavItemActive(item.href, pathname)}
                        isCollapsed={sidebarCollapsed}
                        featureFlags={featureFlags}
                        onMouseEnter={() => handleNavPrefetch(item.href)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </ScrollArea>

        {/* ---------------------------------------------------------------- */}
        {/* Footer -- user info & logout                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="shrink-0">
          <Separator />
          <div
            className={cn(
              'flex items-center gap-3 p-4',
              sidebarCollapsed && 'flex-col gap-2 px-2 py-3'
            )}
          >
            <Avatar
              size="default"
              className={cn(
                'shrink-0',
                isCertified && 'sovereign-certified-avatar',
              )}
            >
              {appUser?.avatar_url && (
                <AvatarImage src={appUser.avatar_url} alt={fullName} />
              )}
              <AvatarFallback>
                {appUser
                  ? getUserInitials(
                      appUser.first_name,
                      appUser.last_name,
                      appUser.email
                    )
                  : '?'}
              </AvatarFallback>
            </Avatar>

            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {fullName}
                </p>
                {appUser?.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {appUser.email}
                  </p>
                )}
              </div>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className={cn(
                    'size-8 shrink-0 text-muted-foreground hover:text-destructive',
                    sidebarCollapsed && 'mx-auto'
                  )}
                  aria-label={t('nav.log_out', 'Log out')}
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t('nav.log_out', 'Log out')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
