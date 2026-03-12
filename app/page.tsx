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
  Lock,
  ChevronRight,
  MessageSquare,
  Briefcase,
  CreditCard,
  FolderOpen,
  RefreshCw,
  Search,
  PenLine,
  Clock,
  Sparkles,
  X,
  Brain,
  VideoIcon,
  BellRing,
  Layers,
  Building2,
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
              <a href="#documents" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Documents</a>
              <a href="#platform" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Platform</a>
              <a href="#features" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Features</a>
              <a href="#testimonials" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Reviews</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">
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
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[700px] w-[1000px] rounded-full bg-gradient-to-b from-indigo-50 via-violet-50/30 to-transparent blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Not a CRM. A complete legal operating system.
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl lg:text-[4.5rem] lg:leading-[1.1]">
              Your entire firm.
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                One tab. Zero compromises.
              </span>
            </h1>
            <p className="mt-6 text-xl leading-8 text-gray-600 max-w-2xl mx-auto">
              NorvaOS replaces Google Drive, DocuSign, Calendly, and your billing software —
              with automatic document sorting, real-time cloud sync, and every tool your firm
              needs built in. You never leave the platform.
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
            <p className="mt-4 text-sm text-gray-500">No credit card · 14-day trial · Full access · Cancel anytime</p>
          </div>

          {/* Dashboard preview */}
          <div className="relative mx-auto mt-16 max-w-6xl">
            <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/60">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="mx-auto flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
                  <Lock className="h-3 w-3 text-green-500" />
                  app.norvaos.com/matters/2026-0047
                </div>
              </div>
              <div className="flex min-h-[420px] bg-gray-50">
                {/* Sidebar */}
                <div className="w-44 shrink-0 border-r border-gray-200 bg-white px-3 py-4">
                  <div className="mb-4 flex items-center gap-2 px-2">
                    <div className="h-6 w-6 rounded-md bg-indigo-600" />
                    <div className="h-3 w-16 rounded-full bg-gray-200" />
                  </div>
                  {['Dashboard', 'Matters', 'Documents', 'Contacts', 'Calendar', 'Billing', 'Reports'].map((item, i) => (
                    <div
                      key={item}
                      className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                        i === 2 ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-500'
                      }`}
                    >
                      <div className={`h-3 w-3 rounded-sm ${i === 2 ? 'bg-indigo-400' : 'bg-gray-300'}`} />
                      {item}
                    </div>
                  ))}
                </div>
                {/* Document view */}
                <div className="flex-1 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="mb-1 h-4 w-48 rounded-full bg-gray-800/30" />
                      <div className="h-3 w-32 rounded-full bg-gray-300" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-7 w-24 rounded-lg bg-indigo-100" />
                      <div className="h-7 w-20 rounded-lg bg-emerald-100" />
                    </div>
                  </div>
                  {/* Auto-sorted folder tree */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'Identity Documents', count: '6 files', color: 'bg-blue-50 border-blue-100', dot: 'bg-blue-400' },
                      { name: 'Immigration Forms', count: '4 files', color: 'bg-violet-50 border-violet-100', dot: 'bg-violet-400' },
                      { name: 'Financial Records', count: '9 files', color: 'bg-emerald-50 border-emerald-100', dot: 'bg-emerald-400' },
                      { name: 'Employment Letters', count: '3 files', color: 'bg-amber-50 border-amber-100', dot: 'bg-amber-400' },
                      { name: 'Police Clearances', count: '2 files', color: 'bg-rose-50 border-rose-100', dot: 'bg-rose-400' },
                      { name: 'Medical Reports', count: '1 file', color: 'bg-cyan-50 border-cyan-100', dot: 'bg-cyan-400' },
                    ].map(folder => (
                      <div key={folder.name} className={`rounded-xl border ${folder.color} p-3`}>
                        <div className="mb-2 flex items-center gap-1.5">
                          <div className={`h-2.5 w-2.5 rounded-sm ${folder.dot}`} />
                          <div className="h-2.5 w-full max-w-[80px] rounded-full bg-gray-400/40" />
                        </div>
                        <div className="text-xs font-medium text-gray-600">{folder.name}</div>
                        <div className="mt-1 text-xs text-gray-400">{folder.count}</div>
                      </div>
                    ))}
                  </div>
                  {/* Sync bar */}
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-4 w-4 rounded bg-[#0078D4]" />
                      <span className="text-xs text-gray-500">OneDrive</span>
                    </div>
                    <div className="h-3 w-px bg-gray-200" />
                    <div className="flex items-center gap-1.5">
                      <div className="h-4 w-4 rounded bg-[#34A853]" />
                      <span className="text-xs text-gray-500">Google Drive</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Synced · 2 min ago
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Replaces X tools bar */}
      <section className="border-y border-gray-100 bg-gray-50 py-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            NorvaOS replaces all of these
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              'Google Drive', 'OneDrive', 'DocuSign', 'Calendly',
              'QuickBooks', 'Clio', 'Dropbox', 'Monday.com',
            ].map(tool => (
              <div key={tool} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-500 shadow-sm line-through decoration-red-400/60">
                <X className="h-3 w-3 text-red-400 no-underline" style={{ textDecoration: 'none' }} />
                <span>{tool}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-gray-500">
            One subscription. One login. Everything your firm needs.
          </p>
        </div>
      </section>

      {/* Document Intelligence — Hero Feature */}
      <section id="documents" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                <Brain className="h-3.5 w-3.5" />
                Smart Document Intelligence
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                Documents sort
                <br />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  themselves.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                Upload once — NorvaOS reads the document, identifies what it is, and
                files it into the right folder automatically. No renaming. No dragging.
                No folders to manage.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: FolderOpen,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Auto-sorted smart folders',
                    desc: 'Every matter gets a structured folder tree — Identity, Financial, Forms, Employment, Medical — populated automatically as documents arrive.',
                  },
                  {
                    icon: RefreshCw,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'OneDrive & Google Drive sync',
                    desc: 'Two-way sync with your existing cloud storage. Documents uploaded on either side stay in perfect sync — in real time.',
                  },
                  {
                    icon: Search,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'Full-text search across every file',
                    desc: 'Search inside every PDF, scanned image, and form across all matters simultaneously. Find anything in seconds.',
                  },
                  {
                    icon: Shield,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    title: 'Version history & audit trail',
                    desc: 'Every upload, replacement, and deletion is logged with timestamps. PIPEDA-compliant from day one.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Document Vault — Sharma, Patel (2026-0047)</span>
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live sync
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { folder: 'Identity Documents', files: ['Passport_Sharma.pdf', 'Passport_Patel.pdf', 'PR_Card.pdf'], color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                    { folder: 'Immigration Forms', files: ['IMM5257E_v3_DRAFT.pdf', 'IMM5476E_signed.pdf'], color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
                    { folder: 'Financial Records', files: ['Bank_Statement_Jan.pdf', 'T4_2025.pdf', 'NOA_2024.pdf'], color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                  ].map(group => (
                    <div key={group.folder} className={`rounded-xl border ${group.border} ${group.bg} p-3`}>
                      <div className={`mb-2 flex items-center gap-2 text-xs font-semibold ${group.color}`}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        {group.folder}
                        <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-gray-500">
                          {group.files.length} files
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.files.map(file => (
                          <div key={file} className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1.5 text-xs text-gray-600">
                            <FileText className="h-3 w-3 text-gray-400 shrink-0" />
                            {file}
                            <CheckCircle className="ml-auto h-3 w-3 text-emerald-500 shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-4 bg-gray-50">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className="h-3.5 w-3.5 rounded bg-[#0078D4] shrink-0" />
                    OneDrive synced
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className="h-3.5 w-3.5 rounded bg-[#34A853] shrink-0" />
                    Google Drive synced
                  </div>
                  <div className="ml-auto text-xs text-gray-400">Last sync: just now</div>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -right-4 -top-4 flex items-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 shadow-lg">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600">
                  <Brain className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Auto-classified</div>
                  <div className="text-xs text-gray-500">No manual sorting</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* "You never leave" section */}
      <section className="bg-gray-950 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/70">
              <Layers className="h-3.5 w-3.5" />
              Everything in one platform
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Stop switching tabs.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                Start practising law.
              </span>
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Every tool your firm needs lives inside NorvaOS. Intake to invoice —
              without a single external app.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: PenLine,
                label: 'Built-in E-Signing',
                sub: 'No DocuSign needed',
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
              },
              {
                icon: VideoIcon,
                label: 'Video Consultations',
                sub: 'No Zoom tab to open',
                color: 'text-violet-400',
                bg: 'bg-violet-500/10',
              },
              {
                icon: Calendar,
                label: 'Smart Scheduling',
                sub: 'No Calendly needed',
                color: 'text-sky-400',
                bg: 'bg-sky-500/10',
              },
              {
                icon: CreditCard,
                label: 'Invoicing & Payments',
                sub: 'No QuickBooks tab',
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10',
              },
              {
                icon: FolderOpen,
                label: 'Document Vault',
                sub: 'No Drive tab needed',
                color: 'text-amber-400',
                bg: 'bg-amber-500/10',
              },
              {
                icon: MessageSquare,
                label: 'Client Messaging',
                sub: 'No email back-and-forth',
                color: 'text-rose-400',
                bg: 'bg-rose-500/10',
              },
              {
                icon: FileText,
                label: 'Form Generation',
                sub: 'Auto-filled IRCC forms',
                color: 'text-cyan-400',
                bg: 'bg-cyan-500/10',
              },
              {
                icon: BarChart3,
                label: 'Financial Reports',
                sub: 'Real-time AR & revenue',
                color: 'text-purple-400',
                bg: 'bg-purple-500/10',
              },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/5 p-5 backdrop-blur-sm"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-white/40">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section id="platform" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">Three pillars</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Communicate. Work. Finance.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Every module talks to every other. One source of truth across your entire firm.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                lightColor: 'bg-indigo-50',
                textColor: 'text-indigo-600',
                title: 'Communicate',
                tagline: 'Clients always know what\'s happening',
                features: [
                  'Branded client portal with live file status',
                  'Automated SMS & email updates',
                  'Built-in intake forms — no Typeform',
                  'Document requests with 1-click upload',
                  'E-signing built in — no DocuSign',
                  'Appointment booking — no Calendly',
                ],
              },
              {
                icon: Briefcase,
                lightColor: 'bg-violet-50',
                textColor: 'text-violet-600',
                title: 'Work',
                tagline: 'Every matter runs on autopilot',
                features: [
                  'Auto-sorted document vault per matter',
                  'OneDrive & Google Drive two-way sync',
                  'IRCC form auto-fill & barcode generation',
                  'Stage pipelines with task automation',
                  'AI-powered deadline tracking',
                  'Conflict check before every new matter',
                ],
              },
              {
                icon: CreditCard,
                lightColor: 'bg-emerald-50',
                textColor: 'text-emerald-600',
                title: 'Finance',
                tagline: 'Get paid faster. Stay audit-ready.',
                features: [
                  'Retainer agreements & invoice generation',
                  'Online payments — no QuickBooks link',
                  'Trust accounting & ledger built in',
                  'Disbursement tracking per matter',
                  'AR aging & revenue reports',
                  'Stripe-powered checkout in 1 click',
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

      {/* Standout features grid */}
      <section id="features" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">What sets us apart</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Built for law. Not bolted on.
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Brain,
                color: 'text-indigo-600',
                bg: 'bg-indigo-50',
                title: 'AI Document Classification',
                desc: 'Every document is read, identified, and filed automatically the moment it arrives. Passports, T4s, police clearances — sorted without a click.',
              },
              {
                icon: RefreshCw,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                title: 'Cloud Storage Sync',
                desc: 'Two-way sync with OneDrive and Google Drive. Your team can work in the tools they know while NorvaOS stays the single source of truth.',
              },
              {
                icon: FileText,
                color: 'text-violet-600',
                bg: 'bg-violet-50',
                title: 'IRCC Form Automation',
                desc: 'IMM5257E, IMM5406, IMM5476, and more — auto-populated from client profiles with built-in validation, barcode embedding, and pack generation.',
              },
              {
                icon: Shield,
                color: 'text-amber-600',
                bg: 'bg-amber-50',
                title: 'Legal Compliance by Design',
                desc: 'Row-level security, full audit logs, PIPEDA-aligned storage, and guarded stage transitions. Compliance isn\'t an add-on — it\'s the foundation.',
              },
              {
                icon: Clock,
                color: 'text-rose-600',
                bg: 'bg-rose-50',
                title: 'Statute of Limitations Alerts',
                desc: 'Critical deadlines tracked automatically with layered alerts. The system warns your team before it\'s ever a problem.',
              },
              {
                icon: Users,
                color: 'text-sky-600',
                bg: 'bg-sky-50',
                title: 'Multi-Practice Area Support',
                desc: 'Immigration, Family Law, Real Estate, Civil Litigation — each with its own pipelines, intake forms, deadline types, and workflow templates.',
              },
              {
                icon: BellRing,
                color: 'text-purple-600',
                bg: 'bg-purple-50',
                title: 'Automated Client Updates',
                desc: 'Clients receive automatic SMS and email updates at every stage. No more "what\'s the status?" calls interrupting your day.',
              },
              {
                icon: Building2,
                color: 'text-teal-600',
                bg: 'bg-teal-50',
                title: 'Front Desk Kiosk Mode',
                desc: 'A walk-in intake kiosk for your reception. Clients self-check-in, sign consent forms, and submit documents — all before they sit down.',
              },
              {
                icon: Search,
                color: 'text-gray-700',
                bg: 'bg-gray-100',
                title: 'Universal Search',
                desc: 'Search across clients, matters, documents, tasks, and notes simultaneously. Find anything in the entire platform in under a second.',
              },
            ].map(feature => (
              <div key={feature.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${feature.bg}`}>
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
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
                quote: 'Documents used to pile up and staff spent hours renaming and filing. Now everything sorts itself the moment it arrives. It\'s genuinely magical.',
                author: 'Sarah M.',
                role: 'Managing Partner, Immigration Firm — Toronto',
              },
              {
                quote: 'We killed seven subscriptions the day we went live on NorvaOS. One platform. One login. Our team stopped complaining about switching tabs.',
                author: 'Daniel K.',
                role: 'Principal Solicitor, Family Law — Vancouver',
              },
              {
                quote: 'The OneDrive sync means our lawyers can still work the way they always have, but everything is automatically organised in NorvaOS. Best of both worlds.',
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
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
              <Zap className="h-3.5 w-3.5" />
              Set up in under 30 minutes
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Replace your entire stack.
              <br />Today.
            </h2>
            <p className="mt-4 text-xl leading-8 text-indigo-100">
              Import your existing files, connect OneDrive or Google Drive, and go live.
              Your team will wonder how they ever worked without it.
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
              <a href="#" className="hover:text-gray-900">Privacy Policy</a>
              <a href="#" className="hover:text-gray-900">Terms of Service</a>
              <a href="#" className="hover:text-gray-900">Security</a>
              <Link href="/login" className="hover:text-gray-900">Sign in</Link>
            </div>
            <p className="text-sm text-gray-400">© 2026 NorvaOS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
