'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, LayoutDashboard, Monitor, Copy, ExternalLink, Loader2, Clock, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/layout/notification-bell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { useFrontDeskActiveShift, frontDeskKeys } from '@/lib/queries/front-desk-queries'

interface FrontDeskHeaderProps {
  userId: string
  userName: string
  avatarUrl: string | null
  firmName: string
}

const NAV_ITEMS = [
  { href: '/front-desk', label: 'Console', icon: LayoutDashboard },
]

/**
 * Front Desk header  -  no sidebar, just a top navigation bar.
 *
 * Rule #10: Separate locked interface. Restricted header only
 * (firm name, avatar, bell, logout). No settings/reports/pipelines/billing links.
 */
export function FrontDeskHeader({ userId, userName, avatarUrl, firmName }: FrontDeskHeaderProps) {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [kioskUrl, setKioskUrl] = useState<string | null>(null)
  const [kioskLoading, setKioskLoading] = useState(false)
  const [elapsedStr, setElapsedStr] = useState('')

  // ─── Active Shift ────────────────────────────────────────────────────
  const { data: activeShift } = useFrontDeskActiveShift(userId)

  // Update elapsed time every second when on shift
  useEffect(() => {
    if (!activeShift?.started_at) {
      setElapsedStr('')
      return
    }
    function update() {
      const started = new Date(activeShift!.started_at).getTime()
      const now = Date.now()
      const mins = Math.floor((now - started) / 60000)
      const h = Math.floor(mins / 60)
      const m = mins % 60
      setElapsedStr(`${h}h ${String(m).padStart(2, '0')}m`)
    }
    update()
    const interval = setInterval(update, 30_000)
    return () => clearInterval(interval)
  }, [activeShift?.started_at])

  // Shift duration hours for color coding
  const shiftHours = activeShift?.started_at
    ? (Date.now() - new Date(activeShift.started_at).getTime()) / 3600000
    : 0
  const shiftColor = shiftHours > 10 ? 'text-red-600' : shiftHours > 8 ? 'text-amber-600' : 'text-emerald-600'
  const shiftBg = shiftHours > 10 ? 'bg-red-50 border-red-200' : shiftHours > 8 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'

  const shiftMutation = useMutation({
    mutationFn: async (actionType: 'front_desk_start_shift' | 'front_desk_end_shift') => {
      const res = await fetch(`/api/actions/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: actionType === 'front_desk_end_shift' ? { reason: 'manual' } : {},
          source: 'front_desk',
          idempotencyKey: `${actionType}:${userId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }
      return res.json()
    },
    onSuccess: (_, actionType) => {
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.activeShift(userId) })
      toast.success(actionType === 'front_desk_start_shift' ? 'Shift started' : 'Shift ended')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function handleGenerateKiosk() {
    setKioskLoading(true)
    try {
      const res = await fetch('/api/settings/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateToken: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to generate kiosk link')
      }
      const data = await res.json()
      if (data.token) {
        const url = `${window.location.origin}/kiosk/${data.token}`
        setKioskUrl(url)
        toast.success('Kiosk link generated (valid 24 hours)')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate kiosk link')
    } finally {
      setKioskLoading(false)
    }
  }

  function copyKioskUrl() {
    if (!kioskUrl) return
    navigator.clipboard.writeText(kioskUrl)
    toast.success('Kiosk URL copied to clipboard')
  }

  function openKiosk() {
    if (!kioskUrl) return
    window.open(kioskUrl, '_blank')
  }

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-2">
      <div className="flex items-center justify-between max-w-[1600px] mx-auto">
        {/* Left  -  firm name */}
        <div className="flex items-center gap-6">
          <Link href="/front-desk" className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">{firmName}</span>
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              Front Desk
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/front-desk'
                  ? pathname === '/front-desk'
                  : pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right  -  shift, kiosk, notifications, avatar, logout */}
        <div className="flex items-center gap-2">
          {/* Shift Indicator */}
          {activeShift ? (
            <div className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1 ${shiftBg}`}>
              <Clock className={`w-3.5 h-3.5 ${shiftColor}`} />
              <span className={`text-xs font-semibold ${shiftColor}`}>
                On Shift{elapsedStr ? `: ${elapsedStr}` : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100"
                onClick={() => shiftMutation.mutate('front_desk_end_shift')}
                disabled={shiftMutation.isPending}
              >
                <Square className="w-3 h-3 mr-1" />
                End
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => shiftMutation.mutate('front_desk_start_shift')}
              disabled={shiftMutation.isPending}
            >
              {shiftMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Start Shift
            </Button>
          )}

          {/* Kiosk Link Generator */}
          {kioskUrl ? (
            <div className="hidden sm:flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
              <Monitor className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-700 font-medium max-w-[180px] truncate">
                Kiosk Ready
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={copyKioskUrl} title="Copy kiosk URL">
                <Copy className="w-3 h-3 text-emerald-600" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={openKiosk} title="Open kiosk in new tab">
                <ExternalLink className="w-3 h-3 text-emerald-600" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateKiosk}
              disabled={kioskLoading}
              className="hidden sm:flex items-center gap-1.5 text-xs"
            >
              {kioskLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Monitor className="w-3.5 h-3.5" />
              )}
              Launch Kiosk
            </Button>
          )}

          <NotificationBell />

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <Avatar className="h-8 w-8">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-slate-600 hidden md:inline">{userName}</span>
          </div>

          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit" title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
