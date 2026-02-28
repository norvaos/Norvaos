import { ComingSoon } from '@/components/shared/coming-soon'
import { Megaphone } from 'lucide-react'

export default function MarketingPage() {
  return (
    <ComingSoon
      title="Marketing"
      description="Run campaigns, track referral sources, and measure marketing performance."
      phase="Phase 4"
      icon={Megaphone}
    />
  )
}
