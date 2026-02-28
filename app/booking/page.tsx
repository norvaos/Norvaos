import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Clock, User, ArrowRight } from 'lucide-react'

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

interface UserInfo {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export default async function BookingDirectoryPage({ searchParams }: Props) {
  const sp = await searchParams
  const firmSlug = sp.firm
  const admin = createAdminClient()

  // If no firm identifier, show a generic message
  if (!firmSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Booking Directory</h1>
          <p className="mt-2 text-sm text-slate-500">
            Please use a specific booking link provided by your firm.
          </p>
        </div>
      </div>
    )
  }

  // Look up tenant by slug
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name')
    .eq('slug', firmSlug)
    .single()

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Firm Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">
            The firm you are looking for could not be found.
          </p>
        </div>
      </div>
    )
  }

  // Fetch all published booking pages for this tenant (no FK join — query user separately)
  const { data: pages } = await admin
    .from('booking_pages')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('status', 'published')
    .eq('is_active', true)
    .order('title', { ascending: true })

  const bookingPages = pages ?? []

  // Fetch user info for all unique user IDs
  const userIds = [...new Set(bookingPages.map((p) => p.user_id))]
  let userMap: Record<string, UserInfo> = {}
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .in('id', userIds)
    if (users) {
      userMap = Object.fromEntries(users.map((u) => [u.id, u]))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Book a consultation with one of our team members
        </p>
      </div>

      {/* Booking page cards */}
      <div className="mx-auto max-w-3xl p-6">
        {bookingPages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">
              No booking pages are currently available.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingPages.map((page) => {
              const user = userMap[page.user_id]
              const name = user
                ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
                : 'Team Member'

              return (
                <Link
                  key={page.id}
                  href={`/booking/${page.slug}`}
                  className="flex items-center gap-4 rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
                >
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${page.theme_color ?? '#2563eb'}20` }}
                    >
                      <User className="h-6 w-6" style={{ color: page.theme_color ?? '#2563eb' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{page.title}</h3>
                    <p className="text-sm text-slate-500">{name}</p>
                    {page.description && (
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {page.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {page.duration_minutes} min
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-white px-6 py-4 text-center text-xs text-slate-400">
        Powered by NorvaOS
      </div>
    </div>
  )
}
