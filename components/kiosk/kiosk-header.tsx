'use client'

interface KioskHeaderProps {
  firmName: string
  logoUrl?: string | null
  primaryColor?: string
}

/**
 * Kiosk header with firm branding.
 * Displays firm logo (if available) and name.
 * Touch-optimised, no interactive elements in header.
 */
export function KioskHeader({ firmName, logoUrl, primaryColor = '#0f172a' }: KioskHeaderProps) {
  return (
    <header
      className="w-full px-6 py-4 flex items-center justify-center gap-3"
      style={{ backgroundColor: primaryColor }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt={`${firmName} logo`}
          className="h-10 w-auto object-contain"
        />
      )}
      <h1 className="text-xl font-semibold text-white tracking-tight">
        {firmName}
      </h1>
    </header>
  )
}
