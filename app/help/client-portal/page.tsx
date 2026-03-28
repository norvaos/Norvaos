'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NorvaLogo } from '@/components/landing/norva-logo'
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  Info,
  Upload,
  FileText,
  MessageSquare,
  CreditCard,
  Calendar,
  Star,
  Copy,
  ExternalLink,
  Users,
  Bell,
  Eye,
  XCircle,
  RefreshCw,
  Briefcase,
  ClipboardList,
  Send,
  Shield,
} from 'lucide-react'

// ── Shared UI helpers ────────────────────────────────────────────────────────

function Callout({ type, title, children }: { type: 'tip' | 'warning' | 'info'; title: string; children: React.ReactNode }) {
  const styles = { tip: 'bg-emerald-950/30 border-emerald-500/20', warning: 'bg-amber-950/30 border-amber-500/20', info: 'bg-blue-950/30 border-blue-500/20' }
  const textStyles = { tip: 'text-emerald-400', warning: 'text-amber-400', info: 'text-blue-400' }
  const icons = {
    tip: <Star className="h-4 w-4 text-emerald-600 shrink-0" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />,
    info: <Info className="h-4 w-4 text-blue-600 shrink-0" />,
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[type]}`}>
      <div className="flex items-start gap-2">
        {icons[type]}
        <div className={textStyles[type]}>
          <p className="font-semibold text-sm">{title}</p>
          <div className="mt-1 text-sm leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}

function StepBadge({ n, color = 'bg-indigo-600' }: { n: number; color?: string }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color} text-sm font-bold text-white`}>
      {n}
    </span>
  )
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{label}</span>
}

// ── Portal Mockup Components ─────────────────────────────────────────────────

function PortalHeaderMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-[#f5f5f5]">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900 text-sm">My Law Office</p>
          <p className="text-xs text-gray-400">Norva Document Bridge</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500">
          <Globe className="h-3.5 w-3.5" /> English ↓
        </div>
      </div>
      <div className="px-6 py-4 space-y-3">
        {/* Matter Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="font-semibold text-gray-900 text-sm">Ajaypal Singh  -  Visitor / Work Permit / Entry Matters</p>
          <div className="flex gap-3 mt-1 text-xs text-gray-400">
            <span>File: 2026-0019</span>
            <span>Case: Visitor / Work Permit / Entry Matters</span>
          </div>
          <p className="mt-2 text-xs text-gray-600">1 documents needed · 1 sections incomplete · 1 task to do</p>
          <div className="mt-2 w-full h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-gray-900 w-1/3" />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-400">Last updated: Mar 13, 2026</p>
            <p className="text-xs font-semibold text-gray-700">34%</p>
          </div>
        </div>
        {/* Case Progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Case Progress</p>
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-full border-4 border-gray-900 bg-white" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Matter Opened <span className="text-xs font-normal text-gray-400">(Current)</span></p>
              <p className="text-xs text-gray-400">12-Mar-2026</p>
            </div>
          </div>
        </div>
        {/* Legal Team */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Your Legal Team</p>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Responsible Lawyer</p>
          <p className="font-semibold text-gray-900 text-sm">Zia</p>
          <p className="text-xs text-indigo-600 mt-0.5">✉ zia@zia.com</p>
          <p className="text-xs text-indigo-600">📞 6479979676</p>
        </div>
        {/* Next Action */}
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">What You Need To Do Next</p>
            <p className="font-semibold text-gray-900 text-sm mt-0.5">Upload your Bank Statements  -  Last 3 Months</p>
          </div>
          <button className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap">Go →</button>
        </div>
        {/* Summary Tiles */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Documents', value: '1/2', sub: 'needed', color: 'border-amber-500/20 bg-amber-950/30' },
            { label: 'Shared Documents', value: '0', sub: '', color: 'border-gray-200 bg-white' },
            { label: 'Questions', value: '17%', sub: '', color: 'border-amber-500/20 bg-amber-950/30' },
            { label: 'Payment & Retainer', value: ' - ', sub: '', color: 'border-gray-200 bg-white' },
            { label: 'Tasks', value: '1', sub: '1 overdue', color: 'border-red-500/20 bg-red-950/30' },
            { label: 'Messages', value: '0', sub: '', color: 'border-gray-200 bg-white' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className={`rounded-xl border p-2.5 ${color}`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold ${value === '1' && sub.includes('overdue') ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
              {sub && <p className="text-xs text-red-500">{sub}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100 px-6 pb-3 pt-1">
        <p className="text-xs text-indigo-600 text-center">← Annotation: This is exactly what the client sees when they open their portal link</p>
      </div>
    </div>
  )
}

function DocumentsSectionMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-[#f5f5f5] p-4 space-y-2">
      <div className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-900 text-sm">Documents</span>
            <span className="text-xs text-gray-400">1/2 uploaded</span>
            <SectionLabel label="1 accepted" color="bg-emerald-950/30 text-emerald-400" />
            <SectionLabel label="1 needed" color="bg-amber-950/30 text-amber-400" />
          </div>
          <span className="text-gray-400 text-xs">∧</span>
        </div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Principal Applicant</p>
        {/* Identity */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-gray-700">Identity Documents</span>
            <span className="text-gray-400">1/1</span>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800">Valid Passport  -  Bio Page & Stamped Pages</p>
                <SectionLabel label="REQUIRED" color="bg-red-950/30 text-red-600" />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Upload a clear colour scan of your passport bio/data page and ALL stamped pages.</p>
            </div>
            <div className="flex items-center gap-1.5 ml-4 shrink-0">
              <SectionLabel label="Accepted ✓" color="bg-emerald-950/30 text-emerald-400" />
            </div>
          </div>
        </div>
        {/* Financial */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-gray-700">Financial Documents</span>
            <span className="text-gray-400">0/1</span>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800">Bank Statements  -  Last 3 Months</p>
                <SectionLabel label="REQUIRED" color="bg-red-950/30 text-red-600" />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Upload official bank statements showing sufficient funds.</p>
              <p className="text-xs text-gray-300 mt-0.5 italic">Upload a clear colour scan (PDF or image). Photos may be rejected.</p>
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <SectionLabel label="Not uploaded" color="bg-amber-950/30 text-amber-400" />
              <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                <Upload className="h-3 w-3" /> Upload
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-xs text-indigo-700 font-medium">
        → Each document row shows the status (Accepted / Not uploaded / Under Review / Re-upload Required) and the Upload button when action is needed
      </div>
    </div>
  )
}

function QuestionsSectionMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-[#f5f5f5] p-4 space-y-2">
      <div className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-900 text-sm">Questions</span>
            <span className="text-xs text-gray-400">0/1 forms done</span>
            <SectionLabel label="17% complete" color="bg-amber-950/30 text-amber-400" />
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-800 mb-1">IRCC Forms</p>
        <p className="text-xs text-gray-400 mb-1">0 of 3 completed</p>
        <div className="w-full h-1.5 rounded-full bg-gray-100 mb-3"><div className="h-1.5 rounded-full bg-gray-900 w-1/6" /></div>
        <p className="text-xs text-gray-500 mb-3">Overall progress: 18%</p>
        <div className="space-y-2">
          {[
            { code: 'IMM 5257', name: 'Application for Temporary Resident Visa', status: 'In Progress  -  17%', fields: '17 of 101 fields', pct: 17, isNext: true },
            { code: 'IMM 5406', name: 'Additional Family Information', status: 'In Progress  -  17%', fields: '4 of 24 fields', pct: 17, isNext: false },
            { code: 'IMM 5476', name: 'Use of a Representative', status: 'In Progress  -  60%', fields: '3 of 5 fields', pct: 60, isNext: false },
          ].map(({ code, name, status, fields, pct, isNext }) => (
            <div key={code} className={`rounded-xl border p-3 ${isNext ? 'border-l-4 border-l-indigo-500 border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{code}</span>
                  {isNext && <SectionLabel label="Next" color="bg-indigo-50 text-indigo-700" />}
                </div>
                <button className="text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1">Continue ›</button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{name}</p>
              <SectionLabel label={`● ${status}`} color="bg-blue-950/30 text-blue-400" />
              <p className="text-xs text-gray-400 mt-1.5">{fields}</p>
              <div className="w-full h-1 rounded-full bg-gray-200 mt-1"><div className="h-1 rounded-full bg-gray-900" style={{ width: `${pct}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Next: Complete "IMM 5257  -  IMM 5257E  -  Application for Temporary Resident Visa"</p>
      </div>
    </div>
  )
}

function FirmSidePortalMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      <div className="border-b border-gray-100 px-5 py-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-600">Matter page  -  Portal link row (firm view)</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              <Globe className="h-3.5 w-3.5" />
              PORTAL
            </div>
            <p className="text-xs text-indigo-600 truncate">http://localhost:3000/portal/bdeda0c6-a83f-4a16-a60a...</p>
          </div>
          <div className="flex gap-2 shrink-0 ml-3">
            <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
              <ExternalLink className="h-3 w-3" /> Open
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
          <p className="text-xs font-semibold text-indigo-800 mb-1">How to send this to the client</p>
          <ol className="space-y-1 text-xs text-indigo-700">
            <li>1. Click <strong>Copy</strong>  -  the full portal URL is copied to your clipboard</li>
            <li>2. Paste it into an email, WhatsApp, or SMS to the client</li>
            <li>3. The client clicks the link  -  no login or password required</li>
            <li>4. The link is unique to this matter and works for the life of the file</li>
          </ol>
        </div>
        <div className="rounded-xl bg-amber-950/30 border border-amber-100 px-4 py-3">
          <p className="text-xs font-semibold text-amber-400 mb-1 flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Security</p>
          <p className="text-xs text-amber-400">The portal link is a long, unique, unguessable token  -  like a secure one-time key. Do not share it publicly. It gives access to this client's documents and forms.</p>
        </div>
      </div>
    </div>
  )
}

// ── On-page sections ─────────────────────────────────────────────────────────

const onPageSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'How clients access the portal' },
  { id: 'firm-side', label: 'Finding the portal link (firm)' },
  { id: 'portal-home', label: 'Portal home  -  what clients see' },
  { id: 'documents', label: 'Documents section' },
  { id: 'document-statuses', label: 'Document statuses explained' },
  { id: 'questions', label: 'Questions / IRCC forms' },
  { id: 'payment', label: 'Payment & Retainer' },
  { id: 'tasks', label: 'Tasks section' },
  { id: 'messages', label: 'Messages' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'firm-monitoring', label: 'How the firm monitors activity' },
  { id: 'languages', label: 'Language support' },
  { id: 'tips', label: 'Tips & common mistakes' },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortalHelpPage() {
  const [active, setActive] = useState('overview')

  const scrollTo = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <NorvaLogo size={28} id="help-portal-nav" />
              <span className="font-bold text-gray-900">NorvaOS</span>
            </Link>
            <span className="text-gray-300">/</span>
            <Link href="/help" className="text-sm text-gray-500 hover:text-gray-900">Help</Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/help" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" /> Back to Help
            </Link>
            <Link href="/login" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Sign in</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-2xl">
        {/* Sidebar */}
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-4 py-6">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">On this page</p>
          <nav className="space-y-0.5">
            {onPageSections.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors text-left ${active === id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <ChevronRight className="h-3 w-3 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Related guides</p>
            <Link href="/help" className="block text-xs text-indigo-600 hover:underline py-0.5">← All Help Topics</Link>
            <Link href="/help/add-matter" className="block text-xs text-indigo-600 hover:underline py-0.5">Adding a Matter</Link>
            <Link href="/help#documents" className="block text-xs text-indigo-600 hover:underline py-0.5">Documents & Vault</Link>
            <Link href="/help#immigration" className="block text-xs text-indigo-600 hover:underline py-0.5">Immigration Module</Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-8 py-10 max-w-4xl">

          {/* Hero */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600">
                <Globe className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Client Portal</h1>
                <p className="text-gray-500 mt-0.5">Complete guide  -  for both firms and clients</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">⏱ 8 min read</span>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">Firm staff</span>
              <span className="rounded-full bg-emerald-950/30 px-3 py-1 text-emerald-400">Clients</span>
              <span className="rounded-full bg-blue-950/30 px-3 py-1 text-blue-400">All matter types</span>
            </div>
          </div>

          {/* Overview */}
          <section id="overview" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Overview</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">
                The <strong>Client Portal</strong> is a private, secure webpage that NorvaOS generates for every matter. You share the link with the client  -  they click it and land directly in their personal portal. <strong>No login, no password, no app download required.</strong>
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                From their portal, clients can upload required documents, fill in IRCC questionnaire forms, view their case progress, see invoices, receive messages, and complete tasks  -  all without calling the office or sending unsecured emails.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                  <p className="font-semibold text-indigo-800 text-sm mb-2">What the firm gets</p>
                  <ul className="space-y-1.5 text-xs text-indigo-700">
                    {[
                      'Documents arrive directly into the matter  -  no email attachments',
                      'IRCC forms auto-filled from client answers',
                      'Automatic notifications when client uploads or completes something',
                      'Full audit trail of what the client submitted and when',
                      'Reduces back-and-forth calls and emails dramatically',
                    ].map(i => <li key={i} className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-500" />{i}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-100 p-4">
                  <p className="font-semibold text-emerald-400 text-sm mb-2">What the client gets</p>
                  <ul className="space-y-1.5 text-xs text-emerald-400">
                    {[
                      'One link  -  everything in one place',
                      'Knows exactly what documents are needed and why',
                      'Can upload from phone, tablet, or computer',
                      'Sees when documents are accepted or need re-upload',
                      'Can fill IRCC forms at their own pace, from anywhere',
                      'Available in multiple languages',
                    ].map(i => <li key={i} className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />{i}</li>)}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Shield, label: 'Security', value: 'Unique unguessable token per matter' },
                  { icon: Globe, label: 'Access', value: 'No login or app required' },
                  { icon: Bell, label: 'Notifications', value: 'Firm notified instantly on every upload' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                    <Icon className="h-5 w-5 text-indigo-500 mx-auto mb-1" />
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* How clients access */}
          <section id="access" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">How Clients Access the Portal</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">The portal uses a <strong>secure link token</strong>  -  no account, no password. The client just clicks the link.</p>

              <div className="space-y-3">
                {[
                  { n: 1, title: 'Firm copies the portal link from the matter page', desc: 'Every matter has a Portal row below the Next Action panel. Click Copy to get the full URL.' },
                  { n: 2, title: 'Firm sends the link to the client', desc: 'Paste it into an email, WhatsApp, SMS, or any other communication. The client doesn\'t need to create an account.' },
                  { n: 3, title: 'Client clicks the link', desc: 'They land directly on their portal page  -  the matter title, their legal team, what they need to do, and all sections are visible immediately.' },
                  { n: 4, title: 'Client completes their actions', desc: 'They upload documents, fill forms, read messages  -  at their own pace, from any device.' },
                  { n: 5, title: 'Firm sees updates instantly', desc: 'Every upload or form completion is reflected immediately in the matter workspace. The firm receives an in-system notification.' },
                ].map(({ n, title, desc }) => (
                  <div key={n} className="flex gap-4 rounded-xl border border-gray-100 p-4">
                    <StepBadge n={n} />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Callout type="warning" title="The link works permanently">
                The portal link doesn't expire. It works for the entire life of the matter. If you need to revoke access, contact your system admin  -  this creates a new token and invalidates the old one.
              </Callout>

              <Callout type="tip" title="Works on any device">
                The portal is fully responsive. Clients can open it on their phone and upload a photo of a document directly from their camera roll. No desktop required.
              </Callout>
            </div>
          </section>

          {/* Firm side */}
          <section id="firm-side" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Finding the Portal Link (Firm Side)</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">The portal link lives on every matter page. Here's where to find it and how to use it.</p>

              <FirmSidePortalMockup />

              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Where to find it</h3>
                  <p className="text-sm text-gray-600">Open the matter → below the <strong>Next Action</strong> panel, you'll see a row labelled <strong>PORTAL</strong> with the full URL. It's always visible regardless of matter status.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Copy vs Open</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="flex items-center gap-1.5 mb-1"><Copy className="h-3.5 w-3.5 text-gray-500" /><p className="font-semibold text-sm text-gray-800">Copy</p></div>
                      <p className="text-xs text-gray-600">Copies the full portal URL to your clipboard. Paste it into your email or message to the client.</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                      <div className="flex items-center gap-1.5 mb-1"><ExternalLink className="h-3.5 w-3.5 text-gray-500" /><p className="font-semibold text-sm text-gray-800">Open</p></div>
                      <p className="text-xs text-gray-600">Opens the portal in a new tab so you can see exactly what the client sees. Useful for troubleshooting or demonstrating the portal to a client in-office.</p>
                    </div>
                  </div>
                </div>
              </div>

              <Callout type="info" title="Send the portal link early">
                Send the portal link as soon as you create the matter. Clients can start uploading documents and filling forms immediately, even before you've completed the full setup.
              </Callout>
            </div>
          </section>

          {/* Portal Home */}
          <section id="portal-home" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Portal Home  -  What Clients See</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600">When a client opens their portal link, this is what they see  -  from top to bottom:</p>

              <PortalHeaderMockup />

              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">①</span> Header
                  </h3>
                  <p className="text-sm text-gray-600">Shows your firm name ("My Law Office"), the subtitle "Norva Document Bridge", and a language switcher in the top right. The firm name comes from your <strong>Settings → Firm Profile</strong>.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">②</span> Matter Summary Card
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">The first card shows the matter's identity:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: 'Matter title', desc: 'The name of the matter, e.g. "Ajaypal Singh  -  Visitor / Work Permit"' },
                      { label: 'File number', desc: 'e.g. 2026-0019  -  referenced in all communications' },
                      { label: 'Case type', desc: 'e.g. "Visitor / Work Permit / Entry Matters"' },
                      { label: 'Summary counts', desc: 'How many documents needed, sections incomplete, tasks to do' },
                      { label: 'Progress bar', desc: 'Overall completion as a percentage  -  increases as client completes items' },
                      { label: 'Last updated', desc: 'When anything was last changed on this matter' },
                    ].map(({ label, desc }) => (
                      <div key={label} className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
                        <p className="font-semibold text-gray-800">{label}</p>
                        <p className="text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">③</span> Case Progress Timeline
                  </h3>
                  <p className="text-sm text-gray-600">Shows the client where they are in the overall process. Each stage is shown as a timeline node. The current stage is marked with a bold dot. Upcoming stages are shown in grey so the client understands the journey ahead.</p>
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs">
                    {['Matter Opened', 'Intake Complete', 'Application Submitted', 'Decision Pending', 'Outcome'].map((s, i) => (
                      <div key={s} className="flex items-center gap-1.5">
                        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${i === 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {i === 0 && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          {s}
                        </div>
                        {i < 4 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">④</span> Your Legal Team
                  </h3>
                  <p className="text-sm text-gray-600">Shows the responsible lawyer's name, email, and phone number. The client can use these contact details to reach their lawyer directly. This information comes from the <strong>Responsible Lawyer</strong> field set when the matter was created.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">⑤</span> What You Need To Do Next (amber panel)
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">This is the most important element on the portal. It tells the client the single most important action to take right now  -  in plain language, not legal jargon. It updates automatically as they complete items.</p>
                  <div className="space-y-1.5">
                    {[
                      '"Upload your Bank Statements  -  Last 3 Months"',
                      '"Complete IMM 5257  -  Application for Temporary Resident Visa"',
                      '"Sign and return your retainer agreement"',
                      '"All done  -  your lawyer is reviewing your file"',
                    ].map(msg => (
                      <div key={msg} className="flex items-center gap-2 rounded-lg bg-amber-950/30 border border-amber-100 px-3 py-2">
                        <ArrowRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <p className="text-xs font-medium text-gray-800">{msg}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-900 text-white text-xs px-2 py-0.5">⑥</span> Summary Tiles (6-tile grid)
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">Six tiles give a quick-glance view of every area. Tiles with outstanding items are highlighted in amber or red. Each tile is clickable and jumps to the relevant section below.</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { tile: 'Documents', desc: 'How many documents uploaded vs required. Amber if any missing.', highlight: 'Amber' },
                      { tile: 'Shared Documents', desc: 'Documents the firm has shared with the client (e.g. approval letters, receipts).', highlight: 'None' },
                      { tile: 'Questions', desc: 'Overall % of IRCC form questions answered. Amber if incomplete.', highlight: 'Amber' },
                      { tile: 'Payment & Retainer', desc: 'Invoices and retainer status. Shows outstanding balance if any.', highlight: 'Red if overdue' },
                      { tile: 'Tasks', desc: 'Tasks assigned to the client. Red highlight and OVERDUE badge if past due.', highlight: 'Red if overdue' },
                      { tile: 'Messages', desc: 'Unread messages from the firm. Count shown.', highlight: 'None' },
                    ].map(({ tile, desc, highlight }) => (
                      <div key={tile} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">{tile}</p>
                        <p className="text-gray-500 mt-1 leading-relaxed">{desc}</p>
                        <p className="mt-1.5 text-gray-400">Highlight: {highlight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Documents Section */}
          <section id="documents" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Documents Section</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">The Documents section is where clients upload every file the firm needs. It is pre-populated with exactly the documents required for this specific matter type  -  the client doesn't need to guess what to send.</p>

              <DocumentsSectionMockup />

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">How it's organised</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Documents are grouped by <strong>person</strong> (Principal Applicant, Spouse, Dependant 1, etc.) and within each person by <strong>category</strong> (Identity Documents, Financial Documents, Other Documents).</p>
                    <p>Each row shows: document name, description of exactly what to upload, whether it's required, the current status, and an Upload button when action is needed.</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">How to upload a document</h3>
                  <div className="space-y-2">
                    {[
                      { n: 1, text: 'Find the document row that shows "Not uploaded" status' },
                      { n: 2, text: 'Read the description carefully  -  it explains exactly what format is required' },
                      { n: 3, text: 'Click the Upload button' },
                      { n: 4, text: 'Select the file from your device (PDF, JPG, or PNG accepted)' },
                      { n: 5, text: 'The status changes to "Under Review" immediately after upload' },
                      { n: 6, text: 'Wait for the firm to review it  -  status will change to "Accepted" or "Re-upload Required"' },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{n}</span>
                        <p className="text-sm text-gray-700">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Submit a Document (custom upload)</h3>
                  <p className="text-sm text-gray-600">Below the required document list is a <strong>Submit a Document</strong> collapsible panel. Clients can use this to send additional documents that weren't in the checklist  -  for example, a support letter they want to include or a document the lawyer asked for verbally.</p>
                </div>

                <Callout type="tip" title="Photos are accepted but scans are better">
                  Clients can take a photo of a document with their phone and upload it. However, for official documents like passports and bank statements, a flat scanner scan produces better results and is less likely to be rejected.
                </Callout>

                <Callout type="warning" title="Each upload replaces the previous version">
                  If a document is rejected and the client re-uploads, the new file replaces the old one in the system. The firm sees the latest version. The audit trail preserves all versions internally.
                </Callout>
              </div>
            </div>
          </section>

          {/* Document Statuses */}
          <section id="document-statuses" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Document Statuses Explained</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">Every document slot shows one of these five statuses at all times. Understanding them helps both the client and the firm know where things stand.</p>

              <div className="space-y-3">
                {[
                  {
                    status: 'Not uploaded',
                    color: 'bg-amber-950/30 border-amber-500/20',
                    badge: 'bg-amber-950/30 text-amber-400',
                    icon: <Upload className="h-5 w-5 text-amber-500" />,
                    firmAction: 'Document is empty. The client needs to upload it.',
                    clientAction: 'Click Upload and select the file from your device.',
                    blocksProgress: true,
                  },
                  {
                    status: 'Under Review',
                    color: 'bg-blue-950/30 border-blue-500/20',
                    badge: 'bg-blue-950/30 text-blue-400',
                    icon: <Eye className="h-5 w-5 text-blue-500" />,
                    firmAction: 'Client has uploaded  -  firm needs to review and either accept or request re-upload.',
                    clientAction: 'Nothing to do. Wait for the firm to review your upload.',
                    blocksProgress: true,
                  },
                  {
                    status: 'Accepted',
                    color: 'bg-emerald-950/30 border-emerald-500/20',
                    badge: 'bg-emerald-950/30 text-emerald-400',
                    icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
                    firmAction: 'Document is complete. No action needed.',
                    clientAction: 'Done. Your document has been accepted.',
                    blocksProgress: false,
                  },
                  {
                    status: 'Re-upload Required',
                    color: 'bg-red-950/30 border-red-500/20',
                    badge: 'bg-red-950/30 text-red-400',
                    icon: <RefreshCw className="h-5 w-5 text-red-500" />,
                    firmAction: 'Firm rejected the document  -  client will see a reason and must re-upload.',
                    clientAction: 'Read the rejection reason shown below the document name. Upload a corrected version.',
                    blocksProgress: true,
                  },
                  {
                    status: 'Rejected',
                    color: 'bg-gray-50 border-gray-200',
                    badge: 'bg-gray-100 text-gray-600',
                    icon: <XCircle className="h-5 w-5 text-gray-400" />,
                    firmAction: 'Document was rejected and the slot has been closed. Used for documents that are no longer required.',
                    clientAction: 'This document is no longer needed. The firm has removed it from your checklist.',
                    blocksProgress: false,
                  },
                ].map(({ status, color, badge, icon, firmAction, clientAction, blocksProgress }) => (
                  <div key={status} className={`rounded-xl border p-4 ${color}`}>
                    <div className="flex items-center gap-3 mb-3">
                      {icon}
                      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badge}`}>{status}</span>
                      {blocksProgress && <span className="rounded-full bg-red-950/40 text-red-400 px-2 py-0.5 text-xs font-medium">Blocks progress</span>}
                      {!blocksProgress && <span className="rounded-full bg-emerald-950/40 text-emerald-400 px-2 py-0.5 text-xs font-medium">No action needed</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-white/60 border border-white p-2.5">
                        <p className="font-semibold text-gray-700 mb-1">Firm sees:</p>
                        <p className="text-gray-600">{firmAction}</p>
                      </div>
                      <div className="rounded-lg bg-white/60 border border-white p-2.5">
                        <p className="font-semibold text-gray-700 mb-1">Client sees / does:</p>
                        <p className="text-gray-600">{clientAction}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Questions / IRCC Forms */}
          <section id="questions" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Questions / IRCC Forms</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">For immigration matters, the Questions section contains the IRCC forms the client needs to fill in. The client's answers are used to auto-populate the official PDF forms (IMM 5257E, IMM 5406, IMM 5476E, etc.).</p>

              <QuestionsSectionMockup />

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">What the client sees</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Each form is shown as a card with: form code (e.g. IMM 5257), form name, status badge (In Progress / Completed), field count (e.g. "17 of 101 fields"), and a progress bar.</p>
                    <p>The <strong>Next</strong> badge highlights which form the client should complete first. The system recommends the most important form based on readiness status.</p>
                    <p>Below the form list: guidance text showing what to work on next  -  e.g. "Next: Complete IMM 5257  -  Application for Temporary Resident Visa".</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Filling in a form</h3>
                  <div className="space-y-2">
                    {[
                      { n: 1, text: 'Click Continue on the form card marked "Next"' },
                      { n: 2, text: 'The form opens as a step-by-step questionnaire  -  one section at a time' },
                      { n: 3, text: 'Fill in each field. Fields already filled by the lawyer are pre-populated' },
                      { n: 4, text: 'Click Save & Continue to move to the next section' },
                      { n: 5, text: 'You can stop anytime and come back later  -  progress is saved automatically' },
                      { n: 6, text: 'Once all fields are filled, the form status changes to "Complete"' },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{n}</span>
                        <p className="text-sm text-gray-700">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">What happens with the answers</h3>
                  <p className="text-sm text-gray-600 mb-2">Every answer the client gives is stored in the matter's IRCC Intake section on the firm side. When the lawyer generates the form pack, the system uses these answers to auto-fill the PDF forms. The lawyer reviews them before generating the final version.</p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  {[
                    { form: 'IMM 5257E', name: 'Application for Temporary Resident Visa', fields: 101, desc: 'Main application form  -  personal info, travel history, employment, finances' },
                    { form: 'IMM 5406', name: 'Additional Family Information', fields: 24, desc: 'Family members\' details  -  parents, siblings, spouse, children' },
                    { form: 'IMM 5476E', name: 'Use of a Representative', fields: 5, desc: 'Authorises the lawyer to act on the applicant\'s behalf' },
                  ].map(({ form, name, fields, desc }) => (
                    <div key={form} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="font-bold text-gray-900">{form}</p>
                      <p className="font-medium text-gray-700 text-sm mt-0.5">{name}</p>
                      <p className="text-gray-400 mt-1">{fields} fields</p>
                      <p className="text-gray-500 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>

                <Callout type="tip" title="Clients can come back and continue later">
                  Progress is saved after every field. If a client runs out of time or doesn't have information ready, they can close the portal and come back later  -  all previous answers are preserved.
                </Callout>

                <Callout type="info" title="Some fields are pre-filled by the lawyer">
                  Fields the lawyer already knows (name, DOB, file number, representative details) are pre-populated. The client only needs to fill in personal history, family information, and financial details.
                </Callout>
              </div>
            </div>
          </section>

          {/* Payment & Retainer */}
          <section id="payment" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Payment & Retainer</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">The Payment & Retainer section shows the client all financial activity on their file  -  retainer agreement status, invoices, and outstanding balances.</p>

              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">What clients see here</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { item: 'Retainer agreement', desc: 'The engagement agreement between the client and the firm. Shown as a document with a Sign button if not yet signed.' },
                      { item: 'Invoice list', desc: 'All invoices for this matter  -  retainer deposit, milestone payments, disbursements. Each shows amount, date, and paid/outstanding status.' },
                      { item: 'Outstanding balance', desc: 'If any invoice is unpaid, the total outstanding is shown prominently. A Pay Now button allows online payment if Stripe is configured.' },
                      { item: 'Payment history', desc: 'A record of all payments made, with dates and amounts.' },
                    ].map(({ item, desc }) => (
                      <div key={item} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                        <CreditCard className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        <div><p className="font-semibold text-gray-800">{item}</p><p className="text-gray-500 mt-0.5">{desc}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
                <Callout type="info" title="No invoices on file">
                  If the portal shows "No invoices on file", it means the firm hasn't created a retainer or invoice yet. The firm creates invoices from the matter's Billing tab.
                </Callout>
                <Callout type="tip" title="Online payment requires Stripe">
                  If you want clients to pay directly from the portal, make sure Stripe is connected in Settings → Billing. Without Stripe, clients see the invoice but no Pay Now button.
                </Callout>
              </div>
            </div>
          </section>

          {/* Tasks */}
          <section id="tasks" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Tasks Section</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">The Tasks section shows tasks that have been assigned to the client by the firm. These are actions the client needs to take outside of uploading documents or filling forms.</p>

              <div className="space-y-3 text-sm">
                {[
                  { icon: ClipboardList, title: 'What tasks look like', desc: 'Each task shows a title, due date, description, and a checkbox to mark complete. Overdue tasks are highlighted in red with an OVERDUE badge.' },
                  { icon: Bell, title: 'OVERDUE badge', desc: 'If a task is past its due date, the entire Tasks tile in the summary grid turns red and shows "X overdue". The task itself is highlighted inside the section.' },
                  { icon: CheckCircle, title: 'Marking a task complete', desc: 'The client can check the checkbox to mark a task done. The firm is notified and the task is updated in the matter workspace.' },
                  { icon: Users, title: 'Who creates client tasks', desc: 'Tasks assigned to the client are created by the firm from the matter\'s Tasks tab. When a task is assigned to a portal contact, it appears in the client portal.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                    <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                    <div><p className="font-semibold text-gray-800">{title}</p><p className="text-gray-500 mt-0.5">{desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Messages */}
          <section id="messages" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Messages</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">The Messages section is a simple, secure messaging channel between the firm and the client  -  directly inside the portal.</p>
              <div className="space-y-3 text-sm">
                {[
                  { icon: MessageSquare, title: 'How it works', desc: 'Messages sent from the firm\'s matter page appear here. The client can read them and reply. All messages are stored in the matter\'s communication log on the firm side.' },
                  { icon: Bell, title: 'Unread count', desc: 'The Messages tile in the summary grid shows the count of unread messages. If the firm sends a new message, the count increases.' },
                  { icon: Send, title: 'Replying', desc: 'Clients type their reply in the message box and click Send. The firm receives the reply as a new communication event on the matter.' },
                  { icon: Shield, title: 'Secure channel', desc: 'Unlike email, portal messages can\'t be intercepted, forwarded, or stored in an unsecured inbox. They\'re tied to the matter and only accessible through the portal link.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                    <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                    <div><p className="font-semibold text-gray-800">{title}</p><p className="text-gray-500 mt-0.5">{desc}</p></div>
                  </div>
                ))}
              </div>
              <Callout type="tip" title="Use messages for document rejection reasons">
                When you reject a document, add a message explaining what was wrong and what the client needs to upload instead. It shows up in both the document row and in the Messages section.
              </Callout>
            </div>
          </section>

          {/* Calendar */}
          <section id="calendar" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Calendar</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">The Calendar section shows the client upcoming appointments, consultations, and important deadlines related to their matter.</p>
              <div className="space-y-3 text-sm">
                {[
                  { icon: Calendar, title: 'What appears here', desc: 'Booked appointments (consultations, follow-up calls), important matter deadlines (submission dates, hearing dates), and any events the firm has added to the matter calendar.' },
                  { icon: Bell, title: 'Count of 0', desc: 'A count of 0 simply means no upcoming appointments or deadlines have been added yet. The calendar tile will update as the firm adds events.' },
                  { icon: Eye, title: 'Read-only for clients', desc: 'Clients can view calendar events but cannot create or modify them. Bookings are created by the firm or through the public booking page.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                    <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                    <div><p className="font-semibold text-gray-800">{title}</p><p className="text-gray-500 mt-0.5">{desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Firm monitoring */}
          <section id="firm-monitoring" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">How the Firm Monitors Portal Activity</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">Everything the client does in the portal is reflected instantly on the firm side. Here's what the firm sees and where.</p>

              <div className="space-y-3">
                {[
                  {
                    event: 'Client uploads a document',
                    where: 'Matter → Documents section',
                    desc: 'The document slot changes from "Not uploaded" to "Under Review". A notification is sent to the responsible lawyer. The readiness % updates.',
                    action: 'Firm reviews the document → clicks Accept or Request Re-upload (with a reason)',
                  },
                  {
                    event: 'Client completes a form section',
                    where: 'Matter → IRCC Intake tab',
                    desc: 'The completed fields appear in the IRCC questionnaire with "Portal" as the source. Form % updates in the readiness bar.',
                    action: 'Lawyer reviews answers, verifies fields, and marks them as verified.',
                  },
                  {
                    event: 'Client marks a task complete',
                    where: 'Matter → Tasks tab',
                    desc: 'Task is marked done and moved to the completed list. A notification is sent to the assigned firm member.',
                    action: 'Firm reviews and confirms the task is complete.',
                  },
                  {
                    event: 'Client sends a message',
                    where: 'Matter → More → Communications',
                    desc: 'The message appears as a new communication event on the matter. A notification is sent to the responsible lawyer and follow-up staff.',
                    action: 'Firm reads and replies from the matter\'s communication section.',
                  },
                ].map(({ event, where, desc, action }) => (
                  <div key={event} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900 text-sm">{event}</p>
                      <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 text-xs font-medium">{where}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{desc}</p>
                    <div className="flex items-start gap-1.5 text-xs text-emerald-400">
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <p><strong>Firm action:</strong> {action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Languages */}
          <section id="languages" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Language Support</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">The client portal supports multiple languages. Clients can switch language using the dropdown in the top-right corner of the portal header.</p>
              <div className="grid grid-cols-4 gap-2">
                {['English', 'French', 'Punjabi', 'Urdu', 'Hindi', 'Arabic', 'Spanish', 'Simplified Chinese'].map(lang => (
                  <div key={lang} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                    <Globe className="h-4 w-4 text-indigo-400 mx-auto mb-1" />
                    <p className="text-xs font-medium text-gray-700">{lang}</p>
                  </div>
                ))}
              </div>
              <Callout type="info" title="Language affects portal labels, not your content">
                Switching language changes the interface text (button labels, section headings, instructions). Document names and form questions are shown in the language your firm configured them.
              </Callout>
            </div>
          </section>

          {/* Tips */}
          <section id="tips" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Tips & Common Mistakes</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <div>
                <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Star className="h-4 w-4 text-emerald-500" />Tips for using the portal effectively</p>
                <div className="space-y-2">
                  {[
                    { tip: 'Send the portal link in your first email after creating the matter', detail: 'The sooner the client has the link, the sooner they can start uploading. Don\'t wait until everything is perfectly set up.' },
                    { tip: 'Add a short note explaining what the link is', detail: 'e.g. "This is your secure portal where you can upload all documents and fill in your application forms. No login required  -  just click the link."' },
                    { tip: 'Review and accept/reject documents within 24 hours', detail: 'Clients check back frequently. If their upload sits in "Under Review" for days, they assume something is wrong and call the office.' },
                    { tip: 'Use the portal for all document collection', detail: 'Avoid accepting documents by email. Using the portal keeps everything in one place and creates a clean audit trail.' },
                    { tip: 'Verify portal display using the Open button', detail: 'Before sending the link to a client, click Open to preview exactly what they\'ll see. Make sure the correct documents are listed and the matter details are accurate.' },
                  ].map(({ tip, detail }) => (
                    <div key={tip} className="flex gap-2 rounded-lg bg-emerald-950/30 border border-emerald-100 p-3">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">{tip}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" />Common mistakes to avoid</p>
                <div className="space-y-2">
                  {[
                    { mistake: 'Sending the portal link before the matter type is set', fix: 'If the matter type is wrong, the document checklist will be wrong too. Set Practice Area and Matter Type first, then send the link.' },
                    { mistake: 'Accepting poor-quality document scans', fix: 'A blurry photo that gets accepted now may be rejected by IRCC later. Set the standard high  -  clear, colour scans of the full document including all pages.' },
                    { mistake: 'Not adding rejection reasons when declining a document', fix: 'Always type a clear reason in the rejection note. "Please re-upload your passport scan  -  the stamped pages are missing." The client sees this and knows exactly what to fix.' },
                    { mistake: 'Sharing the portal link in a group message or chat', fix: 'The portal link gives access to the client\'s sensitive documents. Send it only to the client directly via a private message or email.' },
                  ].map(({ mistake, fix }) => (
                    <div key={mistake} className="flex gap-2 rounded-lg bg-red-950/30 border border-red-100 p-3">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-900">{mistake}</p>
                        <p className="text-xs text-red-400 mt-0.5"><strong>Fix:</strong> {fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Nav footer */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <Link href="/help" className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" /> Back to Help Centre
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/help/add-matter" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4" /> Adding a Matter
              </Link>
              <Link href="/help#immigration" className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                Immigration Module <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
