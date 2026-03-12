'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Command Centre → Matter redirect.
 *
 * The Command Centre is designed for lead intake workflows. Once a lead is
 * converted to a matter, the user should work from the full matter page
 * (/matters/[id]) which has the complete workspace (readiness matrix,
 * immigration workflows, document management, etc.).
 *
 * This page simply redirects to the canonical matter route.
 */
export default function MatterCommandPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/matters/${id}`)
  }, [id, router])

  return null
}
