/**
 * NorvaOS Logomark  -  geometric N mark on an indigo→violet gradient background.
 * Accepts `size` (px) and `id` (unique prefix for SVG gradient IDs when rendered
 * multiple times on the same page).
 */
export function NorvaLogo({ size = 32, id = 'norva' }: { size?: number; id?: string }) {
  const bgId = `${id}-bg`
  const shineId = `${id}-shine`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NorvaOS"
    >
      <defs>
        {/* Main diagonal gradient  -  top-left indigo to bottom-right violet */}
        <linearGradient id={bgId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        {/* Subtle top-edge highlight for depth */}
        <linearGradient id={shineId} x1="16" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background rounded square */}
      <rect width="32" height="32" rx="7.5" fill={`url(#${bgId})`} />
      {/* Shine overlay */}
      <rect width="32" height="32" rx="7.5" fill={`url(#${shineId})`} />

      {/* ── N lettermark ─────────────────────────────────────────────────── */}
      {/* Left vertical bar */}
      <rect x="6.5" y="7" width="3.5" height="18" rx="1" fill="white" />
      {/* Diagonal  -  parallelogram connecting top of left bar to bottom of right bar */}
      <polygon points="10,7 13.5,7 22,25 18.5,25" fill="white" />
      {/* Right vertical bar */}
      <rect x="22" y="7" width="3.5" height="18" rx="1" fill="white" />
    </svg>
  )
}
