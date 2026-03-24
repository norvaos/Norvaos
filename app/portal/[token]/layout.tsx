import type { Metadata } from 'next'
import { PortalZoomWrapper } from './portal-zoom-client'

export const metadata: Metadata = {
  title: 'Document Upload Portal',
  description: 'Upload your documents securely',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-force-light">
      <PortalZoomWrapper>{children}</PortalZoomWrapper>
    </div>
  )
}
