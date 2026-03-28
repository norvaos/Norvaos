'use client'

import { useState, useEffect } from 'react'
import { useFrontDeskSearch, type FrontDeskPersonCard } from '@/lib/queries/front-desk-queries'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Phone,
  Mail,
  User,
  Calendar,
  AlertTriangle,
  Star,
  Shield,
} from 'lucide-react'

// ─── Props ───────────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  onSelectContact: (contactId: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 30) {
    const diffMonths = Math.floor(diffDays / 30)
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
  }
  if (diffDays > 0) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  if (diffHours > 0) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  if (diffMinutes > 0) return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`
  return 'Just now'
}

function getDisplayName(contact: FrontDeskPersonCard): string {
  if (contact.preferred_name) return contact.preferred_name
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
}

function formatNextAppointment(appt: { date: string; time: string } | null): string | null {
  if (!appt) return null
  const date = new Date(appt.date)
  const formatted = date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })
  if (appt.time) {
    const timeParts = appt.time.split(':')
    const hours = parseInt(timeParts[0], 10)
    const minutes = timeParts[1] ?? '00'
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHour = hours % 12 || 12
    return `${formatted} at ${displayHour}:${minutes} ${period}`
  }
  return formatted
}

// ─── Risk Flag Config ────────────────────────────────────────────────────────

const RISK_FLAG_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  do_not_contact: {
    label: 'Do Not Contact',
    className: 'bg-red-950/40 text-red-400 border-red-500/20',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  billing_restricted: {
    label: 'Billing Restricted',
    className: 'bg-amber-950/40 text-amber-400 border-amber-500/20',
    icon: <Shield className="w-3 h-3" />,
  },
  id_verification_required: {
    label: 'ID Verification Required',
    className: 'bg-blue-950/40 text-blue-400 border-blue-500/20',
    icon: <Shield className="w-3 h-3" />,
  },
  vip: {
    label: 'VIP',
    className: 'bg-purple-950/40 text-purple-400 border-purple-500/20',
    icon: <Star className="w-3 h-3" />,
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GlobalSearch({ onSelectContact }: GlobalSearchProps) {
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce the search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue)
    }, 300)
    return () => clearTimeout(timer)
  }, [inputValue])

  const { data: results, isLoading, isFetching } = useFrontDeskSearch(debouncedQuery)

  const showLoading = isLoading || isFetching
  const hasQuery = debouncedQuery.trim().length >= 2
  const hasResults = results && results.length > 0
  const showNoResults = hasQuery && !showLoading && !hasResults

  return (
    <div className="w-full space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search by phone, email, or name..."
          className="pl-9"
        />
      </div>

      {/* Loading State */}
      {hasQuery && showLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Results List */}
      {hasQuery && !showLoading && hasResults && (
        <div className="space-y-2">
          {results.map((contact) => (
            <Card
              key={contact.id}
              className="p-4 cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => onSelectContact(contact.id)}
            >
              <div className="flex items-start gap-3">
                {/* Avatar placeholder */}
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-slate-400" />
                </div>

                {/* Contact Info */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: Name + Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {getDisplayName(contact)}
                    </span>

                    {contact.active_matters_count > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {contact.active_matters_count} matter{contact.active_matters_count !== 1 ? 's' : ''}
                      </Badge>
                    )}

                    {contact.open_leads_count > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {contact.open_leads_count} lead{contact.open_leads_count !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>

                  {/* Row 2: Phone & Email */}
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {contact.phone_primary && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {contact.phone_primary}
                      </span>
                    )}
                    {contact.email_primary && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        {contact.email_primary}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Last contacted & Next appointment */}
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>
                      Last contacted: {formatRelativeDate(contact.last_contacted_at)}
                    </span>
                    {contact.next_appointment && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Next: {formatNextAppointment(contact.next_appointment)}
                      </span>
                    )}
                  </div>

                  {/* Row 4: Risk Flags Strip */}
                  {contact.risk_flags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {contact.risk_flags.map((flag) => {
                        const config = RISK_FLAG_CONFIG[flag]
                        if (!config) return null
                        return (
                          <Badge
                            key={flag}
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 gap-1 ${config.className}`}
                          >
                            {config.icon}
                            {config.label}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* No Results State */}
      {showNoResults && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <User className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No contacts found.</p>
          <p className="text-xs mt-1">Try a different phone number, email, or name.</p>
        </div>
      )}
    </div>
  )
}
