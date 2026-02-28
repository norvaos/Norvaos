import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Document Upload Portal',
  description: 'Upload your documents securely',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
