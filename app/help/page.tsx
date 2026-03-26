'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NorvaLogo } from '@/components/landing/norva-logo'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  CreditCard,
  Settings,
  Search,
  ChevronRight,
  CheckCircle,
  ArrowRight,
  BookOpen,
  Zap,
  Shield,
  Globe,
  FolderOpen,
  BarChart3,
  Clock,
  Bell,
  UserPlus,
  PenLine,
  Layers,
  Building2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Target,
  AlertCircle,
  Star,
  Workflow,
  Mail,
} from 'lucide-react'

const sections = [
  { id: 'getting-started', label: 'Getting Started', icon: BookOpen },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'contacts', label: 'Contacts & Leads', icon: Users },
  { id: 'matters', label: 'Matters', icon: Briefcase },
  { id: 'documents', label: 'Norva Document Bridge', icon: FolderOpen },
  { id: 'calendar', label: 'Norva Scheduler', icon: Calendar },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle },
  { id: 'communications', label: 'Communications', icon: MessageSquare },
  { id: 'billing', label: 'Billing & Finance', icon: CreditCard },
  { id: 'immigration', label: 'Immigration Module', icon: Globe },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings & Workspace', icon: Settings },
  { id: 'client-portal', label: 'Client Portal', icon: UserPlus },
  { id: 'front-desk', label: 'Front Desk Kiosk', icon: Building2 },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
]

function FAQ({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="font-medium text-gray-900">{question}</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-gray-600">{answer}</p>}
    </div>
  )
}

function SectionTag({ color, label }: { color: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function StepCard({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm text-gray-600">{desc}</p>
      </div>
    </div>
  )
}

function FeatureRow({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
        <Icon className="h-4.5 w-4.5 text-indigo-600" />
      </div>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
    </div>
  )
}

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState('getting-started')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSections = sections.filter(s =>
    s.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <NorvaLogo size={28} id="help-nav" />
              <span className="font-bold text-gray-900">NorvaOS</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-500">Help & Documentation</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Back to site</Link>
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-2xl">
        {/* Sidebar */}
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-4 py-6">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search topics..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Sections</p>
          <nav className="space-y-0.5">
            {filteredSections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeSection === id
                    ? 'bg-indigo-50 font-semibold text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-xl bg-indigo-50 p-4">
            <p className="text-xs font-semibold text-indigo-700">Need more help?</p>
            <p className="mt-1 text-xs text-indigo-600">Email us at support@norvaos.com and we'll get back to you within 24 hours.</p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-8 py-10 max-w-4xl">

          {/* Getting Started */}
          <section id="getting-started" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Getting Started</h2>
                <p className="text-sm text-gray-500">Everything you need to get up and running</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-900">Welcome to NorvaOS</h3>
              <p className="mb-6 text-sm leading-relaxed text-gray-600">
                NorvaOS is a complete legal operations platform built for law firms. It replaces your document storage,
                e-signing, scheduling, case management, and billing tools — all in one tab. Here's how to get started in under 10 minutes.
              </p>

              <div className="space-y-5">
                <StepCard number={1} title="Set up your workspace" desc="Go to Settings → Workspace and add your firm name, logo, address, and contact details. This appears on all documents and client communications." />
                <StepCard number={2} title="Invite your team" desc="Settings → Team Members → Invite. Assign roles: Admin, Lawyer, Paralegal, or Front Desk. Each role has specific permissions." />
                <StepCard number={3} title="Configure matter types" desc="Settings → Matter Types. Add the types of cases your firm handles (e.g. Immigration, Family Law). Each type can have its own intake form and document checklist." />
                <StepCard number={4} title="Add your first contact" desc="Go to Contacts → New Contact. Add a client or lead. From a contact, you can open a matter, book a consultation, or send documents." />
                <StepCard number={5} title="Create your first matter" desc="Go to Matters → New Matter. Select the client, matter type, and assign a responsible lawyer. The system will guide you through the rest." />
              </div>

              <div className="mt-6 rounded-xl bg-amber-50 border border-amber-100 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Invitation-only access</p>
                    <p className="text-xs text-amber-700 mt-0.5">NorvaOS is currently in early access. New accounts are created by invitation only. Contact your firm administrator if you haven't received your invite.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Dashboard */}
          <section id="dashboard" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                <p className="text-sm text-gray-500">Your firm at a glance</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm leading-relaxed text-gray-600">The dashboard is the first screen you see after logging in. It shows a live snapshot of your firm's activity and alerts you to anything that needs immediate attention.</p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'Active Matters', desc: 'Total open cases assigned to you or your team' },
                  { title: 'Pending Tasks', desc: 'Tasks due today or overdue across all matters' },
                  { title: 'Upcoming Appointments', desc: 'Consultations and deadlines in the next 7 days' },
                  { title: 'Documents Awaiting Review', desc: 'Client uploads that need your attention' },
                  { title: 'Outstanding Invoices', desc: 'Unpaid invoices across all clients' },
                  { title: 'Recent Activity', desc: 'Latest actions across your workspace' },
                ].map(item => (
                  <div key={item.title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                <p className="text-sm font-semibold text-indigo-700">💡 Tip</p>
                <p className="text-xs text-indigo-600 mt-1">Click on any dashboard card to jump directly to the relevant section. For example, clicking "Pending Tasks" takes you to your task list filtered by today's due date.</p>
              </div>
            </div>
          </section>

          {/* Contacts & Leads */}
          <section id="contacts" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Contacts & Leads</h2>
                <p className="text-sm text-gray-500">Manage all people connected to your firm</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900">Contacts</h3>
                  <SectionTag color="bg-emerald-50 text-emerald-700" label="Clients & People" />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">A contact is any person associated with your firm — current client, former client, opposing counsel, or witness. Every matter must be linked to a contact.</p>
                <ul className="mt-3 space-y-1.5">
                  {['Add a contact: Contacts → New Contact → fill in name, email, phone', 'Link to a matter: from the contact profile, click "Open Matter"', 'View full history: all matters, documents, invoices, and communications in one place', 'Merge duplicates: select two contacts → Actions → Merge'].map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900">Leads</h3>
                  <SectionTag color="bg-blue-50 text-blue-700" label="Pre-client pipeline" />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">Leads are prospective clients who haven't retained yet. They move through a pipeline from initial inquiry to retained client.</p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {['New Inquiry', 'Consultation Booked', 'Consultation Done', 'Proposal Sent', 'Retained'].map((stage, i) => (
                    <div key={stage} className="flex items-center gap-1">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{stage}</span>
                      {i < 4 && <ArrowRight className="h-3 w-3 text-gray-400" />}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">When a lead is retained, they are automatically converted to a Contact and a Matter is opened.</p>
              </div>
            </div>
          </section>

          {/* Matters */}
          <section id="matters" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Matters</h2>
                <p className="text-sm text-gray-500">The core of every case</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600 leading-relaxed">A matter is an active legal case. Every matter has a stage, responsible lawyer, documents, tasks, deadlines, billing records, and a complete activity log. Everything that happens on a case is tracked here.</p>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Matter Stages</h3>
                <div className="space-y-2">
                  {[
                    { stage: 'Intake', desc: 'Initial information gathering, conflicts check, retainer setup' },
                    { stage: 'Active', desc: 'Work in progress — tasks, documents, and deadlines tracked here' },
                    { stage: 'Pending Review', desc: 'Waiting for lawyer sign-off, court decision, or external action' },
                    { stage: 'Closing', desc: 'File being wrapped up, final invoices sent' },
                    { stage: 'Closed', desc: 'Matter complete and archived. Can be reopened if needed.' },
                  ].map(({ stage, desc }) => (
                    <div key={stage} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 self-start mt-0.5">{stage}</span>
                      <p className="text-sm text-gray-600">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="font-semibold text-gray-900 mb-3">Matter Workspace Sections</h3>
                <div className="space-y-3">
                  {[
                    { icon: Layers, title: 'Readiness & Blockers', desc: 'Shows exactly what\'s blocking the case from moving forward. Ranked by severity.' },
                    { icon: FolderOpen, title: 'Documents', desc: 'All documents for this matter — uploaded by staff or client. Review, accept, request re-upload.' },
                    { icon: CheckCircle, title: 'Tasks', desc: 'All tasks linked to this matter. Assign to team members, set due dates, mark complete.' },
                    { icon: Calendar, title: 'Deadlines', desc: 'Court dates, filing deadlines, IRCC submission dates — all tracked here.' },
                    { icon: CreditCard, title: 'Billing', desc: 'Retainer, invoices, time entries, and payment history for this matter.' },
                    { icon: MessageSquare, title: 'Communications', desc: 'All emails, notes, and client messages linked to this matter.' },
                    { icon: BookOpen, title: 'Onboarding', desc: 'Client intake form, risk flags, dynamic questions based on matter type.' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <Link
                  href="/help/add-matter"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white hover:bg-indigo-700 transition-colors"
                >
                  <div>
                    <p className="font-semibold">Full guide: How to add a matter</p>
                    <p className="text-indigo-200 text-sm mt-0.5">Step-by-step walkthrough with every field explained, UI mockups, and what to do after creation</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-indigo-300 shrink-0" />
                </Link>
              </div>
            </div>
          </section>

          {/* Documents */}
          <section id="documents" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500">
                <FolderOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Documents & Vault</h2>
                <p className="text-sm text-gray-500">Secure, organized file management</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600 leading-relaxed">The Document Vault stores all firm and matter documents. Files uploaded by clients are auto-sorted, renamed, and placed in the correct matter folder.</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: 'Upload documents', desc: 'Drag and drop or browse. Supports PDF, DOCX, JPG, PNG.' },
                  { title: 'Auto-naming', desc: 'System renames raw scan files (e.g. scan004.pdf → Sharma_Passport_2025.pdf)' },
                  { title: 'Review & Accept', desc: 'Lawyer reviews client uploads and accepts or requests re-upload with a note.' },
                  { title: 'E-Signing', desc: 'Send any document for electronic signature. Track status in real time.' },
                  { title: 'Templates', desc: 'Build document templates with smart fields that auto-fill from matter data.' },
                  { title: 'Version History', desc: 'Every upload is versioned. See who uploaded what and when.' },
                ].map(item => (
                  <div key={item.title} className="rounded-xl border border-gray-100 bg-amber-50/40 p-4">
                    <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                <p className="text-sm font-semibold text-indigo-700">💡 Client Document Requests</p>
                <p className="text-xs text-indigo-600 mt-1">You can request specific documents from a client directly from the matter page. The client receives a notification in their portal and can upload from any device.</p>
              </div>
            </div>
          </section>

          {/* Calendar */}
          <section id="calendar" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Norva Scheduler</h2>
                <p className="text-sm text-gray-500">Dynamic availability, native booking, auto-linked meetings</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">NorvaOS has a built-in booking system. Clients can book consultations from your public booking page without calling the office. The system checks availability and sends confirmations automatically.</p>

              <div className="space-y-3">
                {[
                  { icon: Globe, title: 'Public booking page', desc: 'Share your unique booking link. Clients select a time, fill in their details, and confirm — no back-and-forth.' },
                  { icon: Bell, title: 'Automatic reminders', desc: 'Clients receive email reminders 24 hours and 1 hour before their appointment.' },
                  { icon: CheckCircle, title: 'Consultation outcomes', desc: 'After a consultation, mark it as Completed, No Show, or Cancelled. Completed consultations can be converted to a matter.' },
                  { icon: Clock, title: 'Availability settings', desc: 'Set your working hours, buffer time between appointments, and blocked dates in Settings → Availability.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>
            </div>
          </section>

          {/* Tasks */}
          <section id="tasks" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Tasks</h2>
                <p className="text-sm text-gray-500">Track all work across every matter</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">Tasks can be created standalone or linked to a matter. Every task has an assignee, due date, priority level, and status. The system sends reminders when tasks are approaching or overdue.</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'To Do', color: 'bg-gray-100 text-gray-700' },
                  { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
                  { label: 'Awaiting Client', color: 'bg-amber-100 text-amber-700' },
                  { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
                ].map(({ label, color }) => (
                  <div key={label} className={`rounded-lg px-3 py-2 text-sm font-medium text-center ${color}`}>{label}</div>
                ))}
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <p className="font-semibold text-gray-900">How to use tasks effectively:</p>
                <ul className="space-y-1.5">
                  {[
                    'Create tasks from a matter page so they stay linked to the case',
                    'Assign tasks to specific team members — they\'ll see it in their dashboard',
                    'Set priority (Low / Medium / High / Urgent) so your team knows what to tackle first',
                    'Use the Tasks board view (Kanban) to see all work in progress at a glance',
                  ].map(tip => (
                    <li key={tip} className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Communications */}
          <section id="communications" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Communications</h2>
                <p className="text-sm text-gray-500">All client and team communications in one place</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">Every email, message, and note linked to a client or matter is stored here. Nothing gets lost in personal inboxes.</p>

              <div className="space-y-3">
                {[
                  { icon: Mail, title: 'Email integration', desc: 'Send emails directly from NorvaOS. They are automatically logged against the matter.' },
                  { icon: MessageSquare, title: 'Internal notes', desc: 'Leave notes on a matter for your team. Notes are internal — clients cannot see them.' },
                  { icon: Bell, title: 'Automated notifications', desc: 'System sends clients automatic updates when their matter moves to a new stage or a document is accepted.' },
                  { icon: Zap, title: 'Message templates', desc: 'Save commonly used emails as templates. Insert matter data automatically with smart fields.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>
            </div>
          </section>

          {/* Billing */}
          <section id="billing" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Billing & Finance</h2>
                <p className="text-sm text-gray-500">Retainers, invoices, and payments</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600 leading-relaxed">NorvaOS handles the full billing lifecycle — from retainer collection to final invoice. Clients can view and pay invoices through the client portal.</p>

              <div className="space-y-3">
                {[
                  { icon: PenLine, title: 'Retainer agreements', desc: 'Create and send retainer agreements for e-signing directly from the matter.' },
                  { icon: FileText, title: 'Invoices', desc: 'Generate invoices from time entries or flat fees. Send via email or through the client portal.' },
                  { icon: CreditCard, title: 'Online payments', desc: 'Clients pay invoices online via credit card. Payment is recorded automatically.' },
                  { icon: Clock, title: 'Time tracking', desc: 'Log billable hours against a matter. Convert time entries to invoice line items with one click.' },
                  { icon: BarChart3, title: 'Financial reports', desc: 'View revenue by lawyer, matter type, or time period. Export to CSV.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>
            </div>
          </section>

          {/* Immigration */}
          <section id="immigration" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Immigration Module</h2>
                <p className="text-sm text-gray-500">Purpose-built for Canadian immigration practice</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600 leading-relaxed">The Immigration Module gives immigration matters a specialized workspace with readiness tracking, IRCC form generation, and client review flows — all driven by a playbook engine that knows exactly what each application needs.</p>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Supported Application Streams</h3>
                <div className="flex flex-wrap gap-2">
                  {['Spousal Sponsorship', 'Study Permit', 'Work Permit', 'Visitor Visa', 'Permanent Residence', 'Refugee Protection', 'Citizenship', 'LMIA'].map(stream => (
                    <span key={stream} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{stream}</span>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { icon: Target, title: 'Readiness matrix', desc: 'Shows exactly which documents, questions, and reviews are blocking the application. Ranked by severity.' },
                  { icon: FileText, title: 'IRCC form generation', desc: 'System auto-fills IRCC forms (IMM5257E, IMM5406, IMM5476E) from questionnaire data. Draft and final packs.' },
                  { icon: CheckCircle, title: 'Field verification', desc: 'Lawyers verify individual form fields before final pack generation. Unverified fields block submission.' },
                  { icon: Users, title: 'Multi-person support', desc: 'Handles principal applicant, spouse, and dependants — each with their own documents and questionnaire.' },
                  { icon: Shield, title: 'Lawyer review gate', desc: 'Final form pack cannot be generated without lawyer sign-off. Full audit trail maintained.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-sm font-semibold text-blue-700">How the readiness system works</p>
                <p className="text-xs text-blue-600 mt-1">The system checks 6 domains: Identity Documents, Family Documents, Financial Documents, Travel History, Employment, and Supporting Evidence. Each domain has rules based on the application stream. Blockers are shown in plain language — "Spouse passport missing", "Marriage certificate needs re-upload" — so anyone on the team knows exactly what to do next.</p>
              </div>
            </div>
          </section>

          {/* Reports */}
          <section id="reports" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
                <p className="text-sm text-gray-500">Firm performance and data insights</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-600 leading-relaxed mb-4">Reports give you a clear view of how your firm is performing — matters, revenue, team workload, and client pipeline.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: 'Matter Pipeline', desc: 'How many matters are in each stage' },
                  { title: 'Revenue Report', desc: 'Billed vs collected by month and lawyer' },
                  { title: 'Team Workload', desc: 'Tasks and matters per team member' },
                  { title: 'Lead Conversion', desc: 'How many leads become retained clients' },
                  { title: 'Document Turnaround', desc: 'Average time from request to upload' },
                  { title: 'Time Utilization', desc: 'Billable vs non-billable hours by lawyer' },
                ].map(item => (
                  <div key={item.title} className="rounded-xl border border-gray-100 bg-orange-50/40 p-3">
                    <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Settings */}
          <section id="settings" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-700">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Settings & Workspace</h2>
                <p className="text-sm text-gray-500">Configure your firm's workspace</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              {[
                { title: 'Workspace', desc: 'Firm name, logo, address, phone, fax, and office details. These appear on all documents.' },
                { title: 'Team Members', desc: 'Invite staff, assign roles (Admin / Lawyer / Paralegal / Front Desk), and manage access.' },
                { title: 'Matter Types', desc: 'Define case types your firm handles. Add intake questions, document checklists, and default tasks per type.' },
                { title: 'Availability', desc: 'Set working hours for online booking. Block time off and manage buffer settings.' },
                { title: 'Profile', desc: 'Your personal profile — name, signature, membership number, email, and notification preferences.' },
                { title: 'Billing Settings', desc: 'Tax rates, invoice numbering, default payment terms, and payment gateway connection.' },
                { title: 'IRCC Form Library', desc: 'View and configure IRCC form field mappings used in auto-fill. Admin only.' },
              ].map(item => (
                <div key={item.title} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Client Portal */}
          <section id="client-portal" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Client Portal</h2>
                <p className="text-sm text-gray-500">What your clients see</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">Each client gets a secure, private portal where they can track their matter, upload documents, sign forms, and view invoices — without calling your office.</p>

              <div className="space-y-3">
                {[
                  { icon: Briefcase, title: 'Matter status', desc: 'Clients see their current stage and a progress bar. Simple language, no legal jargon.' },
                  { icon: FolderOpen, title: 'Document uploads', desc: 'Clients upload requested documents directly. Each document shows its status: Accepted, Under Review, or Re-upload Requested.' },
                  { icon: CreditCard, title: 'Invoices & payments', desc: 'Clients view outstanding invoices and pay online. Retainer balances shown clearly.' },
                  { icon: PenLine, title: 'E-signatures', desc: 'Clients sign retainer agreements and consent forms without needing a separate app.' },
                  { icon: MessageSquare, title: 'Messages', desc: 'Secure messaging between client and lawyer. All messages logged against the matter.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>

              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                <p className="text-sm font-semibold text-indigo-700">How clients access the portal</p>
                <p className="text-xs text-indigo-600 mt-1">Clients receive a secure link by email. No password required — access is via a unique token that expires. You can re-send the link at any time from the matter page.</p>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <Link
                  href="/help/client-portal"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-indigo-600 px-5 py-4 text-white hover:bg-indigo-700 transition-colors"
                >
                  <div>
                    <p className="font-semibold">Full guide: Client Portal — complete walkthrough</p>
                    <p className="text-indigo-200 text-sm mt-0.5">Every section explained for both firm staff and clients — with annotated UI mockups, document statuses, IRCC forms, and firm monitoring</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-indigo-300 shrink-0" />
                </Link>
              </div>
            </div>
          </section>

          {/* Front Desk Kiosk */}
          <section id="front-desk" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-600">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Front Desk Kiosk</h2>
                <p className="text-sm text-gray-500">Self-service check-in for your waiting room</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">Place a tablet at your front desk. Clients tap their name, confirm their appointment, sign consent forms, and upload documents — all before they sit down. Your team is notified instantly. Accessible via QR code or direct link.</p>

              <div className="space-y-3">
                {[
                  { icon: CheckCircle, title: 'Self check-in', desc: 'Client taps their name from the day\'s appointment list and confirms arrival.' },
                  { icon: PenLine, title: 'Sign consent forms', desc: 'Present consent forms on arrival. Clients sign on the tablet before the meeting.' },
                  { icon: FolderOpen, title: 'Document upload', desc: 'Clients photograph and upload documents on the spot — no waiting to scan later.' },
                  { icon: Bell, title: 'Instant staff notification', desc: 'As soon as a client checks in, the assigned lawyer and support staff are notified.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <FeatureRow key={title} icon={Icon} title={title} desc={desc} />
                ))}
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700">Setting up the kiosk</p>
                <p className="text-xs text-slate-600 mt-1">Go to Settings → Front Desk → copy your kiosk URL or print the QR code. Open the URL on a tablet in landscape mode and set it to always-on display. No login required on the kiosk device.</p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mb-16 scroll-mt-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h2>
                <p className="text-sm text-gray-500">Common questions answered</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white px-6 shadow-sm">
              <FAQ question="Can multiple lawyers work on the same matter?" answer="Yes. Every matter has a responsible lawyer but all team members with access to that matter can view and update it. You can also assign tasks to different people within the same matter." />
              <FAQ question="How secure is the client portal?" answer="Each client portal link uses a unique cryptographic token. Links are time-limited and can be revoked at any time. All data is encrypted in transit and at rest. No client sees another client's data." />
              <FAQ question="Can I import my existing client data?" answer="Yes. You can import contacts and matters from a CSV file. Go to Settings → Import. We also offer a migration service for firms switching from other platforms — contact support@norvaos.com." />
              <FAQ question="What happens if a client uploads the wrong document?" answer="You can reject the document with a note explaining what's needed. The client receives a notification and can re-upload. The old document is kept in version history." />
              <FAQ question="Can clients access the portal from their phone?" answer="Yes. The client portal is fully responsive and works on any device — phone, tablet, or computer. No app download required." />
              <FAQ question="How do I add a new user to my firm?" answer="Go to Settings → Team Members → Invite. Enter their email and select their role. They will receive an invitation email with a link to set up their account." />
              <FAQ question="Is there a limit on the number of matters or documents?" answer="NorvaOS does not impose hard limits on matters or documents. Storage is generous and scales with your firm's needs. Contact us if you anticipate very high volumes." />
              <FAQ question="Can I customize the intake questions for each matter type?" answer="Yes. Go to Settings → Matter Types → select a type → scroll to Intake Questions. You can add any number of custom fields. Answers are collected in the Onboarding tab of each matter." />
              <FAQ question="What if I need help with something not covered here?" answer="Email us at support@norvaos.com. For urgent issues, use the in-app chat (bottom right corner when logged in). We typically respond within a few hours during business days." />
            </div>
          </section>

          {/* Footer CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-center text-white">
            <h3 className="text-xl font-bold">Still have questions?</h3>
            <p className="mt-2 text-indigo-200 text-sm">Our team is available to walk you through anything.</p>
            <a
              href="mailto:support@norvaos.com"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
            >
              <Mail className="h-4 w-4" />
              support@norvaos.com
            </a>
          </div>

        </main>
      </div>
    </div>
  )
}
