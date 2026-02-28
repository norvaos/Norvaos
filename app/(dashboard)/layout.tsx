'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUIStore } from '@/lib/stores/ui-store'
import { navigation } from '@/lib/config/navigation'
import { Header } from '@/components/layout/header'
import { CommandPalette } from '@/components/layout/command-palette'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { APP_VERSION, BUILD_SHA } from '@/lib/config/version'
import { Scale, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react'
import type { NavItem } from '@/lib/config/navigation'

// ---------------------------------------------------------------------------
// Sidebar helpers
// ---------------------------------------------------------------------------

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

/** A single sidebar nav link */
function SidebarLink({
  item,
  pathname,
  collapsed,
  indent = false,
  onClick,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  indent?: boolean
  onClick?: () => void
}) {
  const isActive = isItemActive(item.href, pathname)
  const Icon = item.icon

  const link = (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        collapsed && 'justify-center px-0',
        indent && !collapsed && 'pl-7',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        item.comingSoon && 'opacity-50'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.title}</span>}
      {!collapsed && item.comingSoon && (
        <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/60">
          Soon
        </span>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">
          {item.title}
          {item.comingSoon && ' (Coming Soon)'}
        </TooltipContent>
      </Tooltip>
    )
  }

  return <div key={item.href}>{link}</div>
}

/** A collapsible dropdown nav item with children */
function SidebarDropdown({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
}) {
  const children = item.children ?? []
  const Icon = item.icon
  const anyChildActive = children.some((child) => isItemActive(child.href, pathname))
  const [open, setOpen] = useState(anyChildActive)

  // Collapsed: show icon, flyout tooltip with child links
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'flex items-center justify-center rounded-md px-0 py-1.5 text-sm transition-colors',
              anyChildActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            <Icon className="size-4 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="flex flex-col gap-1 p-2">
          <span className="mb-0.5 text-xs font-semibold text-muted-foreground">{item.title}</span>
          {children.map((child) => {
            const ChildIcon = child.icon
            const active = isItemActive(child.href, pathname)
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors',
                  active ? 'font-medium text-primary' : 'hover:bg-muted'
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

  // Expanded: accordion
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          anyChildActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.title}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-3.5 shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {children.map((child) => (
            <SidebarLink
              key={child.href}
              item={child}
              pathname={pathname}
              collapsed={false}
              indent
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

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      {/* Logo / brand */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <Scale className="size-6 shrink-0 text-sidebar-primary" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">NorvaOS</span>
        )}
      </div>

      {/* Navigation sections */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {navigation.map((section) => (
            <div key={section.title} className="mb-2">
              {!collapsed && (
                <span className="mb-1 block px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {section.title}
                </span>
              )}
              {collapsed && <Separator className="my-1 bg-sidebar-border" />}
              {section.items.map((item) =>
                item.children && item.children.length > 0 ? (
                  <SidebarDropdown
                    key={item.title}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                  />
                ) : (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                  />
                )
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </div>
  )
}

function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  // Once Zustand's persist middleware has rehydrated from localStorage,
  // remove the pre-hydration CSS overrides (data-attributes set by the
  // blocking <script> in <head>) so React + Tailwind take full control.
  useEffect(() => {
    const cleanup = () => {
      document.documentElement.removeAttribute('data-sidebar-collapsed')
      document.documentElement.removeAttribute('data-pa-filtered')
      document.documentElement.removeAttribute('data-pa-name')
      document.documentElement.style.removeProperty('--pa-color')
    }
    // Zustand persist may have already finished by the time this effect runs
    if (useUIStore.persist.hasHydrated()) {
      cleanup()
    }
    const unsub = useUIStore.persist.onFinishHydration(cleanup)
    return unsub
  }, [])

  return (
    <aside
      data-sidebar
      suppressHydrationWarning
      className={cn(
        'hidden lg:flex lg:flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-in-out',
        collapsed ? 'lg:w-[68px]' : 'lg:w-60'
      )}
    >
      <SidebarContent collapsed={collapsed} />

      {/* Collapse toggle + version */}
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
        {!collapsed && (
          <div className="mt-1 px-2 text-center">
            <span className="text-[10px] text-sidebar-foreground/40" title={`Build: ${BUILD_SHA}`}>
              v{APP_VERSION}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Mobile Navigation
// ---------------------------------------------------------------------------

function MobileNav() {
  const open = useUIStore((s) => s.sidebarMobileOpen)
  const setOpen = useUIStore((s) => s.setSidebarMobileOpen)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
        <SheetHeader className="border-b border-sidebar-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
            <Scale className="size-5 text-sidebar-primary" />
            NorvaOS
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="flex flex-col gap-1 p-2">
            {navigation.map((section) => (
              <div key={section.title} className="mb-2">
                <span className="mb-1 block px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {section.title}
                </span>
                {section.items.map((item) =>
                  item.children && item.children.length > 0 ? (
                    <SidebarDropdown
                      key={item.title}
                      item={item}
                      pathname={pathname}
                      collapsed={false}
                    />
                  ) : (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={false}
                      onClick={() => setOpen(false)}
                    />
                  )
                )}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (desktop only) */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Mobile navigation sheet */}
      <MobileNav />

      {/* Command palette overlay */}
      <CommandPalette />
    </div>
  )
}
