'use client'

import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Grid3X3,
  ShieldCheck,
  Activity,
  Crown,
  Loader2,
  ArrowLeft,
  Sun,
  Moon,
  Rocket,
  Satellite,
  Eye,
  Container,
} from 'lucide-react'

// ── Theme context ───────────────────────────────────────────────────────────

export const NexusThemeContext = createContext<boolean>(true)
export function useNexusDark(): boolean {
  return useContext(NexusThemeContext)
}

function useNexusTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem('nexus-theme')
    if (stored === 'light') setDark(false)
  }, [])
  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      localStorage.setItem('nexus-theme', next ? 'dark' : 'light')
      return next
    })
  }, [])
  return { dark, toggle }
}

// ── Tabs ────────────────────────────────────────────────────────────────────

const nexusTabs = [
  { title: 'Overview', href: '/nexus', icon: LayoutDashboard },
  { title: 'Firms', href: '/nexus/firms', icon: Building2 },
  { title: 'Features', href: '/nexus/features', icon: Grid3X3 },
  { title: 'Isolation', href: '/nexus/audit', icon: ShieldCheck },
  { title: 'Health', href: '/nexus/health', icon: Activity },
  { title: 'Launch', href: '/nexus/launch', icon: Rocket },
  { title: 'Sovereign', href: '/nexus/sovereign-control', icon: Satellite },
  { title: 'Releases', href: '/nexus/releases', icon: Container },
]

function isActive(href: string, pathname: string): boolean {
  if (href === '/nexus') return pathname === '/nexus'
  return pathname.startsWith(href)
}

// ── Layout ──────────────────────────────────────────────────────────────────

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { appUser, isLoading: userLoading } = useUser()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { dark, toggle } = useNexusTheme()

  // ── DB-level platform_admins check (Directive 076 hardening) ────────────
  // The API routes are protected by withNexusAdmin → requirePlatformAdmin.
  // This client-side check ensures the Nexus UI itself is only visible to
  // users in the `platform_admins` table, not just any logged-in user.
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: ['platform-admin-check', appUser?.auth_user_id],
    queryFn: async () => {
      if (!appUser?.auth_user_id) return false
      const supabase = createClient()
      const { data } = await supabase
        .from('platform_admins')
        .select('id')
        .eq('user_id', appUser.auth_user_id)
        .is('revoked_at', null)
        .maybeSingle()
      return !!data
    },
    enabled: !!appUser?.auth_user_id,
    staleTime: 1000 * 60 * 10, // 10 min  -  admin status rarely changes
  })

  const isLoading = userLoading || adminLoading

  useEffect(() => setMounted(true), [])

  if (isLoading || !mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0c0c0f]">
        <div className="flex flex-col items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <Crown className="h-7 w-7 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-amber-500/50" />
          <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/20">
            Initialising...
          </span>
        </div>
      </div>
    )
  }

  if (!appUser) {
    router.push('/login?redirect=/nexus')
    return null
  }

  // ── Deny non-admins (DB-verified) ──
  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0c0c0f]">
        <div className="flex flex-col items-center gap-6 text-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <ShieldCheck className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-sm text-white/40 max-w-sm">
              The Sovereign Control Center requires platform administrator privileges.
              Your access attempt has been logged.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-white/5 px-6 py-2.5 text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <NexusThemeContext.Provider value={dark}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        .nexus-root { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important; }
        .nexus-root .mono { font-family: 'JetBrains Mono', monospace !important; }
        .nexus-root ::selection { background: ${dark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)'}; color: ${dark ? '#fbbf24' : '#92400e'}; }
      `}</style>

      <div
        className={cn(
          'nexus-root flex h-screen flex-col overflow-hidden transition-colors duration-300',
          dark ? 'bg-[#0c0c0f] text-white' : 'bg-[#fafafa] text-gray-900',
        )}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header
          className={cn(
            'relative z-10 shrink-0 border-b',
            dark
              ? 'border-white/[0.06] bg-[#111114]/90 backdrop-blur-xl'
              : 'border-gray-200 bg-white/90 backdrop-blur-xl shadow-sm',
          )}
        >
          {/* Top bar */}
          <div className="flex h-[72px] items-center justify-between px-6 lg:px-8">
            {/* Left  -  Logo + title */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                  <Crown className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold tracking-tight', dark ? 'text-white' : 'text-gray-900')}>
                      NorvaOS
                    </span>
                    <span className={cn('text-sm font-medium', dark ? 'text-white/25' : 'text-gray-400')}>
                      /
                    </span>
                    <span className={cn('text-base font-semibold', dark ? 'text-amber-400/80' : 'text-amber-700')}>
                      Control Center
                    </span>
                  </div>
                  <span className={cn('mono text-xs tracking-wider', dark ? 'text-white/15' : 'text-gray-300')}>
                    Platform Administration
                  </span>
                </div>
              </div>

              <div className={cn('hidden md:block h-6 w-px mx-2', dark ? 'bg-white/[0.06]' : 'bg-gray-200')} />

              <Link
                href="/"
                className={cn(
                  'hidden md:flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  dark
                    ? 'text-white/25 hover:text-white/60 hover:bg-white/[0.04]'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
                )}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Exit to Dashboard
              </Link>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  dark
                    ? 'text-white/25 hover:text-amber-400 hover:bg-white/[0.04]'
                    : 'text-gray-400 hover:text-amber-600 hover:bg-gray-100',
                )}
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <div className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider',
                dark
                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600',
              )}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className={cn('relative inline-flex h-2 w-2 rounded-full bg-emerald-400', dark && 'shadow-[0_0_6px_rgba(52,211,153,0.6)]')} />
                </span>
                Online
              </div>

              {appUser && (
                <div className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2',
                  dark ? 'border-white/[0.06] bg-white/[0.03]' : 'border-gray-200 bg-white',
                )}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-[10px] font-bold text-white">
                    {appUser.first_name?.[0]}{appUser.last_name?.[0]}
                  </div>
                  <div className="hidden sm:block">
                    <div className={cn('text-xs font-semibold', dark ? 'text-white/80' : 'text-gray-700')}>
                      {appUser.first_name} {appUser.last_name}
                    </div>
                    <div className={cn('mono text-[9px]', dark ? 'text-amber-400/40' : 'text-amber-600/50')}>
                      Platform Admin
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex items-center gap-1 px-6 lg:px-8 -mb-px">
            {nexusTabs.map((tab) => {
              const Icon = tab.icon
              const active = isActive(tab.href, pathname)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'relative flex items-center gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-all rounded-t-md',
                    active
                      ? dark
                        ? 'border-amber-400 text-amber-400 bg-amber-400/[0.04]'
                        : 'border-amber-600 text-amber-700 bg-amber-50/50'
                      : dark
                        ? 'border-transparent text-white/25 hover:text-white/50 hover:bg-white/[0.02]'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
                  )}
                >
                  <Icon className={cn(
                    'h-3.5 w-3.5',
                    active
                      ? dark ? 'text-amber-400' : 'text-amber-600'
                      : dark ? 'text-white/15' : 'text-gray-300',
                  )} />
                  {tab.title}
                </Link>
              )
            })}
          </nav>
        </header>

        {/* Content */}
        <main className="relative z-10 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6 lg:p-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className={cn(
          'relative z-10 shrink-0 border-t px-6 py-2.5',
          dark ? 'border-white/[0.04] bg-[#111114]/50' : 'border-gray-100 bg-white/50',
        )}>
          <div className={cn(
            'flex items-center justify-between mono text-[10px]',
            dark ? 'text-white/10' : 'text-gray-300',
          )}>
            <span>NorvaOS Platform v1.0</span>
            <span>{new Date().toISOString().slice(0, 19).replace('T', ' ')}</span>
          </div>
        </footer>
      </div>
    </NexusThemeContext.Provider>
  )
}
