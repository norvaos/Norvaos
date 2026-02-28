import { ComingSoon } from '@/components/shared/coming-soon'
import { Plug } from 'lucide-react'

export default function IntegrationsPage() {
  return (
    <ComingSoon
      title="Integrations"
      description="Connect with third-party services like Google Workspace, Outlook, and more."
      phase="Phase 3"
      icon={Plug}
    />
  )
}
