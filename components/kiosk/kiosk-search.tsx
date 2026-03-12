'use client'

import { useState } from 'react'
import { Search, User, Mail, Phone, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

interface AppointmentResult {
  id: string
  booking_page_id: string
  guest_name: string
  guest_email: string | null
  start_time: string
  end_time: string
  duration_minutes: number
  status: string
  booking_page_title?: string
  user_first_name?: string
  user_last_name?: string
}

interface KioskSearchProps {
  token: string
  locale: PortalLocale
  onSelect: (appointment: AppointmentResult) => void
  onWalkIn: () => void
  onBack: () => void
}

type SearchType = 'name' | 'email' | 'phone'

/**
 * Kiosk appointment search.
 * Allows clients to find their appointment by name, email, or phone.
 * Touch-optimised with large buttons (44px+ tap targets).
 *
 * Rule #8: Only shows booker_name before identity verification.
 * No matter/lawyer details exposed at this stage.
 */
export function KioskSearch({ token, locale, onSelect, onWalkIn, onBack }: KioskSearchProps) {
  const [searchType, setSearchType] = useState<SearchType>('name')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AppointmentResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const t = getKioskTranslations(locale)

  async function handleSearch() {
    if (!query.trim()) return

    setIsSearching(true)
    setHasSearched(true)

    try {
      const res = await fetch(`/api/kiosk/${token}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQuery: query.trim(), searchType }),
      })

      if (!res.ok) {
        setResults([])
        return
      }

      const data = await res.json()
      setResults(data.appointments ?? [])
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const searchTypeOptions: { type: SearchType; icon: React.ReactNode; label: string }[] = [
    { type: 'name', icon: <User className="w-5 h-5" />, label: t.search_by_name },
    { type: 'email', icon: <Mail className="w-5 h-5" />, label: t.search_by_email },
    { type: 'phone', icon: <Phone className="w-5 h-5" />, label: t.search_by_phone },
  ]

  const placeholders: Record<SearchType, string> = {
    name: t.search_placeholder_name,
    email: t.search_placeholder_email,
    phone: t.search_placeholder_phone,
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
      {/* Back to welcome / change language */}
      <div className="w-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.questions_back}
        </button>
      </div>

      <h2 className="text-2xl font-semibold text-slate-900 text-center">
        {t.search_title}
      </h2>
      <p className="text-slate-600 text-center">
        {t.search_subtitle}
      </p>

      {/* Search type selector */}
      <div className="flex gap-2 w-full">
        {searchTypeOptions.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => {
              setSearchType(opt.type)
              setQuery('')
              setResults([])
              setHasSearched(false)
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
              searchType === opt.type
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="flex gap-2 w-full">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={placeholders[searchType]}
          className="h-14 text-lg"
          autoFocus
        />
        <Button
          onClick={handleSearch}
          disabled={!query.trim() || isSearching}
          size="lg"
          className="h-14 px-6"
        >
          {isSearching ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Results */}
      {hasSearched && !isSearching && (
        <div className="w-full space-y-3">
          {results.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-lg">{t.search_no_results}</p>
              <p className="text-slate-400 text-sm mt-1">
                {t.search_no_results_hint}
              </p>
            </div>
          ) : (
            results.map((apt) => (
              <button
                key={apt.id}
                type="button"
                onClick={() => onSelect(apt)}
                className="w-full p-4 bg-white border-2 border-slate-200 rounded-xl text-left hover:border-slate-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-medium text-slate-900">
                      {apt.guest_name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(`1970-01-01T${apt.start_time}`).toLocaleTimeString(
                        locale,
                        { hour: 'numeric', minute: '2-digit' },
                      )}
                      {apt.booking_page_title && ` \u2014 ${apt.booking_page_title}`}
                    </p>
                  </div>
                  <div className="text-slate-400">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Walk-in option */}
      <div className="pt-4 border-t border-slate-200 w-full text-center">
        <Button
          variant="ghost"
          size="lg"
          onClick={onWalkIn}
          className="text-slate-500 hover:text-slate-700"
        >
          {t.search_walk_in}
        </Button>
      </div>
    </div>
  )
}
