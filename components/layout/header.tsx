'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUIStore } from '@/lib/stores/ui-store'
import { useEnabledPracticeAreas } from '@/lib/queries/practice-areas'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Menu,
  Search,
  Settings,
  User,
  LogOut,
  Layers,
  ChevronDown,
  X,
} from 'lucide-react'
import { NotificationBell } from '@/components/layout/notification-bell'

/**
 * Maps a pathname to a human-readable page title.
 * Falls back to a capitalised version of the last path segment.
 */
function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/contacts': 'Contacts',
    '/matters': 'Matters',
    '/leads': 'Leads',
    '/tasks': 'Tasks',
    '/calendar': 'Calendar',
    '/documents': 'Documents',
    '/communications': 'Communications',
    '/chat': 'Chat',
    '/billing': 'Billing',
    '/reports': 'Reports',
    '/marketing': 'Marketing',
    '/settings': 'Settings',
    '/settings/profile': 'Profile',
    '/settings/firm': 'Firm Settings',
    '/settings/users': 'Users',
    '/settings/roles': 'Roles',
    '/settings/practice-areas': 'Practice Areas',
    '/settings/pipelines': 'Pipelines',
    '/settings/custom-fields': 'Custom Fields',
    '/settings/integrations': 'Integrations',
    '/settings/automations': 'Automations',
    '/settings/forms': 'Intake Forms',
    '/settings/billing-plan': 'Billing & Plan',
    '/settings/task-templates': 'Task Templates',
    '/settings/matter-types': 'Matter Types',
  }

  if (titles[pathname]) return titles[pathname]

  // Handle dynamic routes such as /contacts/[id] or /matters/[id]
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const parentTitle = titles[`/${segments[0]}`]
    if (parentTitle) return parentTitle
  }

  // Fallback: capitalise the last segment
  const last = segments[segments.length - 1] ?? 'Dashboard'
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}

function getUserInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }
  if (firstName) return firstName[0].toUpperCase()
  return email[0].toUpperCase()
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { appUser, fullName } = useUser()
  const { tenant } = useTenant()
  const setSidebarMobileOpen = useUIStore((s) => s.setSidebarMobileOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const activePracticeFilter = useUIStore((s) => s.activePracticeFilter)
  const storedColor = useUIStore((s) => s.activePracticeColor)
  const storedName = useUIStore((s) => s.activePracticeName)
  const setActivePracticeFilter = useUIStore((s) => s.setActivePracticeFilter)

  const pageTitle = getPageTitle(pathname)

  const { data: practiceAreas } = useEnabledPracticeAreas(tenant?.id)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  /**
   * Persist the practice filter preference to the user's profile so it
   * survives across devices. Fire-and-forget; local store is the source
   * of truth for immediate UI updates.
   *
   * Also keeps the <html> data-attributes and CSS custom properties in sync
   * so the blocking script's initial paint state stays consistent across
   * subsequent page loads.
   */
  async function handlePracticeFilterChange(value: string, color?: string, name?: string) {
    setActivePracticeFilter(value, color, name)

    if (!appUser?.id) return
    try {
      const supabase = createClient()
      await supabase
        .from('users')
        .update({ practice_filter_preference: value })
        .eq('id', appUser.id)
    } catch {
      // Non-blocking; local store already updated
    }
  }

  // Resolve active practice area
  // isFiltered + accentColor use Zustand stored values first (instant from localStorage),
  // then refine from the query when available. This eliminates the flash on page load.
  const isFiltered = activePracticeFilter !== 'all'
  const activePracticeArea = practiceAreas?.find((pa) => pa.id === activePracticeFilter)
  const accentColor = activePracticeArea?.color ?? storedColor ?? undefined
  const accentName = activePracticeArea?.name ?? storedName ?? undefined

  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 bg-white px-4 lg:px-6 border-b"
    >
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarMobileOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>

      {/* Page title + active filter badge */}
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-semibold tracking-tight">{pageTitle}</h1>
        {isFiltered && accentName && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: accentColor ?? '#6b7280' }}
          >
            <span className="size-1.5 rounded-full bg-white/60" />
            {accentName}
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ─── Global Practice Area Switcher ─── */}
      {practiceAreas && practiceAreas.length > 0 && (
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 min-w-[160px] max-w-[220px] justify-between gap-2 border-l-[3px] font-medium text-sm"
                style={{
                  borderLeftColor: isFiltered && accentColor ? accentColor : 'transparent',
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  {isFiltered && accentName ? (
                    <>
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: accentColor ?? '#6b7280' }}
                      />
                      <span className="truncate">{accentName}</span>
                    </>
                  ) : (
                    <>
                      <Layers className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">All Practices</span>
                    </>
                  )}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[220px]">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Practice Area
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => handlePracticeFilterChange('all')}
                className="gap-2"
              >
                <Layers className="size-3.5 text-muted-foreground" />
                <span>All Practices</span>
                {!isFiltered && (
                  <span className="ml-auto text-xs text-muted-foreground">Active</span>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {practiceAreas.map((pa) => (
                <DropdownMenuItem
                  key={pa.id}
                  onClick={() => handlePracticeFilterChange(pa.id, pa.color, pa.name)}
                  className="gap-2"
                >
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: pa.color }}
                  />
                  <span>{pa.name}</span>
                  {activePracticeFilter === pa.id && (
                    <span className="ml-auto text-xs text-muted-foreground">Active</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick clear button when filtered */}
          {isFiltered && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => handlePracticeFilterChange('all')}
              aria-label="Clear practice area filter"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Search trigger */}
      <Button
        variant="outline"
        size="sm"
        className="hidden h-9 w-64 justify-start gap-2 text-muted-foreground sm:flex"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search className="size-4" />
        <span className="text-sm">Search everything...</span>
        <kbd className="ml-auto pointer-events-none hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </Button>

      {/* Condensed search for small screens */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open search"
      >
        <Search className="size-5" />
      </Button>

      {/* Notification bell */}
      <NotificationBell />

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full"
            aria-label="User menu"
          >
            <Avatar size="default">
              {appUser?.avatar_url && (
                <AvatarImage src={appUser.avatar_url} alt={fullName} />
              )}
              <AvatarFallback>
                {appUser
                  ? getUserInitials(appUser.first_name, appUser.last_name, appUser.email)
                  : '?'}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{fullName}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {appUser?.email ?? ''}
              </p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
              <User className="mr-2 size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/firm')}>
              <Settings className="mr-2 size-4" />
              Firm Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
