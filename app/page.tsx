import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  Scale,
  FileText,
  Users,
  Calendar,
  BarChart3,
  Shield,
  ArrowRight,
  CheckCircle,
  Star,
  Zap,
  Globe,
  Lock,
  ChevronRight,
  MessageSquare,
  Briefcase,
  CreditCard,
} from 'lucide-react'

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboards')
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <Scale className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-gray-900">NorvaOS</span>
            </div>
            <div className="hidden items-center gap-8 md:flex">
              <a href="#features" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Features</a>
              <a href="#pillars" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Platform</a>
              <a href="#testimonials" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Testimonials</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700"
              >
                Get started
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-b from-indigo-50 via-indigo-50/40 to-transparent blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
              <Zap className="h-3.5 w-3.5" />
              Built for Canadian Law Firms
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
              The operating system
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                your firm deserves
              </span>
            </h1>
            <p className="mt-6 text-xl leading-8 text-gray-600">
              NorvaOS unifies client communications, case management, and firm finances into one
              seamless platform — so your team spends less time on admin and more time on law.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-200 sm:w-auto"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md sm:w-auto"
              >
                Sign in to your firm
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </div>

          {/* Dashboard preview */}
          <div className="relative mx-auto mt-20 max-w-6xl">
            <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/60">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="mx-auto flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
                  <Lock className="h-3 w-3 text-green-500" />
                  app.norvaos.com/dashboards
                </div>
              </div>
              {/* Mock dashboard */}
              <div className="flex min-h-[460px] bg-gray-50">
                {/* Sidebar */}
                <div className="w-44 shrink-0 border-r border-gray-200 bg-white px-3 py-4">
                  <div className="mb-4 flex items-center gap-2 px-2">
                    <div className="h-6 w-6 rounded-md bg-indigo-600" />
                    <div className="h-3 w-16 rounded-full bg-gray-200" />
                  </div>
                  {['Dashboard', 'Matters', 'Contacts', 'Tasks', 'Calendar', 'Leads', 'Billing'].map((item, i) => (
                    <div
                      key={item}
                      className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                        i === 0 ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-500'
                      }`}
                    >
                      <div className={`h-3 w-3 rounded-sm ${i === 0 ? 'bg-indigo-400' : 'bg-gray-300'}`} />
                      {item}
                    </div>
                  ))}
                </div>
                {/* Main content */}
                <div className="flex-1 p-6">
                  <div className="mb-6">
                    <div className="mb-1 h-5 w-40 rounded-full bg-gray-300" />
                    <div className="h-3 w-56 rounded-full bg-gray-200" />
                  </div>
                  {/* Stats row */}
                  <div className="mb-6 grid grid-cols-4 gap-4">
                    {[
                      { label: 'Active Matters', value: '47', color: 'bg-indigo-500' },
                      { label: 'Pending Tasks', value: '12', color: 'bg-amber-500' },
                      { label: 'Revenue MTD', value: '$84k', color: 'bg-emerald-500' },
                      { label: 'Consultations', value: '8', color: 'bg-violet-500' },
                    ].map(stat => (
                      <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg ${stat.color}`}>
                          <div className="h-3 w-3 rounded-sm bg-white/80" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stat.value}</div>
                        <div className="text-xs text-gray-500">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Matter list */}
                  <div className="rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <div className="h-3 w-24 rounded-full bg-gray-300" />
                      <div className="h-6 w-20 rounded-lg bg-indigo-100" />
                    </div>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-0">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 h-3 w-32 rounded-full bg-gray-300" />
                          <div className="h-2.5 w-24 rounded-full bg-gray-200" />
                        </div>
                        <div
                          className={`h-5 w-16 rounded-full ${
                            i === 0 ? 'bg-emerald-100' : i === 1 ? 'bg-amber-100' : 'bg-indigo-100'
                          }`}
                        />
                        <div className="h-3 w-16 rounded-full bg-gray-200" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="border-y border-gray-100 bg-gray-50 py-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-gray-500">
            Trusted by law firms across Canada
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {['Immigration Law', 'Family Law', 'Real Estate', 'Civil Litigation', 'Corporate Law'].map(practice => (
              <div key={practice} className="flex items-center gap-2 text-gray-400">
                <CheckCircle className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium">{practice}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section id="pillars" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">The platform</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Three pillars. One platform.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Everything a modern law firm needs, built to work together seamlessly.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                color: 'bg-indigo-600',
                lightColor: 'bg-indigo-50',
                textColor: 'text-indigo-600',
                title: 'Communicate',
                tagline: 'Every client conversation in one place',
                features: [
                  'Secure client portal with real-time updates',
                  'Automated intake forms and questionnaires',
                  'SMS, email and in-app messaging',
                  'Document signing and collection',
                  'Appointment scheduling with reminders',
                ],
              },
              {
                icon: Briefcase,
                color: 'bg-violet-600',
                lightColor: 'bg-violet-50',
                textColor: 'text-violet-600',
                title: 'Work',
                tagline: 'Run your matters without thinking twice',
                features: [
                  'Matter pipelines with stage automation',
                  'Task templates and deadline tracking',
                  'IRCC form auto-fill for immigration files',
                  'Document library with version history',
                  'Team collaboration and matter notes',
                ],
              },
              {
                icon: CreditCard,
                color: 'bg-emerald-600',
                lightColor: 'bg-emerald-50',
                textColor: 'text-emerald-600',
                title: 'Finance',
                tagline: 'Get paid faster, stay audit-ready',
                features: [
                  'Retainer and invoice generation',
                  'Online payments via Stripe',
                  'Trust accounting and ledger',
                  'Revenue and collection reports',
                  'Disbursement tracking per matter',
                ],
              },
            ].map(pillar => (
              <div
                key={pillar.title}
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${pillar.lightColor}`}>
                  <pillar.icon className={`h-6 w-6 ${pillar.textColor}`} />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{pillar.title}</h3>
                <p className={`mt-1 text-sm font-medium ${pillar.textColor}`}>{pillar.tagline}</p>
                <ul className="mt-6 space-y-3">
                  {pillar.features.map(f => (
                    <li key={f} className="flex items-start gap-3 text-sm text-gray-600">
                      <CheckCircle className={`mt-0.5 h-4 w-4 shrink-0 ${pillar.textColor}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className={`mt-8 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold ${pillar.textColor}`}>
                  Learn more <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">Purpose-built features</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Designed for the way lawyers work
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: FileText,
                title: 'IRCC Form Automation',
                desc: 'Auto-populate IMM5257E, IMM5406, IMM5476, and more from client profiles. Built-in validation, barcode embedding, and draft/final pack generation.',
              },
              {
                icon: Shield,
                title: 'Compliance-first Architecture',
                desc: 'Row-level security, full audit logs, guarded stage transitions, and PIPEDA-aligned data handling. Built for regulated practice.',
              },
              {
                icon: Users,
                title: 'Multi-Practice Area Support',
                desc: 'Immigration, Family Law, Real Estate, and more — each with custom pipelines, deadline catalogues, and intake workflows.',
              },
              {
                icon: Calendar,
                title: 'Smart Scheduling',
                desc: 'Consultation booking with availability rules, automated reminders, and seamless calendar sync. Clients book themselves.',
              },
              {
                icon: BarChart3,
                title: 'Reporting & Analytics',
                desc: 'Matter velocity, team utilisation, revenue by practice area, and AR aging — all in real time, no spreadsheets required.',
              },
              {
                icon: Globe,
                title: 'Bilingual Client Portal',
                desc: 'A secure, branded portal where clients submit documents, track their file progress, and communicate with your team — anytime, from anywhere.',
              },
            ].map(feature => (
              <div key={feature.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                  <feature.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">What firms say</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Law firms love NorvaOS
            </h2>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {[
              {
                quote:
                  'We cut our intake time by 60% in the first month. The IRCC form automation alone has saved our team dozens of hours every week.',
                author: 'Sarah M.',
                role: 'Managing Partner, Immigration Firm — Toronto',
              },
              {
                quote:
                  'Finally a system built for how law firms actually operate. The matter pipeline and task automation means nothing falls through the cracks.',
                author: 'Daniel K.',
                role: 'Principal Solicitor, Family Law — Vancouver',
              },
              {
                quote:
                  'Our clients love the portal. They can see exactly where their file stands and upload documents without calling the office.',
                author: 'Priya R.',
                role: 'Office Manager, Boutique Immigration Firm — Ottawa',
              },
            ].map(t => (
              <div key={t.author} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="mb-4 flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-base leading-7 text-gray-700">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                  <p className="text-sm text-gray-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Ready to modernise your firm?
            </h2>
            <p className="mt-4 text-xl leading-8 text-indigo-100">
              Join law firms across Canada who run their practice on NorvaOS. Get set up in minutes,
              not months.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-700 shadow-lg transition-all hover:bg-indigo-50 hover:shadow-xl sm:w-auto"
              >
                Start your free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:w-auto"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-sm text-indigo-200">
              No credit card · 14-day trial · Full access · Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
                <Scale className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-gray-900">NorvaOS</span>
              <span className="ml-2 text-sm text-gray-400">Legal Operations Platform</span>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-900">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-gray-900">
                Terms of Service
              </a>
              <a href="#" className="hover:text-gray-900">
                Security
              </a>
              <Link href="/login" className="hover:text-gray-900">
                Sign in
              </Link>
            </div>
            <p className="text-sm text-gray-400">© 2026 NorvaOS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
