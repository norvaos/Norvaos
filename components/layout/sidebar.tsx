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
import { useUIStore } from '@/lib/stores/ui-store'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFeatureFlags } from '@/lib/hooks/use-feature-flag'

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
}

function NavItemButton({
  item,
  isActive,
  isCollapsed,
  featureFlags,
  onClick,
}: NavItemButtonProps) {
  const Icon = item.icon

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
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colours',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon className="size-5" />
      </span>

      {!isCollapsed && (
        <span className="truncate transition-opacity duration-200">
          {item.title}
        </span>
      )}

      {!isCollapsed && item.comingSoon && (
        <Lock className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
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
            {item.title}
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
  const Icon = item.icon
  const children = item.children ?? []

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
          <span className="mb-1 text-xs font-medium text-muted-foreground">{item.title}</span>
          {children.map((child) => {
            const ChildIcon = child.icon
            const active = isNavItemActive(child.href, pathname)
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
                {child.title}
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
          'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colours',
          anyChildActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon className="size-5" />
        </span>
        <span className="truncate">{item.title}</span>
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
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const { appUser, fullName } = useUser()
  const { tenant } = useTenant()
  const featureFlags = useFeatureFlags()

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          'sticky top-0 z-30 flex h-screen flex-col border-r border-[#e2e8f0] bg-white transition-all duration-300',
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
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
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="size-4" />
                ) : (
                  <ChevronLeft className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Navigation                                                       */}
        {/* ---------------------------------------------------------------- */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <nav
            className={cn(
              'flex flex-col gap-6 py-4',
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
                <div key={section.title} className="flex flex-col gap-1">
                  {/* Section title -- hidden when collapsed */}
                  {!sidebarCollapsed && (
                    <span className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      {section.title}
                    </span>
                  )}

                  {visibleItems.map((item) =>
                    item.children && item.children.length > 0 ? (
                      <NavDropdown
                        key={item.title}
                        item={item}
                        pathname={pathname}
                        isCollapsed={sidebarCollapsed}
                        featureFlags={featureFlags}
                      />
                    ) : (
                      <NavItemButton
                        key={item.href}
                        item={item}
                        isActive={isNavItemActive(item.href, pathname)}
                        isCollapsed={sidebarCollapsed}
                        featureFlags={featureFlags}
                      />
                    )
                  )}
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
            <Avatar size="default" className="shrink-0">
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
                  aria-label="Log out"
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Log out
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
