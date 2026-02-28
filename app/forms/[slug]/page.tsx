import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import PublicFormRenderer from './form-renderer'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | undefined }>
}

export default async function PublicFormPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const admin = createAdminClient()

  const { data: form, error } = await admin
    .from('intake_forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('is_active', true)
    .single()

  if (error || !form) {
    notFound()
  }

  const utmParams = {
    utm_source: sp.utm_source ?? null,
    utm_medium: sp.utm_medium ?? null,
    utm_campaign: sp.utm_campaign ?? null,
  }

  const isEmbed = sp.embed === 'true'

  return <PublicFormRenderer form={form} utmParams={utmParams} embed={isEmbed} />
}
