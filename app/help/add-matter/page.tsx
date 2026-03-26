'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NorvaLogo } from '@/components/landing/norva-logo'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  Info,
  Users,
  CreditCard,
  Eye,
  Clock,
  Layers,
  FolderOpen,
  Star,
  BookOpen,
  PenLine,
  Search,
  Plus,
  FileText,
  Bell,
  Settings,
} from 'lucide-react'

function Callout({ type, title, children }: { type: 'tip' | 'warning' | 'info'; title: string; children: React.ReactNode }) {
  const styles = {
    tip: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const icons = {
    tip: <Star className="h-4 w-4 text-emerald-600 shrink-0" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />,
    info: <Info className="h-4 w-4 text-blue-600 shrink-0" />,
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[type]}`}>
      <div className="flex items-start gap-2">
        {icons[type]}
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <div className="mt-1 text-sm leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
      {n}
    </span>
  )
}

function FieldDoc({ name, required, desc, example, note }: { name: string; required?: boolean; desc: string; example?: string; note?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-gray-900 text-sm">{name}</span>
        {required && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Required</span>}
      </div>
      <p className="text-sm text-gray-600">{desc}</p>
      {example && <p className="mt-1.5 text-xs text-indigo-700 font-mono bg-indigo-50 rounded px-2 py-1">Example: {example}</p>}
      {note && <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{note}</p>}
    </div>
  )
}

// UI Mockup Components
function MockupBadge({ color, label }: { color: string; label: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{label}</span>
}

function MattersListMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Matters</p>
          <p className="text-xs text-gray-500">Manage your firm's matters and cases</p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">
          <Plus className="h-3.5 w-3.5" />
          New Matter
        </button>
      </div>
      {/* Filters */}
      <div className="border-b border-gray-100 px-5 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-400 flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5" />
          Search by title or matter number...
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">All Statuses ↓</div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">All Practice Areas ↓</div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">All Lawyers ↓</div>
      </div>
      {/* Table */}
      <div className="px-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <td className="py-2.5 font-medium">Matter #</td>
              <td className="py-2.5 font-medium">Title</td>
              <td className="py-2.5 font-medium">Practice Area</td>
              <td className="py-2.5 font-medium">Status</td>
              <td className="py-2.5 font-medium">Priority</td>
              <td className="py-2.5 font-medium">Responsible Lawyer</td>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '2026-0019', title: 'Ajaypal Singh  -  Visitor / Work Permit...', area: 'Immigration', status: 'Active', priority: 'Medium', lawyer: 'Zia Waseer' },
              { num: '2026-0018', title: 'Khansa Ayyaz  -  Visitor / Work Permit...', area: 'Immigration', status: 'Active', priority: 'Medium', lawyer: 'Zia Waseer' },
              { num: '2026-0017', title: 'Inaaya Zia  -  Visitor / Work Permit...', area: 'Immigration', status: 'Active', priority: 'Urgent', lawyer: 'Zia Waseer' },
            ].map(row => (
              <tr key={row.num} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2.5 text-indigo-600 font-medium">{row.num}</td>
                <td className="py-2.5 text-gray-700">{row.title}</td>
                <td className="py-2.5 text-gray-500">{row.area}</td>
                <td className="py-2.5"><MockupBadge color="bg-emerald-50 text-emerald-700" label={row.status} /></td>
                <td className="py-2.5"><MockupBadge color={row.priority === 'Urgent' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'} label={row.priority} /></td>
                <td className="py-2.5 text-gray-600">{row.lawyer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Annotation */}
      <div className="bg-indigo-50 border-t border-indigo-100 px-5 py-2.5 flex items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
        <p className="text-xs text-indigo-700 font-medium">Click <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-xs">+ New Matter</span> in the top-right corner to open the form</p>
      </div>
    </div>
  )
}

function NewMatterFormMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      <div className="border-b border-gray-100 px-5 py-3 bg-white flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">New Matter</p>
          <p className="text-xs text-gray-500">Create a new matter. Fields marked with * are required.</p>
        </div>
        <button className="text-gray-400 text-lg font-light">×</button>
      </div>
      <div className="px-5 py-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Basic Info */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Information</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Title *</label>
              <div className="mt-1 rounded-lg border-2 border-indigo-400 bg-white px-3 py-2 text-xs text-gray-400">e.g. Smith v. Jones</div>
              <p className="mt-0.5 text-xs text-indigo-600">→ This appears as the matter name everywhere in the system</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Description</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 h-12">Brief description of the matter...</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Primary Contact</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                <Search className="h-3 w-3" /> Search or create a contact...
              </div>
              <p className="mt-0.5 text-xs text-amber-600">→ Type the client's name  -  existing contacts appear as suggestions</p>
            </div>
          </div>
        </div>
        {/* Classification */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Classification</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Practice Area *</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">Select a practice area ↓</div>
              <p className="mt-0.5 text-xs text-indigo-600">→ Selecting this unlocks the Matter Type dropdown below</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Matter Type</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">Select practice area first ↓</div>
            </div>
          </div>
        </div>
        {/* Assignment */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assignment</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Responsible Lawyer *</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">Select a lawyer ↓</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Follow-up Lawyer / Staff</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">Select follow-up staff (optional) ↓</div>
              <p className="mt-0.5 text-xs text-gray-500">Person responsible for client follow-up</p>
            </div>
          </div>
        </div>
        {/* Billing */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Billing</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Billing Type</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">Flat Fee ↓</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Estimated Value (CAD)</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">0.00</div>
              <p className="mt-0.5 text-xs text-gray-500">Auto-filled when a fee template is selected</p>
            </div>
          </div>
        </div>
        {/* Status */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Status & Security</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Priority</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">Medium ↓</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Status</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">Active ↓</div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
        <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white">Create Matter</button>
      </div>
    </div>
  )
}

function MatterWorkspaceMockup() {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      {/* Matter Header */}
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm">Inaaya Zia  -  Visitor / Work Permit / Entry Matters</p>
          <span className="text-gray-400 text-xs"> -  Inaaya Zia</span>
          <MockupBadge color="bg-gray-100 text-gray-600" label="# 2026-0017" />
          <MockupBadge color="bg-emerald-50 text-emerald-700" label="Active" />
          <MockupBadge color="bg-red-50 text-red-700" label="Urgent" />
          <MockupBadge color="bg-indigo-50 text-indigo-700" label="Immigration" />
        </div>
      </div>
      {/* Readiness Bar */}
      <div className="border-b border-gray-100 px-5 py-2.5 flex items-center gap-3 flex-wrap bg-gray-50 text-xs">
        <MockupBadge color="bg-emerald-100 text-emerald-700" label="Ready for Filing" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Readiness</span>
          <div className="w-20 h-1.5 rounded-full bg-gray-200"><div className="h-1.5 rounded-full bg-amber-500 w-4/5" /></div>
          <span className="font-semibold text-gray-700">83%</span>
        </div>
        <div className="flex items-center gap-1"><span className="text-gray-500">Drafting</span><MockupBadge color="bg-emerald-100 text-emerald-600" label="READY" /></div>
        <div className="flex items-center gap-1"><span className="text-gray-500">Filing</span><MockupBadge color="bg-emerald-100 text-emerald-600" label="READY" /></div>
        <MockupBadge color="bg-blue-50 text-blue-700" label="Forms 100%" />
        <MockupBadge color="bg-blue-50 text-blue-700" label="Docs 100%" />
      </div>
      {/* Tabs */}
      <div className="border-b border-gray-100 px-5 flex gap-5 text-xs">
        {['Onboarding', 'Case Config', 'IRCC Intake', 'Client Review', 'Tasks', 'Contacts', 'More'].map((tab, i) => (
          <button key={tab} className={`py-2.5 font-medium ${i === 0 ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}>{tab}</button>
        ))}
      </div>
      {/* Next Action Panel */}
      <div className="mx-5 my-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Next Action</p>
          <p className="text-sm font-medium text-emerald-900 mt-0.5">All checks passed  -  file the application with IRCC</p>
        </div>
        <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap">Proceed to IRCC Filing</button>
      </div>
      {/* Sections */}
      <div className="px-5 pb-4 space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-gray-400" /><span className="text-xs font-medium text-gray-700">Questions</span><span className="text-xs text-emerald-600">Fields satisfied: 100%</span></div>
          <MockupBadge color="bg-emerald-100 text-emerald-700" label="Complete" />
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2.5">
          <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs font-medium text-gray-700">Documents</span><span className="text-xs text-emerald-600">Accepted: 5/5</span></div><MockupBadge color="bg-emerald-100 text-emerald-700" label="Complete" /></div>
          <div className="space-y-1.5">
            {['Passport bio page + stamps', 'Digital photos (IRCC specs)', 'Proof of funds', 'Bank statements (3 months)'].map(doc => (
              <div key={doc} className="flex items-center justify-between text-xs text-gray-600">
                <span>{doc}</span>
                <MockupBadge color="bg-emerald-100 text-emerald-700" label="✓ Accepted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const onPageSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'step1', label: 'Step 1  -  Open the form' },
  { id: 'step2', label: 'Step 2  -  Basic Information' },
  { id: 'step3', label: 'Step 3  -  Classification' },
  { id: 'step4', label: 'Step 4  -  Assignment' },
  { id: 'step5', label: 'Step 5  -  Billing' },
  { id: 'step6', label: 'Step 6  -  Status & Security' },
  { id: 'step7', label: 'Step 7  -  Create & what happens next' },
  { id: 'workspace', label: 'The Matter Workspace' },
  { id: 'after-creation', label: 'What to do after creating' },
  { id: 'tips', label: 'Tips & Common Mistakes' },
]

export default function AddMatterHelpPage() {
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
              <NorvaLogo size={28} id="help-matter-nav" />
              <span className="font-bold text-gray-900">NorvaOS</span>
            </Link>
            <span className="text-gray-300">/</span>
            <Link href="/help" className="text-sm text-gray-500 hover:text-gray-900">Help</Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Adding a Matter</span>
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
            <Link href="/help#contacts" className="block text-xs text-indigo-600 hover:underline py-0.5">Adding a Contact</Link>
            <Link href="/help#documents" className="block text-xs text-indigo-600 hover:underline py-0.5">Managing Documents</Link>
            <Link href="/help#immigration" className="block text-xs text-indigo-600 hover:underline py-0.5">Immigration Module</Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 px-8 py-10 max-w-4xl">

          {/* Hero */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Adding a Matter</h1>
                <p className="text-gray-500 mt-0.5">Complete step-by-step guide  -  from opening the form to working the case</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">⏱ 5 min read</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Matters module</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">All practice areas</span>
            </div>
          </div>

          {/* Overview */}
          <section id="overview" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Overview</h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                A <strong>Matter</strong> is the central object in NorvaOS. Every active case lives inside a matter  -  its documents, tasks, deadlines, billing, questionnaire, communications, and full activity log are all stored here.
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Creating a matter takes about 60 seconds. You fill in the client, practice area, matter type, responsible lawyer, and billing type. After that, the system sets up the workspace automatically  -  document checklist, intake form, and (for immigration matters) the readiness matrix.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Clock, label: 'Time to create', value: '~60 seconds' },
                  { icon: CheckCircle, label: 'Required fields', value: 'Title, Practice Area, Lawyer' },
                  { icon: Layers, label: 'Auto-created after', value: 'Workspace, readiness matrix, intake form' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                    <Icon className="h-5 w-5 text-indigo-500 mx-auto mb-1" />
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <Callout type="info" title="Before you create a matter">
                Make sure the client exists as a Contact first. If they don't, you can create a contact directly from the matter form  -  but it's cleaner to add the contact first so their full profile is set up.
              </Callout>
            </div>
          </section>

          {/* Step 1 */}
          <section id="step1" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={1} />
              <h2 className="text-xl font-bold text-gray-900">Open the New Matter Form</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600 leading-relaxed">There are two ways to get to the New Matter form:</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
                  <p className="font-semibold text-indigo-800 text-sm mb-1">Option A  -  From the Matters list</p>
                  <ol className="space-y-1 text-xs text-indigo-700">
                    <li>1. Click <strong>Matters</strong> in the left sidebar</li>
                    <li>2. Click <strong>+ New Matter</strong> button (top right)</li>
                    <li>3. A slide-over panel opens on the right</li>
                  </ol>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="font-semibold text-gray-800 text-sm mb-1">Option B  -  From a Contact profile</p>
                  <ol className="space-y-1 text-xs text-gray-600">
                    <li>1. Open a contact's profile</li>
                    <li>2. Click <strong>Open Matter</strong> button</li>
                    <li>3. The form opens with the contact pre-filled</li>
                  </ol>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">What you see  -  Matters list page</p>
                <MattersListMockup />
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section id="step2" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={2} />
              <h2 className="text-xl font-bold text-gray-900">Fill in Basic Information</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">The top section of the form covers the matter's identity and the client it belongs to.</p>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <FieldDoc
                    name="Title"
                    required
                    desc="The name of the matter as it will appear everywhere in the system. Be consistent  -  your team will search by this name."
                    example="Ajaypal Singh  -  Study Permit 2026"
                    note="Convention: [Client Name]  -  [Application Type] [Year]"
                  />
                  <FieldDoc
                    name="Description"
                    desc="Optional free-text summary of the matter. Useful for unusual cases or specific notes the team needs to see upfront."
                    example="Spousal sponsorship with prior refusal. Prior refusal was for visitor visa in 2023."
                  />
                  <FieldDoc
                    name="Primary Contact"
                    required
                    desc="The main client for this matter. Start typing their name  -  the system searches your existing contacts. If they don't exist, click '+ Add Another Contact' to create them inline."
                    example="Type 'Singh' to find Ajaypal Singh"
                    note="You can add multiple contacts (e.g. sponsor + principal applicant) after creation"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Form panel</p>
                  <NewMatterFormMockup />
                </div>
              </div>

              <Callout type="tip" title="Naming convention matters">
                Use a consistent naming format across your firm. A good format is: <strong>[Last Name, First Name]  -  [Matter Type] [Year]</strong>. This makes the matters list easy to scan and search.
              </Callout>
            </div>
          </section>

          {/* Step 3 */}
          <section id="step3" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={3} />
              <h2 className="text-xl font-bold text-gray-900">Set Classification</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">Classification tells the system what kind of case this is so it can load the right workspace, document checklist, and intake form.</p>

              <div className="space-y-4">
                <FieldDoc
                  name="Practice Area"
                  required
                  desc="The area of law this matter falls under. Examples: Immigration, Family Law, Real Estate, Corporate. This unlocks the Matter Type dropdown."
                  example="Immigration"
                  note="Practice areas are configured by your Admin in Settings → Practice Areas"
                />
                <FieldDoc
                  name="Matter Type"
                  desc="The specific type of application or case within the practice area. This determines what documents are required, what intake questions are asked, and (for immigration) which IRCC forms are generated."
                  example="Visitor / Work Permit / Entry Matters"
                  note="Matter types appear only after you select a Practice Area. If your matter type is missing, ask your Admin to add it in Settings → Matter Types."
                />
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">Why Practice Area and Matter Type matter</p>
                <div className="space-y-1.5 text-xs text-blue-700">
                  {[
                    'Immigration matters get the full immigration workspace  -  readiness matrix, IRCC questionnaire, form generation',
                    'Non-immigration matters use the standard tab layout  -  tasks, docs, billing, notes',
                    'Each matter type has its own document checklist so you only see relevant document slots',
                    'Intake questions in the Onboarding tab are driven by the matter type schema',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Step 4 */}
          <section id="step4" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={4} />
              <h2 className="text-xl font-bold text-gray-900">Assign the Team</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">Every matter must have at least one responsible lawyer. You can also assign follow-up staff and track who originated the file.</p>

              <div className="space-y-4">
                <FieldDoc
                  name="Responsible Lawyer"
                  required
                  desc="The lawyer who owns this file and is ultimately responsible for its progress. This person is the primary point of contact in all system notifications."
                  example="Zia Waseer"
                  note="Only users with the Lawyer or Admin role appear in this dropdown"
                />
                <FieldDoc
                  name="Follow-up Lawyer / Staff"
                  desc="A second person assigned to handle client communications and follow-up. Typically a paralegal or junior lawyer. They receive task assignments and reminders but are not the file owner."
                  example="Sarah Chen (Paralegal)"
                />
                <FieldDoc
                  name="Originating Lawyer"
                  desc="The lawyer who brought this client to the firm. Used for business development tracking and compensation calculations. Does not affect matter workflow."
                  example="Zia Waseer"
                />
              </div>

              <Callout type="info" title="Assignment drives notifications">
                The Responsible Lawyer receives all system notifications for this matter  -  new client uploads, status changes, tasks coming due. Make sure the right person is assigned.
              </Callout>
            </div>
          </section>

          {/* Step 5 */}
          <section id="step5" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={5} />
              <h2 className="text-xl font-bold text-gray-900">Configure Billing</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">Set how this matter will be billed. You can always change this later from the matter's Billing tab.</p>

              <div className="space-y-4">
                <FieldDoc
                  name="Billing Type"
                  desc="How the client will be charged for this matter."
                  example="Flat Fee"
                />
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { type: 'Flat Fee', desc: 'A fixed amount for the entire matter, agreed upfront. Most common for immigration applications.' },
                    { type: 'Hourly', desc: 'Billed by the hour. Time entries are tracked and converted to invoices.' },
                    { type: 'Contingency', desc: 'Payment is a percentage of the outcome. Used in litigation matters.' },
                  ].map(({ type, desc }) => (
                    <div key={type} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="font-semibold text-sm text-gray-900">{type}</p>
                      <p className="mt-1 text-xs text-gray-500">{desc}</p>
                    </div>
                  ))}
                </div>
                <FieldDoc
                  name="Estimated Value (CAD)"
                  desc="The estimated total fee for this matter. This populates revenue projections in Reports. It is NOT the invoice  -  the actual invoice is created separately."
                  example="3500.00"
                  note="This is auto-filled if you have fee templates set up in Settings → Matter Types"
                />
              </div>
            </div>
          </section>

          {/* Step 6 */}
          <section id="step6" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={6} />
              <h2 className="text-xl font-bold text-gray-900">Set Status & Security</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <div className="space-y-4">
                <FieldDoc
                  name="Priority"
                  desc="The urgency level for this matter. Shown as a badge on the matters list and used to sort your team's workload."
                  example="Medium"
                  note="Choose Urgent only for matters with imminent deadlines or active risk"
                />
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Low', color: 'bg-gray-100 text-gray-600', desc: 'No immediate pressure' },
                    { label: 'Medium', color: 'bg-blue-50 text-blue-700', desc: 'Normal workload' },
                    { label: 'High', color: 'bg-orange-50 text-orange-700', desc: 'Needs attention soon' },
                    { label: 'Urgent', color: 'bg-red-50 text-red-700', desc: 'Deadline imminent' },
                  ].map(({ label, color, desc }) => (
                    <div key={label} className="rounded-lg border border-gray-100 p-2 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{label}</span>
                      <p className="mt-1 text-xs text-gray-500">{desc}</p>
                    </div>
                  ))}
                </div>

                <FieldDoc
                  name="Status"
                  desc="The current operational status of the matter. Defaults to Active."
                  example="Active"
                />
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Active', desc: 'Work is in progress. Most matters start here.' },
                    { label: 'On Hold', desc: 'Waiting on the client or external decision. Pauses reminders.' },
                    { label: 'Closed', desc: 'Matter is complete. Sets the closed date and archives the file.' },
                  ].map(({ label, desc }) => (
                    <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <p className="font-semibold text-sm text-gray-900">{label}</p>
                      <p className="mt-1 text-xs text-gray-500">{desc}</p>
                    </div>
                  ))}
                </div>

                <FieldDoc
                  name="Visibility"
                  desc="Controls who in your firm can see this matter."
                  example="Visible to All"
                  note="Use 'Restricted' for sensitive matters  -  only assigned lawyers + admins can access"
                />

                <FieldDoc
                  name="Statute of Limitations"
                  desc="Optional. The legal deadline by which a claim must be filed. If set, the system will show a warning as this date approaches. Can be updated later from the Onboarding tab."
                  example="2027-03-15"
                />

                <FieldDoc
                  name="Next Deadline"
                  desc="Optional. The next important date for this matter. Appears on your dashboard and in the deadlines widget."
                  example="2026-04-30"
                />
              </div>
            </div>
          </section>

          {/* Step 7 */}
          <section id="step7" className="mb-12 scroll-mt-6">
            <div className="flex items-center gap-3 mb-4">
              <StepBadge n={7} />
              <h2 className="text-xl font-bold text-gray-900">Click Create Matter</h2>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              <p className="text-sm text-gray-600">Once all required fields are filled, click <strong>Create Matter</strong> at the bottom of the form. The system does several things automatically:</p>

              <div className="space-y-3">
                {[
                  { icon: Briefcase, title: 'Matter workspace created', desc: 'A new matter page is generated with all sections ready  -  questions, documents, tasks, billing, and communications.' },
                  { icon: FileText, title: 'Document checklist loaded', desc: 'Based on the matter type, the required document slots are pre-populated. For immigration: passport, photos, proof of funds, etc.' },
                  { icon: BookOpen, title: 'Intake form ready', desc: 'The Onboarding tab is populated with intake questions based on the matter type. You can start filling these immediately or send to the client.' },
                  { icon: Layers, title: 'Immigration workspace activated', desc: 'For immigration matters, the readiness matrix engine starts. It immediately shows what\'s missing and what the next step is.' },
                  { icon: Bell, title: 'Assignment notification sent', desc: 'The responsible lawyer and follow-up staff receive an in-system notification and email that a new matter has been assigned to them.' },
                  { icon: Star, title: 'Matter number assigned', desc: 'An auto-incrementing matter number is assigned (e.g. 2026-0020). This is used for filing references and appears on all documents.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Callout type="tip" title="You are taken directly to the matter">
                After clicking Create Matter, the system redirects you straight to the new matter's workspace. You don't need to go back to the list  -  just start working on it immediately.
              </Callout>
            </div>
          </section>

          {/* Matter Workspace */}
          <section id="workspace" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">The Matter Workspace</h2>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <p className="text-sm text-gray-600 leading-relaxed">After creation, you land on the matter page. Here's what each part does:</p>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">What you see  -  matter detail page</p>
                <MatterWorkspaceMockup />
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">① Matter Header (top bar)</h3>
                  <p className="text-sm text-gray-600">Shows the matter title, client name, matter number, status badge, priority badge, and practice area tag. The <strong>Edit</strong> button opens the same form you just filled in.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">② Readiness & Status Bar (for immigration)</h3>
                  <p className="text-sm text-gray-600 mb-2">A live health indicator row showing:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: 'Overall status badge', desc: 'e.g. "Ready for Filing", "Documents Missing", "Questions Incomplete"' },
                      { label: 'Readiness %', desc: 'Percentage of all requirements met  -  documents, questions, and reviews combined' },
                      { label: 'Drafting status', desc: '"READY" when all questions are answered and form pack can be drafted' },
                      { label: 'Filing status', desc: '"READY" when documents are accepted and lawyer review is done' },
                      { label: 'Forms %', desc: 'What percentage of IRCC form fields are complete' },
                      { label: 'Docs %', desc: 'Percentage of required documents that have been accepted' },
                    ].map(({ label, desc }) => (
                      <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                        <p className="font-medium text-gray-800">{label}</p>
                        <p className="text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">③ Tab Bar</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { tab: 'Onboarding', desc: 'Client intake form, risk flags, and dynamic questions. Fill this in after creating the matter.' },
                      { tab: 'Case Config', desc: 'Application type, stream details, and matter-specific settings.' },
                      { tab: 'IRCC Intake', desc: 'The full questionnaire that drives IRCC form auto-fill. The most important tab for immigration matters.' },
                      { tab: 'Client Review', desc: 'Send the completed forms to the client for review and sign-off before filing.' },
                      { tab: 'Tasks', desc: 'All tasks linked to this matter. Create, assign, and track work here.' },
                      { tab: 'Contacts', desc: 'All people connected to this matter  -  principal applicant, spouse, dependants, sponsors.' },
                      { tab: 'More', desc: 'Billing, documents, deadlines, communications, and activity log.' },
                    ].map(({ tab, desc }) => (
                      <div key={tab} className="flex gap-2">
                        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 self-start">{tab}</span>
                        <span className="text-gray-600 text-sm">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">④ Next Action Panel (green bar)</h3>
                  <p className="text-sm text-gray-600">This is the most important element on the page. It always tells you exactly what to do next based on the live state of the matter. It changes automatically as you complete steps. Never ignore this panel  -  if something is blocking the case, the reason is stated here in plain language.</p>
                  <div className="mt-2 rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Examples of what it shows:</p>
                    <div className="space-y-1.5">
                      {[
                        '"Spouse passport missing  -  upload required before drafting"',
                        '"3 questions incomplete  -  open IRCC Intake to complete"',
                        '"Lawyer review required before final pack can be generated"',
                        '"All checks passed  -  file the application with IRCC"',
                      ].map(msg => (
                        <div key={msg} className="rounded-lg bg-white border border-gray-100 px-3 py-2 text-xs text-gray-700 font-mono">{msg}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* After Creation */}
          <section id="after-creation" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">What to Do After Creating a Matter</h2>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-gray-600">Once the matter is created, here's the recommended order of operations:</p>

              <div className="space-y-4">
                {[
                  {
                    n: 1, title: 'Fill in the Onboarding tab',
                    desc: 'Go to Onboarding → fill in the intake questions, check for risk flags, and add any initial notes. This takes 2–5 minutes and ensures nothing is missed from the first client meeting.',
                    tag: 'Do this first',
                    tagColor: 'bg-red-50 text-red-700',
                  },
                  {
                    n: 2, title: 'Add all relevant contacts',
                    desc: 'Click the Contacts tab → add spouse, dependants, sponsor, or any other person relevant to the case. For immigration, each person gets their own document slots and questionnaire section.',
                    tag: 'If applicable',
                    tagColor: 'bg-blue-50 text-blue-700',
                  },
                  {
                    n: 3, title: 'Complete the IRCC Intake questionnaire (immigration only)',
                    desc: 'Click IRCC Intake → work through each section  -  Personal Info, Travel History, Employment, Family. Complete as much as you can from the initial consultation. The client can fill in the rest through the portal.',
                    tag: 'Immigration only',
                    tagColor: 'bg-indigo-50 text-indigo-700',
                  },
                  {
                    n: 4, title: 'Request documents from the client',
                    desc: 'Go to the Documents section → for each required document slot, click "Request from Client". The client receives a notification in their portal and can upload directly.',
                    tag: 'Recommended',
                    tagColor: 'bg-emerald-50 text-emerald-700',
                  },
                  {
                    n: 5, title: 'Create the retainer agreement',
                    desc: 'Go to More → Billing → Create Retainer. Generate the retainer agreement, send for e-signature. Payment can be collected online through the client portal.',
                    tag: 'Required before filing',
                    tagColor: 'bg-amber-50 text-amber-700',
                  },
                  {
                    n: 6, title: 'Create initial tasks',
                    desc: 'Go to Tasks tab → add any immediate to-dos for your team. Assign them to specific people with due dates. These appear on the assignee\'s dashboard.',
                    tag: 'Optional',
                    tagColor: 'bg-gray-100 text-gray-600',
                  },
                ].map(({ n, title, desc, tag, tagColor }) => (
                  <div key={n} className="flex gap-4 rounded-xl border border-gray-100 p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{n}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900 text-sm">{title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColor}`}>{tag}</span>
                      </div>
                      <p className="text-sm text-gray-600">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tips */}
          <section id="tips" className="mb-12 scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Tips & Common Mistakes</h2>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Star className="h-4 w-4 text-emerald-500" /> Tips for using matters effectively</p>
                <div className="space-y-2">
                  {[
                    { tip: 'Open the matter the same day as the consultation', detail: 'Don\'t wait. The sooner the matter is created, the sooner the system can start tracking deadlines and sending reminders.' },
                    { tip: 'Use the matter number in all client emails', detail: 'When emailing clients, reference the matter number (e.g. #2026-0019). It makes file identification instant.' },
                    { tip: 'Set the Next Deadline immediately', detail: 'Even a rough date is better than none. The dashboard deadline widget keeps your whole team aware of upcoming pressure.' },
                    { tip: 'Watch the Next Action panel', detail: 'It\'s the fastest way to know what\'s blocking the file. Check it every time you open a matter.' },
                  ].map(({ tip, detail }) => (
                    <div key={tip} className="flex gap-2 rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">{tip}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" /> Common mistakes to avoid</p>
                <div className="space-y-2">
                  {[
                    { mistake: 'Creating the matter without a contact', fix: 'Always link a primary contact. Without one, client portal access can\'t be set up and communications can\'t be logged.' },
                    { mistake: 'Selecting the wrong Practice Area or Matter Type', fix: 'This loads the wrong document checklist and may not activate the immigration workspace. If you pick the wrong type, edit the matter immediately  -  some settings are hard to change later.' },
                    { mistake: 'Leaving the Responsible Lawyer blank', fix: 'The system requires a responsible lawyer. Without one, notifications won\'t be sent and the matter won\'t appear on anyone\'s dashboard.' },
                    { mistake: 'Setting priority to Urgent for all matters', fix: 'If everything is urgent, nothing is urgent. Reserve Urgent for matters with real imminent deadlines. Use High for matters needing attention soon.' },
                  ].map(({ mistake, fix }) => (
                    <div key={mistake} className="flex gap-2 rounded-lg bg-red-50 border border-red-100 p-3">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-900">{mistake}</p>
                        <p className="text-xs text-red-700 mt-0.5"><strong>Fix:</strong> {fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Navigation footer */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <Link href="/help" className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" /> Back to Help Centre
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/help#contacts" className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                Next: Adding a Contact <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
