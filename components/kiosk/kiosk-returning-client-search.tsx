'use client'

import { useState } from 'react'
import { Mail, Phone, Search, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getKioskTranslations } from '@/lib/utils/kiosk-translations'
import type { PortalLocale } from '@/lib/utils/portal-translations'

export interface ReturningClientMatter {
  id: string
  matterNumber: string
  title: string
  status: string
  matterTypeName: string
  lawyerName: string
  lawyerAvatarUrl: string | null
  lawyerId: string | null
  pendingDocuments: number
  pendingTasks: number
}

export interface ReturningClientBookingPage {
  id: string
  title: string
  slug: string
  durationMinutes: number
  lawyerName: string
  lawyerId: string
}

export interface ReturningClientData {
  contact: { id: string; name: string }
  matters: ReturningClientMatter[]
  bookingPages: ReturningClientBookingPage[]
}

interface KioskReturningClientSearchProps {
  token: string
  locale: PortalLocale
  primaryColor: string
  onFound: (data: ReturningClientData) => void
  onBack: () => void
}

type SearchType = 'email' | 'phone'

/**
 * Kiosk returning-client search.
 *
 * Searches existing contacts by email or phone. When found, passes the
 * enriched client data (matters + booking pages) to the parent so it can
 * render the kiosk portal view.
 *
 * Rule #8: Only contact name and matter reference shown before full check-in.
 * No sensitive legal content exposed at this stage.
 */
export function KioskReturningClientSearch({
  token,
  locale,
  primaryColor,
  onFound,
  onBack,
}: KioskReturningClientSearchProps) {
  const [searchType, setSearchType] = useState<SearchType>('email')
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [noMatters, setNoMatters] = useState(false)

  const t = getKioskTranslations(locale)

  const options: { type: SearchType; icon: React.ReactNode; label: string }[] = [
    { type: 'email', icon: <Mail className="w-5 h-5" />, label: t.returning_client_by_email },
    { type: 'phone', icon: <Phone className="w-5 h-5" />, label: t.returning_client_by_phone },
  ]

  const placeholders: Record<SearchType, string> = {
    email: t.returning_client_placeholder_email,
    phone: t.returning_client_placeholder_phone,
  }

  async function handleSearch() {
    if (!query.trim() || query.trim().length < 3) return

    setIsSearching(true)
    setHasSearched(true)
    setNotFound(false)
    setNoMatters(false)

    try {
      const res = await fetch(`/api/kiosk/${token}/client-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchType, searchValue: query.trim() }),
      })

      if (!res.ok) {
        setNotFound(true)
        return
      }

      const data = await res.json()

      if (!data.found) {
        setNotFound(true)
        return
      }

      if (data.matters.length === 0) {
        setNoMatters(true)
        return
      }

      onFound({
        contact: data.contact,
        matters: data.matters,
        bookingPages: data.bookingPages ?? [],
      })
    } catch {
      setNotFound(true)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto px-4">
      {/* Back button */}
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

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-semibold text-slate-900">{t.returning_client_title}</h2>
        <p className="text-slate-600">{t.returning_client_subtitle}</p>
      </div>

      {/* Search type toggle */}
      <div className="flex gap-2 w-full">
        {options.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => {
              setSearchType(opt.type)
              setQuery('')
              setHasSearched(false)
              setNotFound(false)
              setNoMatters(false)
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-4 px-4 rounded-xl border-2 text-base font-medium transition-colors ${
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

      {/* Input row */}
      <div className="flex gap-2 w-full">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (hasSearched) {
              setHasSearched(false)
              setNotFound(false)
              setNoMatters(false)
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={placeholders[searchType]}
          type={searchType === 'email' ? 'email' : 'tel'}
          className="h-14 text-lg"
          autoFocus
        />
        <Button
          onClick={handleSearch}
          disabled={query.trim().length < 3 || isSearching}
          size="lg"
          className="h-14 px-6"
          style={{ backgroundColor: primaryColor }}
        >
          {isSearching ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Result: not found */}
      {hasSearched && !isSearching && notFound && (
        <div className="w-full text-center py-8 space-y-2">
          <p className="text-slate-700 text-lg font-medium">{t.returning_client_not_found}</p>
          <p className="text-slate-500 text-sm">{t.returning_client_not_found_hint}</p>
        </div>
      )}

      {/* Result: found but no active matters */}
      {hasSearched && !isSearching && noMatters && (
        <div className="w-full text-center py-8 space-y-2">
          <p className="text-slate-700 text-lg font-medium">{t.returning_client_no_matters}</p>
          <p className="text-slate-500 text-sm">{t.returning_client_no_matters_hint}</p>
        </div>
      )}
    </div>
  )
}
