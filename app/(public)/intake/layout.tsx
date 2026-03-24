/**
 * Public Intake Layout — Minimal branded layout for external client intake.
 * No dashboard sidebar, no internal navigation. Just firm branding + form.
 */

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        {children}
      </body>
    </html>
  )
}
