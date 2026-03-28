'use client'

import { useRouter } from 'next/navigation'
import { VelocitySplash } from '@/components/studio/velocity-splash'

// ---------------------------------------------------------------------------
// Velocity Splash Preview — /studio/splash
// Standalone route to view the 3-Second Handshake in isolation.
// ---------------------------------------------------------------------------

export default function SplashPreviewPage() {
  const router = useRouter()

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(180deg, #0c0c14 0%, #0f0f17 50%, #0b0b12 100%)',
      }}
    >
      <VelocitySplash
        onComplete={() => router.push('/studio/workspace/demo?gate=conflict')}
      />
    </div>
  )
}
