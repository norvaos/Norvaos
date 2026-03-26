import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import PublicFormRenderer from '../form-renderer'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | undefined }>
}

/**
 * Preview route for intake forms.
 *
 * Allows form builders to preview unpublished forms using a time-limited token.
 * Token format: base64(formId:timestamp)  -  valid for 1 hour.
 */
export default async function PreviewFormPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams

  const token = sp.token
  if (!token) notFound()

  // Decode token
  let formId: string
  let timestamp: number

  try {
    const decoded = atob(token)
    const [id, ts] = decoded.split(':')
    if (!id || !ts) notFound()
    formId = id
    timestamp = parseInt(ts, 10)
    if (isNaN(timestamp)) notFound()
  } catch {
    notFound()
  }

  // Validate token expiry (1 hour)
  const oneHourMs = 60 * 60 * 1000
  if (Date.now() - timestamp > oneHourMs) {
    notFound()
  }

  // Fetch form by ID (regardless of publish status) using admin client
  const admin = createAdminClient()

  const { data: form, error } = await admin
    .from('intake_forms')
    .select('*')
    .eq('id', formId)
    .eq('slug', slug)
    .single()

  if (error || !form) {
    notFound()
  }

  const utmParams = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  }

  return <PublicFormRenderer form={form} utmParams={utmParams} preview />
}
