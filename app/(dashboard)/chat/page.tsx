import { ComingSoon } from '@/components/shared/coming-soon'
import { MessageSquare } from 'lucide-react'

export default function ChatPage() {
  return (
    <ComingSoon
      title="Internal Chat"
      description="Communicate with your team in real time with channels and direct messages."
      phase="Phase 3"
      icon={MessageSquare}
    />
  )
}
