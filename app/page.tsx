import Link from 'next/link'
import Image from 'next/image'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  FileText,
  Users,
  Calendar,
  BarChart3,
  Shield,
  ArrowRight,
  CheckCircle,
  Star,
  Zap,
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
  Brain,
  VideoIcon,
  BellRing,
  Layers,
  Building2,
  Globe,
  XCircle,
  AlertCircle,
  Scale,
  DollarSign,
  Receipt,
  TrendingUp,
  Landmark,
  BookOpen,
  GraduationCap,
  Award,
  BadgeCheck,
  CalendarDays,
  CalendarCheck,
  Wallet,
  PiggyBank,
  ClipboardList,
  Video,
  Lock,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'
import { DashboardSlideshow } from '@/components/landing/dashboard-slideshow'

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user) {
    redirect('/dashboards')
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#0A0A0A]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <NorvaLogo size={32} id="nav" />
              <span className="text-lg font-bold tracking-tight text-gray-900">NorvaOS</span>
              <div className="hidden lg:block ml-2">
                <span
                  className="-rotate-[15deg] inline-block rounded-sm bg-indigo-600 px-2 py-[3px] text-[9px] font-bold uppercase tracking-widest text-white shadow-sm"
                >A complete legal<br />operating system</span>
              </div>
            </div>
            <div className="hidden items-center gap-8 md:flex">
              <a href="#platform" className="text-sm font-medium text-gray-900 transition-colors hover:text-black">Platform</a>
              <a href="#features" className="text-sm font-medium text-gray-900 transition-colors hover:text-black">Features</a>
              <a href="#privacy-standard" className="text-sm font-medium text-gray-900 transition-colors hover:text-black">Security</a>
              <Link href="/help" target="_blank" className="text-sm font-medium text-gray-900 transition-colors hover:text-black">Help</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm font-medium text-gray-900 transition-colors hover:text-black">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1e293b]"
              >
                Book a demo
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
            <h1 className="text-5xl font-bold tracking-tight text-black sm:text-6xl lg:text-[4.5rem] lg:leading-[1.1]">
              Your Entire Practice.
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                One tab. Zero compromises.
              </span>
            </h1>
            <p className="mt-6 text-xl leading-8 text-gray-900 max-w-2xl mx-auto">
              Most Canadian practices run on four or five apps that don&rsquo;t talk to each other. NorvaOS replaces them all — matters, documents, deadlines, billing, trust accounting, and client communication — so your file is audit-ready from day one.
            </p>
            <p className="mt-4 text-base font-medium text-gray-700">
              Close files 80% faster. Always audit-ready. No IT department required — just open it and go.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-gray-900/20 transition-all hover:bg-[#1e293b] hover:shadow-xl sm:w-auto"
              >
                Book a 20-minute demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-8 py-3.5 text-base font-medium text-gray-900 shadow-sm transition-all hover:border-gray-400 hover:text-gray-800 sm:w-auto"
              >
                Sign in to your firm
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-700">Starting from $99/month for solo practices. Annual plans available.</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-800 shadow-sm">
                🇨🇦 Data stored in Canada
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-800">
                <Shield className="h-3.5 w-3.5 text-emerald-600" />
                PIPEDA-compliant
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm">
                <Shield className="h-3.5 w-3.5 text-indigo-500" />
                Encrypted in transit
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-semibold text-violet-800">
                <Zap className="h-3.5 w-3.5 text-violet-600" />
                Setup in minutes
              </div>
            </div>
          </div>

          {/* Dashboard preview slideshow */}
          <DashboardSlideshow />
        </div>
      </section>

      {/* Replaces X tools bar */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="mb-8 text-center text-sm font-medium text-gray-400">
            Every tool your practice needs. All crossed off your vendor list.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { label: 'Practice Management', icon: '⚖️' },
              { label: 'Document Storage', icon: '📁' },
              { label: 'Cloud Sync', icon: '☁️' },
              { label: 'E-Signing', icon: '✍️' },
              { label: 'Client Scheduling', icon: '📅' },
              { label: 'Legal Accounting', icon: '💼' },
              { label: 'Norva Ledger', icon: '🏦' },
              { label: 'Client CRM', icon: '👥' },
              { label: 'Form Generation', icon: '📋' },
              { label: 'Client Portal', icon: '🔐' },
              { label: 'Task Management', icon: '✅' },
              { label: 'Invoicing Software', icon: '💳' },
            ].map(tool => (
              <div key={tool.label} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-400 shadow-sm">
                <span className="text-base leading-none opacity-50">{tool.icon}</span>
                <span className="line-through">{tool.label}</span>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-gray-700">
            One subscription. One login. No app switching. Ever.
          </p>
        </div>
      </section>

      {/* Document Intelligence  -  Hero Feature */}
      <section id="documents" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                <Brain className="h-3.5 w-3.5" />
                Smart Document Intelligence
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Documents sort
                <br />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  themselves.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                Upload once and NorvaOS reads the document, identifies what it is, and
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
                    desc: 'Every matter gets a structured folder tree: Identity, Financial, Forms, Employment, and Medical, populated automatically as documents arrive.',
                  },
                  {
                    icon: RefreshCw,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'OneDrive & Google Drive sync',
                    desc: 'Two-way sync with your existing cloud storage. Documents uploaded on either side stay in perfect sync, in real time.',
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
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Document Vault: Sharma, Patel (2026-0047)</span>
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live sync
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {/* Auto-rename preview */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 mb-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-700">
                      <Brain className="h-3.5 w-3.5" />
                      Just received, auto-renaming
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { from: 'scan004.pdf', to: 'Sharma_Passport_2025.pdf' },
                        { from: 'document_1.pdf', to: 'Marriage_Certificate.pdf' },
                        { from: 'img_3829.jpg', to: 'Patel_PR_Card_2026.jpg' },
                      ].map(rename => (
                        <div key={rename.from} className="flex items-center gap-2 text-xs">
                          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-gray-400 line-through">{rename.from}</span>
                          <ArrowRight className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-gray-700">{rename.to}</span>
                          <CheckCircle className="ml-auto h-3 w-3 text-emerald-500 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {[
                    { folder: 'Identity Documents', files: ['Sharma_Passport_2025.pdf', 'Patel_PR_Card_2026.jpg', 'Marriage_Certificate.pdf'], color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
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
              <div className="hidden sm:flex absolute -right-4 -top-4 items-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 shadow-lg">
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
      <section className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-1.5 text-sm font-medium text-indigo-700 shadow-sm">
              <Layers className="h-3.5 w-3.5" />
              Everything in one platform
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
              Stop switching tabs.
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Start practising law.
              </span>
            </h2>
            <p className="mt-4 text-lg text-gray-900">
              Every tool your firm needs lives inside NorvaOS. Intake to invoice,
              without a single external app.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: PenLine,
                label: 'Built-in E-Signing',
                sub: 'Retainers, consent forms, and letters signed in-platform',
                color: 'text-indigo-600',
                bg: 'bg-indigo-100',
                card: 'bg-white border border-indigo-100',
              },
              {
                icon: VideoIcon,
                label: 'Video Consultations',
                sub: 'HD video calls with clients, recorded and linked to matter',
                color: 'text-violet-600',
                bg: 'bg-violet-100',
                card: 'bg-white border border-violet-100',
              },
              {
                icon: Calendar,
                label: 'Client Scheduling',
                sub: 'Online booking with automated reminders and confirmations',
                color: 'text-sky-600',
                bg: 'bg-sky-100',
                card: 'bg-white border border-sky-100',
              },
              {
                icon: CreditCard,
                label: 'Invoicing & Payments',
                sub: 'Stripe-powered checkout, trust accounting, AR tracking',
                color: 'text-emerald-600',
                bg: 'bg-emerald-100',
                card: 'bg-white border border-emerald-100',
              },
              {
                icon: FolderOpen,
                label: 'Document Storage',
                sub: 'AI-sorted vaults with OneDrive, Google Drive two-way sync',
                color: 'text-amber-600',
                bg: 'bg-amber-100',
                card: 'bg-white border border-amber-100',
              },
              {
                icon: MessageSquare,
                label: 'Client Messaging',
                sub: 'Branded portal with two-way messaging and file sharing',
                color: 'text-rose-600',
                bg: 'bg-rose-100',
                card: 'bg-white border border-rose-100',
              },
              {
                icon: FileText,
                label: 'Form Generation',
                sub: 'IRCC forms auto-filled from client profiles with barcodes',
                color: 'text-cyan-600',
                bg: 'bg-cyan-100',
                card: 'bg-white border border-cyan-100',
              },
              {
                icon: BarChart3,
                label: 'Financial Reports',
                sub: 'Revenue by practice area, AR aging, trust ledger reports',
                color: 'text-purple-600',
                bg: 'bg-purple-100',
                card: 'bg-white border border-purple-100',
              },
              {
                icon: Zap,
                label: 'Task Automation',
                sub: 'Workflows trigger tasks automatically on every stage change',
                color: 'text-orange-600',
                bg: 'bg-orange-100',
                card: 'bg-white border border-orange-100',
              },
              {
                icon: Clock,
                label: 'Deadline Tracking',
                sub: 'Statute of limitations, filing deadlines, multi-layer alerts',
                color: 'text-teal-600',
                bg: 'bg-teal-100',
                card: 'bg-white border border-teal-100',
              },
              {
                icon: Landmark,
                label: 'Norva Ledger',
                sub: 'Regulator-compliant trust ledger, three-way reconciliation',
                color: 'text-emerald-700',
                bg: 'bg-emerald-100',
                card: 'bg-white border border-emerald-100',
              },
              {
                icon: Building2,
                label: 'Kiosk Check-In',
                sub: 'Front desk tablet for client self-check-in and doc upload',
                color: 'text-pink-600',
                bg: 'bg-pink-100',
                card: 'bg-white border border-pink-100',
              },
              {
                icon: CalendarDays,
                label: 'Appointment Booking',
                sub: 'Public booking page, Google & Outlook sync, auto-reminders',
                color: 'text-blue-600',
                bg: 'bg-blue-100',
                card: 'bg-white border border-blue-100',
              },
              {
                icon: Brain,
                label: 'AI Assistant',
                sub: 'Contradiction detection, auto-classification, smart suggestions',
                color: 'text-gray-700',
                bg: 'bg-gray-100',
                card: 'bg-white border border-gray-100',
              },
              {
                icon: Scale,
                label: 'Conflict Checking',
                sub: 'Automatic conflict detection before opening every new matter',
                color: 'text-red-600',
                bg: 'bg-red-100',
                card: 'bg-white border border-red-100',
              },
              {
                icon: Receipt,
                label: 'Disbursement Tracking',
                sub: 'Government fees, courier, translation costs tracked per matter',
                color: 'text-yellow-700',
                bg: 'bg-yellow-100',
                card: 'bg-white border border-yellow-100',
              },
            ].map(item => (
              <div
                key={item.label}
                className={`flex items-start gap-4 rounded-2xl ${item.card} p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Migration section */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-indigo-50/50 to-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-sm font-semibold text-indigo-700 shadow-sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Switching is painless
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              Already on another platform?
              <br />
              <span className="text-indigo-600">Bring everything with you.</span>
            </h2>
            <p className="mt-4 text-lg text-gray-900">
              NorvaOS imports your existing data directly from your current practice
              management software. Your matters, contacts, documents, and history all move
              over. Nothing gets left behind.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <p className="w-full text-center text-sm font-medium uppercase tracking-wider text-gray-400 mb-2">
              Import from your existing platform
            </p>
            {[
              'Clio', 'Cosmolex', 'Practice Panther', 'MyCase',
              'Smokeball', 'Filevine', 'AbacusLaw', 'PCLaw',
            ].map(platform => (
              <div
                key={platform}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm"
              >
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                {platform}
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-full border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400">
              + others on request
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-gray-700">
            Our team handles the migration. Your firm is live in days, not months.
          </p>
        </div>
      </section>

      {/* Three Pillars */}
      <section id="platform" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">How NorvaOS works</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-black sm:text-5xl">
              Intake. Work. Deliver.
            </h2>
            <p className="mt-4 text-lg text-gray-900">
              Three pillars. Every module talks to every other. One source of truth across your entire practice.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Pillar 1  -  Intake */}
            <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-indigo-500 to-blue-500" />
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Intake</h3>
              <p className="mt-1 text-sm font-semibold text-indigo-600">From first contact to retained client</p>
              <ul className="mt-6 space-y-3">
                {[
                  'Branded client portal with live file status',
                  'Automated SMS, email updates',
                  'Built-in intake forms, no form tool needed',
                  'Document requests with 1-click upload',
                  'E-signing built in, no separate tool',
                  'Appointment booking, no scheduling app',
                ].map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-900">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-indigo-600">
                Learn more <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            {/* Pillar 2  -  Work */}
            <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-violet-500 to-purple-500" />
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Work</h3>
              <p className="mt-1 text-sm font-semibold text-violet-600">Every matter runs on autopilot</p>
              <ul className="mt-6 space-y-3">
                {[
                  'Auto-sorted document vault per matter',
                  'OneDrive, Google Drive two-way sync',
                  'IRCC form auto-fill, barcode generation',
                  'Stage pipelines with task automation',
                  'AI-powered deadline tracking',
                  'Conflict check before every new matter',
                ].map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-900">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-violet-600">
                Learn more <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            {/* Pillar 3  -  Deliver */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Deliver</h3>
              <p className="mt-1 text-sm font-semibold text-emerald-600">Invoice, collect, and close the file</p>
              <ul className="mt-6 space-y-3">
                {[
                  'Retainer agreements, invoice generation',
                  'Online payments, no accounting software',
                  'Trust accounting, ledger built in',
                  'Disbursement tracking per matter',
                  'AR aging, revenue reports',
                  'Stripe-powered checkout in 1 click',
                ].map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-900">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-emerald-600">
                Learn more <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Client Portal */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">

            {/* Portal mockup */}
            <div className="relative order-2 lg:order-1">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                {/* Portal chrome */}
                <div className="flex items-center justify-between bg-indigo-600 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <NorvaLogo size={18} id="portal-mock" />
                    <span className="text-xs font-semibold text-white">Client Portal, NorvaOS</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Secure & Private
                  </div>
                </div>

                {/* Matter identity + stage */}
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Sharma, Patel</p>
                      <p className="text-xs text-gray-500">Spousal Sponsorship, PR Application</p>
                    </div>
                    <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      In Progress
                    </span>
                  </div>
                  {/* Stage progress bar */}
                  <div className="mt-2.5">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 3 ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                      {[
                        { label: 'Intake', active: true },
                        { label: 'Docs', active: true },
                        { label: 'Review', active: true },
                        { label: 'Filing', active: false },
                        { label: 'Done', active: false },
                      ].map(s => (
                        <span key={s.label} className={s.active ? 'font-semibold text-indigo-600' : ''}>{s.label}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Retainer status banner */}
                <div className="flex items-center justify-between border-b border-gray-100 bg-emerald-50 px-4 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Retainer Agreement signed, $3,500 received
                  </div>
                  <span className="text-[10px] text-emerald-600">Feb 14, 2026</span>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-4">
                  <span className="border-b-2 border-indigo-600 px-3 py-2 text-xs font-semibold text-indigo-600">Documents</span>
                  <span className="px-3 py-2 text-xs text-gray-400">Financial</span>
                  <span className="px-3 py-2 text-xs text-gray-400">Updates</span>
                </div>

                {/* Document list */}
                <div className="space-y-1 px-4 py-2.5">
                  {[
                    { name: 'Passport, Sharma', status: 'accepted', note: '' },
                    { name: 'Marriage Certificate', status: 'accepted', note: '' },
                    { name: 'Bank Statement, Jan 2026', status: 'reviewing', note: 'Under lawyer review' },
                    { name: 'T4 2023, Sharma', status: 'rejected', note: 'Must be original CRA copy' },
                    { name: 'Employment Letter', status: 'requested', note: 'Upload to continue' },
                  ].map(doc => (
                    <div key={doc.name} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="truncate text-xs text-gray-700">{doc.name}</span>
                        </div>
                        <span className={`shrink-0 flex items-center gap-1 text-xs font-medium ${
                          doc.status === 'accepted' ? 'text-emerald-600' :
                          doc.status === 'reviewing' ? 'text-amber-600' :
                          doc.status === 'rejected' ? 'text-red-600' :
                          'text-gray-500'
                        }`}>
                          {doc.status === 'accepted' && <CheckCircle className="h-3 w-3 shrink-0" />}
                          {doc.status === 'reviewing' && <Clock className="h-3 w-3 shrink-0" />}
                          {doc.status === 'rejected' && <XCircle className="h-3 w-3 shrink-0" />}
                          {doc.status === 'requested' && <AlertCircle className="h-3 w-3 shrink-0" />}
                          <span className="hidden sm:inline">
                            {doc.status === 'accepted' ? 'Accepted' :
                             doc.status === 'reviewing' ? 'In Review' :
                             doc.status === 'rejected' ? 'Re-upload' : 'Needed'}
                          </span>
                        </span>
                      </div>
                      {doc.note && (
                        <p className={`mt-0.5 pl-5 text-[10px] ${doc.status === 'rejected' ? 'text-red-500' : 'text-gray-400'}`}>{doc.note}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Action banner */}
                <div className="mx-4 mb-3 rounded-xl border border-red-100 bg-red-50 p-2.5">
                  <p className="text-xs font-semibold text-red-800">2 actions required to continue</p>
                  <p className="mt-0.5 text-xs text-red-700">
                    Re-upload T4 2023 (original CRA copy) · Upload Employment Letter
                  </p>
                </div>
              </div>

              {/* Floating financial summary */}
              <div className="hidden lg:block absolute -right-4 bottom-12 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold text-gray-900">Financial Summary</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Retainer held', value: '$3,500', color: 'text-emerald-600' },
                    { label: 'Billed to date', value: '$1,800', color: 'text-gray-700' },
                    { label: 'Remaining balance', value: '$1,700', color: 'text-indigo-600' },
                    { label: 'Outstanding', value: '$0.00', color: 'text-gray-400' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-10 text-xs">
                      <span className="text-gray-500">{row.label}</span>
                      <span className={`font-semibold ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="order-1 lg:order-2">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                <Globe className="h-3.5 w-3.5" />
                Branded Client Portal
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Your clients see
                <br />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  everything.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                Every client gets a branded portal showing real-time matter status, document
                validation, invoice history, and exactly what they need to do next.
                No phone tag. No emails asking for updates.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: CheckCircle,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'Document validation in real time',
                    desc: 'Clients see exactly which documents are accepted, under review, or rejected, with a clear reason and a one-click re-upload.',
                  },
                  {
                    icon: CreditCard,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Full financial transparency',
                    desc: 'Retainer balance, invoice history, and outstanding amounts, all visible from the portal without calling the office.',
                  },
                  {
                    icon: BellRing,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'Automatic follow-up requests',
                    desc: 'When a document is rejected or missing, clients are notified instantly with instructions. Zero staff involvement.',
                  },
                  {
                    icon: Shield,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    title: 'Matter progress at a glance',
                    desc: 'Stage-by-stage progress bar so clients always know where their file is and what comes next in the process.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BILLING & INVOICING ── */}
      <section id="billing" className="py-24 sm:py-32 bg-white border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                <DollarSign className="h-3.5 w-3.5" />
                Billing & Invoicing
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Get paid faster.
                <br />
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Every dollar tracked.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                From the moment a retainer is signed to the final invoice, NorvaOS manages
                your entire billing cycle. No separate accounting software. No manual
                spreadsheets. No missed disbursements.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: Receipt,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'Professional invoice generation',
                    desc: 'Generate branded invoices from time entries and flat fees in one click. Itemised disbursements included automatically.',
                  },
                  {
                    icon: CreditCard,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Stripe-powered online payments',
                    desc: 'Clients pay invoices directly from their portal with credit card or bank transfer. Payments reconcile to the matter instantly.',
                  },
                  {
                    icon: TrendingUp,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'AR aging & revenue reports',
                    desc: 'See exactly which invoices are overdue, by how many days, and by how much. Revenue broken down by practice area and lawyer.',
                  },
                  {
                    icon: Wallet,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    title: 'Retainer management',
                    desc: 'Track retainer balances in real time. Automatic low-balance alerts tell clients when to top up, so work never stops.',
                  },
                  {
                    icon: ClipboardList,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                    title: 'Disbursement tracking per matter',
                    desc: 'Government fees, courier charges, translation costs, and every out-of-pocket expense captured and billed accurately.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Billing mockup */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Invoice: INV-2026-0047</span>
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">Awaiting Payment</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* Invoice header */}
                  <div className="flex justify-between text-xs text-gray-500">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">Waseer Law Professional Corp.</p>
                      <p>To: Sharma, Patel</p>
                      <p>Matter: Spousal Sponsorship #2026-0047</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">Issue: Mar 15, 2026</p>
                      <p className="text-red-600 font-medium">Due: Mar 29, 2026</p>
                    </div>
                  </div>

                  {/* Line items */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 grid grid-cols-4 gap-2">
                      <span className="col-span-2">Description</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Amount</span>
                    </div>
                    {[
                      { desc: 'Legal Consultation (2.5 hrs @ $350/hr)', qty: '2.5h', amt: '$875.00' },
                      { desc: 'Document Review & Preparation', qty: '1.5h', amt: '$525.00' },
                      { desc: 'IRCC Application Filing Fee', qty: '1', amt: '$1,325.00' },
                      { desc: 'Biometrics Fee', qty: '1', amt: '$85.00' },
                      { desc: 'Courier to IRCC Ottawa', qty: '1', amt: '$22.50' },
                    ].map(row => (
                      <div key={row.desc} className="grid grid-cols-4 gap-2 px-3 py-2 text-xs border-t border-gray-50 hover:bg-gray-50/50">
                        <span className="col-span-2 text-gray-700">{row.desc}</span>
                        <span className="text-right text-gray-500">{row.qty}</span>
                        <span className="text-right font-medium text-gray-900">{row.amt}</span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-1.5">
                    {[
                      { label: 'Subtotal', value: '$2,832.50', bold: false },
                      { label: 'HST (13%)', value: '$368.23', bold: false },
                      { label: 'Retainer Applied', value: '−$1,800.00', bold: false },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between text-xs">
                        <span className="text-gray-600">{row.label}</span>
                        <span className={row.bold ? 'font-bold text-gray-900' : 'text-gray-700'}>{row.value}</span>
                      </div>
                    ))}
                    <div className="border-t border-emerald-200 pt-1.5 flex justify-between text-sm font-bold">
                      <span className="text-gray-900">Total Due</span>
                      <span className="text-emerald-700">$1,400.73</span>
                    </div>
                  </div>

                  {/* Pay button */}
                  <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-3 text-center">
                    <p className="text-xs font-bold text-white">Pay $1,400.73 Securely Online</p>
                    <p className="text-[10px] text-emerald-100 mt-0.5">Visa · Mastercard · Interac · Bank Transfer</p>
                  </div>
                </div>
              </div>

              {/* Floating AR badge */}
              <div className="hidden sm:block absolute -right-4 -top-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
                <p className="text-xs font-semibold text-gray-700 mb-2">AR Aging</p>
                <div className="space-y-1">
                  {[
                    { label: 'Current', value: '$4,200', color: 'bg-emerald-400' },
                    { label: '30 days', value: '$1,800', color: 'bg-amber-400' },
                    { label: '60+ days', value: '$650', color: 'bg-red-400' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                      <div className={`h-2 w-2 rounded-full ${r.color}`} />
                      <span className="text-gray-500">{r.label}</span>
                      <span className="ml-auto font-semibold text-gray-900">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ACCOUNTING ── */}
      <section id="trust" className="py-24 sm:py-32 bg-gradient-to-b from-emerald-50/40 to-white border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Trust ledger mockup */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 bg-emerald-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-emerald-100" />
                    <span className="text-sm font-semibold text-white">Trust Ledger: Waseer Law PC</span>
                  </div>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">Law Society Compliant</span>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
                  {[
                    { label: 'Total in Trust', value: '$47,250.00', color: 'text-emerald-700' },
                    { label: 'Active Matters', value: '18', color: 'text-indigo-700' },
                    { label: 'Pending Draw', value: '$8,400.00', color: 'text-amber-700' },
                  ].map(s => (
                    <div key={s.label} className="bg-white px-4 py-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                      <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Ledger entries */}
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Recent Trust Activity</p>
                  {[
                    { matter: 'Sharma, Patel (#2026-0047)', type: 'Receipt', desc: 'Retainer deposit', date: 'Mar 14', amount: '+$3,500.00', balance: '$3,500.00', dir: 'in' },
                    { matter: 'Adawi, Firas (#2026-0031)', type: 'Disbursement', desc: 'IRCC filing fee paid', date: 'Mar 12', amount: '−$1,325.00', balance: '$2,175.00', dir: 'out' },
                    { matter: 'Gondal, Waqas (#2026-0055)', type: 'Receipt', desc: 'Retainer top-up', date: 'Mar 10', amount: '+$2,000.00', balance: '$2,000.00', dir: 'in' },
                    { matter: 'Hassan, Nadia (#2026-0022)', type: 'Transfer to Gen.', desc: 'Fee earned, INV-0039', date: 'Mar 08', amount: '−$1,800.00', balance: '$700.00', dir: 'out' },
                    { matter: 'Malik, Saad (#2025-0198)', type: 'Receipt', desc: 'Initial retainer', date: 'Mar 05', amount: '+$5,000.00', balance: '$5,000.00', dir: 'in' },
                  ].map((entry, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{entry.matter}</p>
                          <p className="text-[10px] text-gray-500">{entry.type} · {entry.desc} · {entry.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-bold ${entry.dir === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>{entry.amount}</p>
                          <p className="text-[10px] text-gray-400">Bal: {entry.balance}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reconciliation banner */}
                <div className="mx-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">3-Way Reconciliation: Passed</p>
                      <p className="text-[10px] text-emerald-600">Bank · Ledger · Client balances all match as of Mar 19, 2026</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="hidden sm:flex absolute -left-4 top-16 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-lg">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
                  <Shield className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Law Society Ready</div>
                  <div className="text-xs text-gray-500">Audit-trail built in</div>
                </div>
              </div>
            </div>

            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                <Landmark className="h-3.5 w-3.5" />
                Norva Ledger
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Trust compliance.
                <br />
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Built in. Not bolted on.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                NorvaOS includes a Law Society–compliant trust accounting module that handles
                receipts, disbursements, three-way reconciliation, and client trust statements,
                all inside the same platform where the legal work happens.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: PiggyBank,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'Per-matter trust ledger',
                    desc: 'Every client matter has its own trust sub-ledger. Deposits, disbursements, and transfers are tracked individually, never commingled.',
                  },
                  {
                    icon: BarChart3,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Three-way reconciliation',
                    desc: 'Bank statement, trust ledger, and individual client balances reconciled automatically every month. Discrepancies flagged instantly.',
                  },
                  {
                    icon: FileText,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'Client trust statements',
                    desc: 'Generate a complete trust statement for any client or matter in one click, formatted for Law Society spot audits.',
                  },
                  {
                    icon: Shield,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    title: 'Law Society–ready audit log',
                    desc: 'Every trust transaction is immutably logged with timestamp, user, and reason. Ready for a Law Society of Ontario examination at any time.',
                  },
                  {
                    icon: BellRing,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                    title: 'Low-balance & overdraft alerts',
                    desc: 'Never accidentally overdraw a trust account. Alerts fire before a disbursement would take a client balance negative.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── APPOINTMENTS & SCHEDULING ── */}
      <section id="appointments" className="py-24 sm:py-32 bg-white border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                <CalendarDays className="h-3.5 w-3.5" />
                Appointments & Scheduling
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Your calendar.
                <br />
                <span className="bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                  Always under control.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                Clients book their own appointments online. You set the rules. NorvaOS
                syncs with Google Calendar and Outlook, sends automatic reminders, and
                links every appointment directly to the client&rsquo;s matter file.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: Globe,
                    color: 'text-sky-600',
                    bg: 'bg-sky-50',
                    title: 'Public booking page',
                    desc: 'Share a branded booking link. Clients choose a service type, pick a time slot, and confirm, all without calling the office.',
                  },
                  {
                    icon: RefreshCw,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Google & Outlook calendar sync',
                    desc: 'Two-way sync keeps your availability accurate across every device. Block times, set buffer periods, and define working hours.',
                  },
                  {
                    icon: BellRing,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'Automated reminders',
                    desc: '24-hour and 1-hour SMS + email reminders sent automatically. No-show rates drop by an average of 60%.',
                  },
                  {
                    icon: Video,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'Built-in video consultations',
                    desc: 'Virtual appointments include an auto-generated video link. No Zoom account needed. HD calls are hosted inside NorvaOS.',
                  },
                  {
                    icon: Briefcase,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    title: 'Linked to matter files',
                    desc: 'Every appointment is attached to the client\'s matter. Meeting notes, documents shared during the call, and outcomes are all stored in one place.',
                  },
                  {
                    icon: Users,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                    title: 'Team & multi-lawyer scheduling',
                    desc: 'Route bookings to the right lawyer based on practice area, language, or availability. Shared team calendar view for front desk staff.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar mockup */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 bg-sky-600 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-sky-100" />
                    <span className="text-sm font-semibold text-white">Appointments: March 2026</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Google synced
                  </div>
                </div>

                {/* Today's schedule */}
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Today, Thursday March 19</p>

                  {[
                    {
                      time: '9:00 AM',
                      client: 'Gondal, Waqas',
                      type: 'Initial Consultation',
                      mode: 'In-Person',
                      matter: '#2026-0055',
                      color: 'border-l-sky-500',
                      bg: 'bg-sky-50',
                      badge: 'text-sky-700 bg-sky-100',
                    },
                    {
                      time: '11:00 AM',
                      client: 'Sharma, Patel',
                      type: 'Document Review',
                      mode: 'Video Call',
                      matter: '#2026-0047',
                      color: 'border-l-violet-500',
                      bg: 'bg-violet-50',
                      badge: 'text-violet-700 bg-violet-100',
                    },
                    {
                      time: '2:00 PM',
                      client: 'Hassan, Nadia',
                      type: 'Strategy Meeting',
                      mode: 'In-Person',
                      matter: '#2026-0022',
                      color: 'border-l-indigo-500',
                      bg: 'bg-indigo-50',
                      badge: 'text-indigo-700 bg-indigo-100',
                    },
                    {
                      time: '4:30 PM',
                      client: 'Malik, Saad',
                      type: 'Signing: Retainer',
                      mode: 'Video Call',
                      matter: '#2025-0198',
                      color: 'border-l-emerald-500',
                      bg: 'bg-emerald-50',
                      badge: 'text-emerald-700 bg-emerald-100',
                    },
                  ].map(appt => (
                    <div key={appt.time} className={`rounded-xl border-l-4 ${appt.color} ${appt.bg} p-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-gray-900">{appt.time}: {appt.client}</p>
                          <p className="text-[10px] text-gray-600">{appt.type} · Matter {appt.matter}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${appt.badge}`}>
                          {appt.mode}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Booking stats */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 mt-2">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'Booked online', value: '3 of 4', color: 'text-sky-600' },
                        { label: 'Reminders sent', value: '4/4', color: 'text-emerald-600' },
                        { label: 'No-shows', value: '0', color: 'text-gray-400' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-gray-500">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating booking badge */}
              <div className="hidden sm:flex absolute -right-4 top-12 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 shadow-lg">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500">
                  <CalendarCheck className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Self-booked</div>
                  <div className="text-xs text-gray-500">No phone call needed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Standout features grid */}
      <section id="features" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">What sets us apart</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-black sm:text-5xl">
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
                desc: 'Every document is read, identified, and filed automatically the moment it arrives. Passports, T4s, police clearances, sorted without a click.',
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
                desc: 'IMM5257E, IMM5406, IMM5476, and more, auto-populated from client profiles with built-in validation, barcode embedding, and pack generation.',
              },
              {
                icon: Shield,
                color: 'text-amber-600',
                bg: 'bg-amber-50',
                title: 'Legal Compliance by Design',
                desc: 'Row-level security, full audit logs, PIPEDA-aligned storage, and guarded stage transitions. Compliance isn\'t an add-on. It\'s the foundation.',
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
                title: 'Built for Canadian Immigration',
                desc: 'Spousal sponsorship, work permits, study permits, PR applications, refugee claims, each with its own pipelines, intake forms, IRCC deadline types, and workflow templates.',
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
                desc: 'A walk-in intake kiosk for your reception. Clients self-check-in, sign consent forms, and submit documents, all before they sit down.',
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
                <p className="mt-2 text-sm leading-6 text-gray-900">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kiosk & Self Check-In */}
      <section className="bg-gradient-to-b from-white to-gray-50 py-24 sm:py-32 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            {/* Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pink-100 bg-pink-50 px-3 py-1 text-sm font-semibold text-pink-700">
                <Building2 className="h-3.5 w-3.5" />
                Front Desk Kiosk Mode
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-black sm:text-5xl">
                Walk-in ready.
                <br />
                <span className="bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                  Your front desk runs itself.
                </span>
              </h2>
              <p className="mt-4 text-lg text-gray-900">
                Place a tablet or print a QR code at reception. Clients tap their name, confirm their appointment,
                sign consent forms, and upload documents, all before they sit down.
                Your team is notified instantly, so staff can focus on higher-value work.
              </p>

              <div className="mt-8 space-y-5">
                {[
                  {
                    icon: Users,
                    color: 'text-pink-600',
                    bg: 'bg-pink-50',
                    title: 'One-tap self check-in',
                    desc: 'Clients select their name from today\'s appointment list. No typing, no confusion. The lawyer is notified the moment they arrive.',
                  },
                  {
                    icon: PenLine,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                    title: 'Digital consent on arrival',
                    desc: 'Consent to communicate, privacy policy, and any firm-specific forms are presented at check-in and signed on the spot.',
                  },
                  {
                    icon: FolderOpen,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    title: 'Document upload at the desk',
                    desc: 'Clients photograph and upload passports, letters, and supporting documents directly from the kiosk. Files go straight into their matter vault.',
                  },
                  {
                    icon: BellRing,
                    color: 'text-indigo-600',
                    bg: 'bg-indigo-50',
                    title: 'Instant staff notification',
                    desc: 'The moment a client checks in, the assigned lawyer and staff member receive a real-time alert with the client name, matter, and any documents uploaded.',
                  },
                  {
                    icon: Clock,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    title: 'Queue and wait time display',
                    desc: 'Clients see their queue position and estimated wait time. Walk-in inquiries can register and join a digital queue without speaking to anyone.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kiosk mockup */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="w-full max-w-sm">
                <div className="overflow-hidden rounded-3xl border-4 border-gray-800 bg-gray-800 shadow-2xl">
                  <div className="flex items-center justify-center bg-gray-800 py-2">
                    <div className="h-1.5 w-12 rounded-full bg-gray-600" />
                  </div>
                  <div className="bg-white">
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-center">
                      <div className="mb-1 text-xs font-medium text-indigo-200">WELCOME TO</div>
                      <div className="text-lg font-bold text-white">Waseer Law Professional Corp.</div>
                      <div className="mt-0.5 text-xs text-indigo-200">Please check in for your appointment</div>
                    </div>

                    <div className="px-5 py-5 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">Your name</label>
                        <div className="flex items-center gap-2 rounded-xl border-2 border-indigo-300 bg-indigo-50 px-3 py-2.5">
                          <Search className="h-4 w-4 text-indigo-400" />
                          <span className="text-sm text-indigo-700 font-medium">Sharma, Priya</span>
                          <CheckCircle className="ml-auto h-4 w-4 text-emerald-500" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-800">Appointment confirmed</span>
                        </div>
                        <div className="text-xs text-emerald-700">Today at 2:00 PM with Zia Waseer</div>
                        <div className="text-xs text-emerald-600">Spousal Sponsorship, Matter #2026-0047</div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1">Please confirm</div>
                        {[
                          { label: 'I consent to the firm\'s privacy policy', checked: true },
                          { label: 'I agree to electronic communications', checked: true },
                          { label: 'I consent to file recording', checked: false },
                        ].map(item => (
                          <div key={item.label} className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2">
                            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${item.checked ? 'bg-indigo-600' : 'border border-gray-300 bg-white'}`}>
                              {item.checked && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <span className="text-xs text-gray-700">{item.label}</span>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-3 text-center">
                        <FolderOpen className="mx-auto mb-1 h-5 w-5 text-violet-500" />
                        <div className="text-xs font-medium text-violet-700">Tap to upload documents</div>
                        <div className="text-xs text-violet-500">Passport, permits, or letters</div>
                      </div>

                      <button className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-lg">
                        Check In Now
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center bg-gray-800 py-3">
                    <div className="h-4 w-4 rounded-full border-2 border-gray-600" />
                  </div>
                </div>
              </div>

              <div className="hidden sm:flex absolute -right-4 top-16 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-lg">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500">
                  <BellRing className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Client arrived</div>
                  <div className="text-xs text-gray-500">Sharma, Priya, Room 2</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOUNDER SECTION ── */}
      <section className="bg-gray-100 py-20 sm:py-28 border-t border-gray-200">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">

          {/* Section label */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-1.5 text-sm font-medium text-indigo-700 shadow-sm">
              <Star className="h-3.5 w-3.5" />
              Why NorvaOS is different
            </div>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-black sm:text-5xl">
              Built by someone who felt
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                every one of these pain points.
              </span>
            </h2>
          </div>

          {/* ── LinkedIn-style profile card ── */}
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">

            {/* Banner  -  dark professional slate */}
            <div className="h-28" style={{background: 'linear-gradient(to right, #1e293b, #334155, #1e1b4b)'}} />

            {/* Avatar + name row */}
            <div className="px-6 pb-0">
              <div className="flex items-end gap-4 -mt-12 mb-4">
                {/* Circular avatar  -  face and shoulders only */}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg bg-slate-100">
                  <Image
                    src="/founder-outdoor.jpg"
                    alt="Zia Waseer"
                    fill
                    className="object-cover object-center"
                    priority
                  />
                </div>
                {/* Name + title beside avatar */}
                <div className="pb-1">
                  <h3 className="text-xl font-bold text-gray-900 leading-tight">Zia Waseer</h3>
                  <p className="text-sm text-gray-600">Founder &amp; Principal Lawyer, Waseer Law Office</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ontario, Canada</p>
                </div>
              </div>

              {/* Credentials  -  sorted chronologically */}
              <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                {[
                  { label: 'Microsoft Certified Professional, 1998',    color: 'bg-sky-50 text-sky-700 border-sky-100' },
                  { label: 'M.Sc. Computer Science, 2003',              color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                  { label: 'LLM, Master of Laws, UK, 2007',             color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                  { label: 'Qualified Solicitor, England & Wales, 2012', color: 'bg-amber-50 text-amber-700 border-amber-100' },
                  { label: 'Barrister & Solicitor, Ontario, 2019',       color: 'bg-rose-50 text-rose-700 border-rose-100' },
                ].map(c => (
                  <span key={c.label} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${c.color}`}>{c.label}</span>
                ))}
              </div>

              {/* PAIN POINTS  -  first, so visitors see the problem immediately */}
              <div className="py-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-3">The daily reality he watched, up close</p>
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                  <ul className="space-y-2.5">
                    {[
                      'Jumping between five or six apps just to manage one client file',
                      'IRCC forms changing without notice, no idea which version is current or what field was updated',
                      'Collecting data from emails, WhatsApp, folders, and sticky notes just to fill a single form',
                      'No idea how complete a file actually is, what is missing, or what percentage is done',
                      'Impossible to tell if a delay is coming from the lawyer, the consultant, or the client',
                      'Documents scattered across email threads, shared drives, and phone photos with no clear organisation',
                      'Last-minute panics the night before a hearing to find a document no one can locate',
                      'Trust account tracked in a spreadsheet, error-prone, unauditable, and one formula away from a problem',
                      'No visibility into which files are behind schedule across the whole office',
                      'No way to know if the office is compliant with Law Society requirements or ICCRC college obligations',
                      'Consultants calling late at night about an appeal with no shared file context anywhere',
                      'No single view of what a client owes, what is overdue, or what the next step is',
                    ].map(pain => (
                      <li key={pain} className="flex items-start gap-2.5 text-sm text-rose-900">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                        {pain}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* About  -  detailed founder message */}
              <div className="py-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">About</p>

                <p className="text-sm leading-6 text-gray-800 font-medium">
                  I know what it feels like to be mid-call with a client, switching between four apps, trying to remember which version of the IMM5645 was the current one, and wondering whether the document they sent last week was uploaded anywhere searchable.
                </p>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  Before law, I spent years in enterprise technology, managing large-scale government systems at the World Bank and for provincial departments handling land registry, transport, and immigration workflows. I know how to build systems that work under real pressure, for real institutions, with zero tolerance for failure.
                </p>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  Then I went to law school, qualified as a Solicitor in England and Wales, moved to Canada, and became a Barrister and Solicitor in Ontario. I opened Waseer Law Office and started practising immigration law. And within months I found myself doing exactly what I had spent years building systems to prevent: juggling spreadsheets, chasing documents over WhatsApp, and running a trust account out of a file I was terrified to break.
                </p>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  The consultants I worked with were dealing with the same thing, sometimes worse. They would call me at 11 pm about an appeal we were co-managing, and neither of us had a clear picture of what was missing, who was responsible for the next step, or how long the client had been waiting. We were both guessing. Our clients deserved better.
                </p>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  I watched good lawyers and consultants miss deadlines not because they were careless, but because the tools they were using were never designed for this work. IRCC forms change without warning. Checklists live in email threads. Billing is in one system, documents in another, notes in a third. Nobody knows how complete a file is until it is too late to fix it.
                </p>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  I built NorvaOS because I had the background to build it properly, and I had felt enough of the pain to know exactly what it needed to solve. <span className="font-semibold text-gray-900">This is the platform I wished existed on my first day in practice. Everything you need to run your office, in one place, with nothing falling through the cracks.</span>
                </p>
              </div>

              {/* Experience  -  2-column grid */}
              <div className="py-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Experience</p>
                <div className="grid gap-3" style={{gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'}}>

                  {[
                    { icon: BadgeCheck, title: 'Founder & Principal Lawyer', org: 'Waseer Law Office, Ontario', period: '2007 to Present', color: 'bg-indigo-50', iconColor: 'text-indigo-600', border: 'border-indigo-100' },
                    { icon: Scale,      title: 'Barrister & Solicitor, Ontario', org: 'Law Society of Ontario', period: '2019 to Present', color: 'bg-rose-50', iconColor: 'text-rose-600', border: 'border-rose-100' },
                    { icon: Scale,      title: 'Immigration Law Practice', org: 'Immigration, Appeals & Refugee', period: '2012 to Present', color: 'bg-emerald-50', iconColor: 'text-emerald-700', border: 'border-emerald-100' },
                    { icon: BookOpen,   title: 'Qualified Solicitor, England & Wales', org: 'Solicitors Regulation Authority', period: '2012', color: 'bg-teal-50', iconColor: 'text-teal-700', border: 'border-teal-100' },
                    { icon: Building2,  title: 'Project Manager, Government IT', org: 'Land Registry, Transport, Immigration', period: '2003 to 2006', color: 'bg-violet-50', iconColor: 'text-violet-600', border: 'border-violet-100' },
                    { icon: BadgeCheck, title: 'Project Manager, World Bank', org: 'Enterprise Technology Delivery', period: '2002 to 2003', color: 'bg-sky-50', iconColor: 'text-sky-600', border: 'border-sky-100' },
                  ].map(exp => (
                    <div key={exp.title} className={`flex items-start gap-3 rounded-xl border ${exp.border} bg-white p-3`}>
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${exp.color}`}>
                        <exp.icon className={`h-4 w-4 ${exp.iconColor}`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900 leading-tight">{exp.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{exp.org}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{exp.period}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Awards & Recognition */}
              <div className="py-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Awards & Recognition</p>
                <div className="space-y-3">
                  {[
                    {
                      icon: Award,
                      title: 'Best Lawyers: Ones to Watch',
                      org: 'Best Lawyers Canada',
                      year: '2025',
                      color: 'bg-amber-50', iconColor: 'text-amber-600', border: 'border-amber-100',
                    },
                    {
                      icon: Star,
                      title: 'Best Immigration Lawyer',
                      org: 'Three Best Rated, every year since 2022',
                      year: '2022, 2023, 2024, 2025',
                      color: 'bg-indigo-50', iconColor: 'text-indigo-600', border: 'border-indigo-100',
                    },
                    {
                      icon: BadgeCheck,
                      title: 'Nominated Best Small Business',
                      org: 'London Chamber of Commerce',
                      year: '2024',
                      color: 'bg-rose-50', iconColor: 'text-rose-600', border: 'border-rose-100',
                    },
                  ].map(award => (
                    <div key={award.title} className={`flex items-start gap-3 rounded-xl border ${award.border} ${award.color} px-4 py-3`}>
                      <div className="mt-0.5 shrink-0">
                        <award.icon className={`h-4 w-4 ${award.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{award.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{award.org}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold text-gray-400">{award.year}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Founder quote */}
              <div className="py-5">
                <blockquote className="rounded-xl border-l-4 border-indigo-500 bg-indigo-50 px-4 py-4">
                  <p className="text-sm leading-6 text-indigo-900 italic">
                    &ldquo;I&rsquo;ve sat across the table from consultants at midnight going through appeal files. I built NorvaOS so that conversation never has to happen again, because everything they need is already in one place, tracked, documented, and ready.&rdquo;
                  </p>
                  <cite className="mt-3 flex items-center gap-2 not-italic">
                    <div className="h-px flex-1 bg-indigo-200" />
                    <span className="text-xs font-bold text-indigo-800">Zia Waseer, Founder, NorvaOS</span>
                  </cite>
                </blockquote>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-base font-semibold text-indigo-600">What our founding firms say</p>
            <h2 className="mt-2 text-4xl font-bold tracking-tight text-black sm:text-5xl">
              Early access firms share their experience.
            </h2>
            <p className="mt-4 text-lg text-gray-800">
              We&rsquo;re onboarding founding firms now. Case studies and testimonials coming as they go live.
            </p>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 shadow-sm transition-all hover:border-gray-400 hover:shadow-md"
              >
                Become a founding firm →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── The Norva Privacy Standard ─── */}
      <section id="privacy-standard" className="relative py-24 sm:py-32 border-t border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              <Shield className="h-3.5 w-3.5" />
              PIPEDA-Aligned Architecture
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              The Norva Privacy Standard
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              NorvaOS operates as a Data Custodian under PIPEDA guidelines. We do not sell, monetise, or train AI on your sensitive legal files. Your data is your property; our fortress is your protection.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
            {/* Column A  -  Canadian Data Residency */}
            <div className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Canadian Data Residency</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Your data never leaves Canada. Strictly hosted in AWS ca-central-1 to meet Law Society and PIPEDA standards. No cross-border transfers, no exceptions.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-indigo-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-600" />
                ca-central-1 (Montréal)
              </div>
            </div>

            {/* Column B  -  Immutable Integrity */}
            <div className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600">
                <Fingerprint className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Immutable Integrity</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Every document in the Norva Vault is hashed with SHA-256 encryption. Proof of truth is etched into every file. Tamper-evident by design.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-violet-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-600" />
                SHA-256 Genesis Hash
              </div>
            </div>

            {/* Column C  -  Sovereign Compliance */}
            <div className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Sovereign Compliance</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Real-time compliance matrices at the Firm, Matter, and Client levels. Audit-ready by design, with automated checks against Law Society requirements.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-emerald-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Firm · Matter · Client
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative overflow-hidden py-24 sm:py-32"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Your practice deserves one system.
            </h2>
            <p className="mt-4 text-xl leading-8 text-indigo-100">
              Book a 20-minute demo. We&rsquo;ll show you exactly how it works for your practice area.
            </p>

            <div className="mt-10">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-700 shadow-lg transition-all hover:bg-indigo-50 hover:shadow-xl"
              >
                Book a 20-minute demo →
              </Link>
            </div>

            <p className="mt-6 text-sm font-medium text-white">
              Invitation-only during launch. Every firm is onboarded personally by our team.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-indigo-200">
              <span>🇨🇦 Canadian data storage</span>
              <span className="text-indigo-400">|</span>
              <span>PIPEDA-compliant</span>
              <span className="text-indigo-400">|</span>
              <span>Setup in minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Sovereign Footer ─── */}
      <footer className="border-t border-gray-200 bg-slate-900 text-gray-300">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5">
                <NorvaLogo size={28} id="footer" />
                <span className="text-lg font-bold text-white">NorvaOS</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                A complete legal operating system. Built in Canada, for Canadian law firms.
              </p>
              {/* PIPEDA Badge */}
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-gray-300">
                <Shield className="h-3.5 w-3.5 text-indigo-400" />
                PIPEDA-Aligned Architecture
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Legal</h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link href="/privacy" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Security
                  </Link>
                </li>
              </ul>
            </div>

            {/* Platform */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Platform</h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <a href="#platform" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#billing" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#trust" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Trust Accounting
                  </a>
                </li>
                <li>
                  <a href="#appointments" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Appointments
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Company</h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link href="/login" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Request Access
                  </Link>
                </li>
                <li>
                  <a href="mailto:support@norvaos.com" className="text-sm text-gray-400 transition-colors hover:text-white">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 md:flex-row">
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} NorvaOS Inc. All rights reserved. Data hosted in Canada (ca-central-1).
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>🇨🇦 Canadian-owned</span>
              <span className="text-slate-700">|</span>
              <span>PIPEDA-compliant</span>
              <span className="text-slate-700">|</span>
              <span>SOC 2 audit-ready</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
