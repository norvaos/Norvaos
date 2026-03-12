'use client'

import { useParams } from 'next/navigation'
import { CommandCentre } from '@/components/command-centre/command-centre'

export default function LeadCommandPage() {
  const { id } = useParams<{ id: string }>()
  return <CommandCentre entityType="lead" entityId={id} />
}
