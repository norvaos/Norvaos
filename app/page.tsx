import { redirect } from 'next/navigation'

export default function RootPage() {
  // Redirect to dashboards page (inside the dashboard layout with sidebar).
  // The middleware handles auth — unauthenticated users get sent to /login.
  redirect('/dashboards')
}
