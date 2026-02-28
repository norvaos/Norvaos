import { ComingSoon } from '@/components/shared/coming-soon'
import { Mail } from 'lucide-react'

export default function CommunicationsPage() {
  return (
    <ComingSoon
      title="Communications"
      description="Track emails, calls, and messages across all your contacts and matters."
      phase="Phase 3"
      icon={Mail}
    />
  )
}
