import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import BookingClient from './booking-client'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const admin = createAdminClient()

  // Fetch booking page
  const { data: rawPage, error } = await admin
    .from('booking_pages')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('is_active', true)
    .single()

  if (error || !rawPage) {
    notFound()
  }

  // Fetch user info separately (FK may not be recognized by PostgREST types yet)
  const { data: userRow } = await admin
    .from('users')
    .select('id, first_name, last_name, avatar_url, email')
    .eq('id', rawPage.user_id)
    .single()

  // Fetch tenant for branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, timezone')
    .eq('id', rawPage.tenant_id)
    .single()

  // Merge user into booking page for client component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookingPage = { ...rawPage, users: userRow } as any

  return (
    <BookingClient
      bookingPage={bookingPage}
      tenant={tenant}
    />
  )
}
