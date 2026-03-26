'use client'

/**
 * RouteGuard  -  Sovereign Cutover (Team COMMAND)
 *
 * Intercepts legacy LeadView routes when a matter_id is detected on the lead.
 * If the lead has been converted (converted_matter_id exists), redirects to
 * the Matter Intelligence Hub (/matters/[id]/shell?tab=intelligence).
 *
 * Mount this as a wrapper around lead detail pages.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface RouteGuardProps {
  /** The lead ID being viewed */
  leadId: string
  /** Children to render if the lead is NOT converted */
  children: React.ReactNode
}

/**
 * Checks if a lead has a converted_matter_id. If so, redirects to the
 * Matter Intelligence tab instead of rendering the legacy LeadView.
 */
export function RouteGuard({ leadId, children }: RouteGuardProps) {
  const router = useRouter()
  const [redirecting, setRedirecting] = useState(false)

  const { data: lead, isLoading } = useQuery({
    queryKey: ['route-guard-lead', leadId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id, converted_matter_id, current_stage')
        .eq('id', leadId)
        .single()
      return data
    },
    enabled: !!leadId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!lead) return

    // If the lead has been converted to a matter, force-redirect to Intelligence Hub
    if (lead.converted_matter_id) {
      setRedirecting(true)
      router.replace(`/matters/${lead.converted_matter_id}/shell?tab=intelligence`)
    }
  }, [lead, router])

  // While checking or redirecting, show nothing (prevents LeadView flash)
  if (isLoading || redirecting) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          Loading workspace...
        </div>
      </div>
    )
  }

  // Lead is not converted  -  render the normal LeadView
  return <>{children}</>
}
