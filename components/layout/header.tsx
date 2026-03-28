'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUIStore } from '@/lib/stores/ui-store'
import { useEnabledPracticeAreas } from '@/lib/queries/practice-areas'
import { useMatter } from '@/lib/queries/matters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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
  BookOpen,
} from 'lucide-react'
import { useState } from 'react'
import { useTour } from '@/components/onboarding/compliance-onboarding-tour'
import { NotificationBell } from '@/components/layout/notification-bell'
import { UniversalGlobeSelector } from '@/components/i18n/UniversalGlobeSelector'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { resolveRegulatoryBody } from '@/lib/config/jurisdictions'
import {
  ComplianceDiagnosticModal,
  calculateComplianceScore,
  resolveTier,
} from '@/components/layout/compliance-diagnostic-modal'

/**
 * Maps a pathname to a human-readable page title.
 * Falls back to a capitalised version of the last path segment.
 */
function getPageTitle(pathname: string, t: (key: any) => string): string {
  const titles: Record<string, string> = {
    '/': t('nav.dashboard'),
    '/contacts': t('nav.contacts'),
    '/matters': t('nav.matters'),
    '/leads': t('nav.leads'),
    '/tasks': t('nav.tasks'),
    '/calendar': t('nav.calendar'),
    '/documents': t('nav.documents'),
    '/communications': t('nav.communications'),
    '/chat': 'Chat',
    '/billing': t('nav.billing'),
    '/reports': t('nav.reports'),
    '/marketing': 'Marketing',
    '/settings': t('nav.settings'),
    '/settings/profile': t('header.profile' as any),
    '/settings/firm': t('header.firm_settings' as any),
    '/settings/users': t('nav.users_roles' as any),
    '/settings/roles': 'Roles',
    '/settings/practice-areas': t('header.practice_areas_matter_types' as any),
    '/settings/pipelines': t('header.pipelines' as any),
    '/settings/custom-fields': t('header.custom_fields' as any),
    '/settings/integrations': t('nav.integrations'),
    '/settings/automations': t('header.automations' as any),
    '/settings/forms': t('header.intake_forms' as any),
    '/settings/billing-plan': t('header.billing_plan' as any),
    '/settings/task-templates': t('header.task_templates' as any),
    '/settings/matter-types': t('header.practice_areas_matter_types' as any),
  }

  if (titles[pathname]) return titles[pathname]

  // Handle dynamic routes such as /contacts/[id] or /matters/[id]
  const segments = pathname.split('/').filter(Boolean)

  // Command Centre routes: /command/lead/[id] or /command/matter/[id]
  if (segments[0] === 'command') {
    if (segments[1] === 'lead') return t('header.command_centre' as any)
    if (segments[1] === 'matter') return t('header.command_centre' as any)
    return t('header.command_centre' as any)
  }

  if (segments.length >= 2) {
    const parentTitle = titles[`/${segments[0]}`]
    if (parentTitle) return parentTitle
  }

  // Fallback: capitalise the last segment (skip UUIDs)
  const last = segments[segments.length - 1] ?? t('nav.dashboard')
  // If the last segment looks like a UUID, use the parent segment instead
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last)) {
    const parent = segments[segments.length - 2]
    if (parent) return parent.charAt(0).toUpperCase() + parent.slice(1).replace(/-/g, ' ')
    return t('nav.dashboard')
  }
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
  const { locale, setLocale, t } = useI18n()

  const [diagnosticOpen, setDiagnosticOpen] = useState(false)
  const { startTour } = useTour()

  // ── Firm Compliance Score  -  5-tier Risk Spectrum (Directive 41.2) ────
  const regBody = resolveRegulatoryBody(tenant?.home_province ?? null)
  const { score: firmScore } = calculateComplianceScore({
    home_province: tenant?.home_province ?? null,
    address_line1: tenant?.address_line1 ?? null,
    city: tenant?.city ?? null,
    province: tenant?.province ?? null,
    postal_code: tenant?.postal_code ?? null,
    office_phone: tenant?.office_phone ?? null,
    office_fax: tenant?.office_fax ?? null,
    regBody,
  })
  const firmTier = resolveTier(firmScore)
  const FirmTierIcon = firmTier.icon

  const pageTitle = getPageTitle(pathname, t)

  // ─── Matter context: show title + status when viewing a matter ──
  const matterIdMatch = pathname.match(/^\/matters\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)
  const matterId = matterIdMatch?.[1] ?? ''
  const { data: matterContext } = useMatter(matterId)

  const { data: practiceAreas } = useEnabledPracticeAreas(tenant?.id)

  async function handleSignOut() {
    await fetch('/auth/signout', { method: 'POST' })
    window.location.href = '/'
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
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 bg-background px-4 lg:px-6 border-b"
    >
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarMobileOpen(true)}
        aria-label={t('header.open_nav' as any)}
      >
        <Menu className="size-5" />
      </Button>

      {/* Page title + matter context + active filter badge */}
      <div className="flex items-center gap-2.5 min-w-0">
        {matterContext ? (
          <>
            <h1 className="text-lg font-semibold tracking-tight truncate max-w-[300px]">
              {matterContext.title}
            </h1>
            <Badge
              className={cn(
                'shrink-0 text-[10px]',
                matterContext.status === 'active' && 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/40',
                matterContext.status === 'on_hold' && 'bg-amber-100 text-amber-400 hover:bg-amber-100',
                matterContext.status === 'closed_won' && 'bg-slate-100 text-slate-600 hover:bg-slate-100',
                matterContext.status === 'closed_lost' && 'bg-red-100 text-red-600 hover:bg-red-100',
                matterContext.status === 'closed_withdrawn' && 'bg-slate-100 text-slate-500 hover:bg-slate-100',
              )}
            >
              {(matterContext.status ?? 'active').replace(/_/g, ' ')}
            </Badge>
            {/* Trust balance indicator */}
            {matterContext.trust_balance !== null && matterContext.trust_balance !== undefined && (
              (() => {
                const bal = matterContext.trust_balance ?? 0
                if (bal > 500) return null // Hidden when healthy
                const isZero = bal <= 0
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'size-2.5 shrink-0 rounded-full',
                          isZero ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
                        )}
                        aria-label={isZero ? t('header.trust_zero' as any) : t('header.trust_low' as any)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {isZero
                        ? t('header.trust_zero' as any)
                        : t('header.trust_low' as any)}
                    </TooltipContent>
                  </Tooltip>
                )
              })()
            )}
          </>
        ) : (
          <h1 className="text-lg font-semibold tracking-tight">{pageTitle}</h1>
        )}
        {isFiltered && accentName && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white shrink-0"
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
                      <span className="text-muted-foreground">{t('header.all_practices' as any)}</span>
                    </>
                  )}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[220px]">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {t('header.practice_area' as any)}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => handlePracticeFilterChange('all')}
                className="gap-2"
              >
                <Layers className="size-3.5 text-muted-foreground" />
                <span>{t('header.all_practices' as any)}</span>
                {!isFiltered && (
                  <span className="ml-auto text-xs text-muted-foreground">{t('header.active' as any)}</span>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {practiceAreas.map((pa) => (
                <DropdownMenuItem
                  key={pa.id}
                  onClick={() => handlePracticeFilterChange(pa.id, pa.color ?? undefined, pa.name)}
                  className="gap-2"
                >
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: pa.color ?? undefined }}
                  />
                  <span>{pa.name}</span>
                  {activePracticeFilter === pa.id && (
                    <span className="ml-auto text-xs text-muted-foreground">{t('header.active' as any)}</span>
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
        <span className="text-sm">{t('header.search_placeholder' as any)}</span>
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
        aria-label={t('header.open_search' as any)}
      >
        <Search className="size-5" />
      </Button>

      {/* Universal Globe  -  admin en/fr, client Global 15 (Directive 0.0) */}
      <UniversalGlobeSelector
        value={locale}
        onChange={(code) => setLocale(code as import('@/lib/i18n/config').LocaleCode)}
        audience="admin"
        compact
        className="inline-flex"
      />

      {/* Notification bell */}
      <NotificationBell />

      {/* Compliance Tour replay */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-emerald-600"
            onClick={startTour}
            aria-label="Replay compliance tour"
          >
            <BookOpen className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Compliance Tour
        </TooltipContent>
      </Tooltip>

      {/* Firm Compliance Badge  -  5-tier Risk Spectrum (Directive 41.2) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setDiagnosticOpen(true)}
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer border tabular-nums',
              firmTier.badgeClass,
            )}
          >
            <FirmTierIcon className="size-3" />
            {regBody ? regBody.abbr : 'Setup'} {firmScore}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          <p className="font-semibold">{firmTier.label}  -  {firmTier.description}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{t('header.compliance_diagnostic' as any)}</p>
        </TooltipContent>
      </Tooltip>

      {/* Compliance Diagnostic Modal */}
      <ComplianceDiagnosticModal open={diagnosticOpen} onOpenChange={setDiagnosticOpen} />

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
              {t('header.profile' as any)}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/firm')}>
              <Settings className="mr-2 size-4" />
              {t('header.firm_settings' as any)}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            {t('header.sign_out' as any)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
