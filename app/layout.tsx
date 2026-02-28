import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from '@/lib/providers'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'NorvaOS',
  description: 'Legal Practice Management Platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Blocking script: reads Zustand persisted UI state from localStorage
          BEFORE the first paint. Sets data-attributes on <html> so CSS can
          apply the correct sidebar width / practice filter state instantly,
          preventing flash-of-wrong-layout during React hydration.
          Cleaned up by React once Zustand's persist middleware has loaded.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=JSON.parse(localStorage.getItem('norvaos-ui')||'{}').state;if(d){if(d.sidebarCollapsed)document.documentElement.setAttribute('data-sidebar-collapsed','');if(d.activePracticeFilter&&d.activePracticeFilter!=='all'){document.documentElement.setAttribute('data-pa-filtered','');if(d.activePracticeColor)document.documentElement.style.setProperty('--pa-color',d.activePracticeColor);if(d.activePracticeName)document.documentElement.setAttribute('data-pa-name',d.activePracticeName)}}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`} style={{ backgroundColor: '#fff' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
