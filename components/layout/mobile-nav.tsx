'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Lock, LogOut, Menu } from 'lucide-react'

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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

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
// Mobile nav item
// ---------------------------------------------------------------------------

interface MobileNavItemProps {
  item: NavItem
  isActive: boolean
  featureFlags: Record<string, boolean>
  onNavigate: () => void
}

function MobileNavItem({
  item,
  isActive,
  featureFlags,
  onNavigate,
}: MobileNavItemProps) {
  const Icon = item.icon

  // Hide items that require a feature flag that is not enabled.
  if (item.featureFlag && !featureFlags[item.featureFlag]) {
    return null
  }

  const href = item.comingSoon ? '/coming-soon' : item.href

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colours',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon className="size-5" />
      </span>

      <span className="truncate">{item.title}</span>

      {item.comingSoon && (
        <Lock className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
      )}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Mobile navigation trigger (hamburger button)
// ---------------------------------------------------------------------------

export function MobileNavTrigger() {
  const setSidebarMobileOpen = useUIStore((s) => s.setSidebarMobileOpen)

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={() => setSidebarMobileOpen(true)}
      aria-label="Open navigation"
    >
      <Menu className="size-5" />
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Mobile navigation sheet
// ---------------------------------------------------------------------------

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()

  const sidebarMobileOpen = useUIStore((s) => s.sidebarMobileOpen)
  const setSidebarMobileOpen = useUIStore((s) => s.setSidebarMobileOpen)

  const { appUser, fullName } = useUser()
  const { tenant } = useTenant()
  const featureFlags = useFeatureFlags()

  const closeSheet = useCallback(() => {
    setSidebarMobileOpen(false)
  }, [setSidebarMobileOpen])

  const handleLogout = useCallback(async () => {
    closeSheet()
    await fetch('/auth/signout', { method: 'POST' })
    window.location.href = '/'
  }, [closeSheet])

  return (
    <Sheet open={sidebarMobileOpen} onOpenChange={setSidebarMobileOpen}>
      <SheetContent side="left" className="w-72 p-0">
        {/* -------------------------------------------------------------- */}
        {/* Brand header                                                    */}
        {/* -------------------------------------------------------------- */}
        <SheetHeader className="flex h-16 flex-row items-center gap-2.5 border-b border-[#e2e8f0] px-4">
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
          <SheetTitle className="truncate text-base font-semibold">
            {tenant?.name ?? 'NorvaOS'}
          </SheetTitle>
        </SheetHeader>

        {/* -------------------------------------------------------------- */}
        {/* Navigation sections                                             */}
        {/* -------------------------------------------------------------- */}
        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-6 px-3 py-4">
            {navigation.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.featureFlag || featureFlags[item.featureFlag]
              )

              if (visibleItems.length === 0) return null

              return (
                <div key={section.title} className="flex flex-col gap-1">
                  <span className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {section.title}
                  </span>

                  {visibleItems.map((item) => (
                    <MobileNavItem
                      key={item.href}
                      item={item}
                      isActive={isNavItemActive(item.href, pathname)}
                      featureFlags={featureFlags}
                      onNavigate={closeSheet}
                    />
                  ))}
                </div>
              )
            })}
          </nav>
        </ScrollArea>

        {/* -------------------------------------------------------------- */}
        {/* Footer -- user info & logout                                    */}
        {/* -------------------------------------------------------------- */}
        <div className="mt-auto shrink-0">
          <Separator />
          <div className="flex items-center gap-3 p-4">
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

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
