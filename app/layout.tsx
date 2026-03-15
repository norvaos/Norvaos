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
  title: 'NorvaOS — Practice Management Software for Canadian Immigration Law Firms',
  description:
    'NorvaOS is the all-in-one practice management platform built for Canadian immigration law practices. Matter management, IRCC form automation, client portal, billing, and document organisation in one place. Book a demo.',
  keywords: [
    'immigration lawyer software Canada',
    'Canadian immigration law firm software',
    'IRCC form automation',
    'immigration practice management software',
    'practice management for immigration lawyers',
    'Clio alternative Canada',
    'immigration law firm software Ontario',
  ],
  authors: [{ name: 'NorvaOS' }],
  metadataBase: new URL('https://norvaos.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://norvaos.com/',
    title: 'NorvaOS — Practice Management for Canadian Immigration Law Firms',
    description:
      'Replace five disconnected tools with one platform built specifically for Canadian immigration law practices.',
    // NOTE: Create a 1200x630px image and place it at /public/og-image.png
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NorvaOS — Practice Management for Canadian Immigration Law Firms',
    description:
      'Replace five disconnected tools with one platform built for Canadian immigration law practices.',
    // NOTE: Create a 1200x630px image and place it at /public/og-image.png
    images: ['/og-image.png'],
  },
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
        {/* Structured data — helps Google understand the product type and pricing */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'NorvaOS',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              description:
                'Practice management software for Canadian immigration and family law firms. Includes matter management, IRCC form automation, document storage, client portal, and legal billing.',
              url: 'https://norvaos.com',
              offers: {
                '@type': 'Offer',
                price: '99',
                priceCurrency: 'CAD',
              },
              provider: {
                '@type': 'Organization',
                name: 'NorvaOS',
                url: 'https://norvaos.com',
              },
            }),
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`} style={{ backgroundColor: '#fff' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
