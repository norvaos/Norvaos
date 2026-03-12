'use client'

import { useState, useEffect } from 'react'
import {
  FileText,
  Users,
  Calendar,
  BarChart3,
  CreditCard,
  FolderOpen,
  CheckCircle,
  ArrowRight,
  Brain,
  Lock,
  Briefcase,
  Search,
} from 'lucide-react'

const SLIDE_DURATION = 3800

const SLIDES = [
  { label: 'Dashboard', url: 'dashboards' },
  { label: 'Matters', url: 'matters' },
  { label: 'Documents', url: 'documents' },
  { label: 'Contacts', url: 'contacts' },
  { label: 'Calendar', url: 'calendar' },
  { label: 'Billing', url: 'billing' },
]

// Static class strings — required for Tailwind JIT detection
const STYLES = [
  { logo: 'bg-indigo-600', sidebar: 'bg-indigo-50 font-semibold text-indigo-700', dot: 'bg-indigo-400', progress: 'bg-indigo-600' },
  { logo: 'bg-violet-600', sidebar: 'bg-violet-50 font-semibold text-violet-700', dot: 'bg-violet-400', progress: 'bg-violet-600' },
  { logo: 'bg-blue-600', sidebar: 'bg-blue-50 font-semibold text-blue-700', dot: 'bg-blue-400', progress: 'bg-blue-600' },
  { logo: 'bg-emerald-600', sidebar: 'bg-emerald-50 font-semibold text-emerald-700', dot: 'bg-emerald-400', progress: 'bg-emerald-600' },
  { logo: 'bg-amber-500', sidebar: 'bg-amber-50 font-semibold text-amber-700', dot: 'bg-amber-400', progress: 'bg-amber-500' },
  { logo: 'bg-rose-600', sidebar: 'bg-rose-50 font-semibold text-rose-700', dot: 'bg-rose-400', progress: 'bg-rose-600' },
]

function DashboardSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="mb-3">
        <div className="h-4 w-36 rounded-full bg-gray-800/20 mb-1" />
        <div className="h-3 w-52 rounded-full bg-gray-300/60" />
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Active Matters', value: '47', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'New This Month', value: '8', color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Revenue MTD', value: '$24.5k', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Tasks Due', value: '12', color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl ${stat.bg} p-2.5`}>
            <div className={`text-base font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-gray-400 mb-1">Recent Matters</div>
        {[
          { name: 'Sharma, Patel', type: 'Spousal Sponsorship', stage: 'Filing', cls: 'bg-violet-100 text-violet-700' },
          { name: 'Chen, Wei', type: 'Work Permit', stage: 'Assessment', cls: 'bg-amber-100 text-amber-700' },
          { name: 'Rodriguez, Ana', type: 'PR Application', stage: 'Active', cls: 'bg-indigo-100 text-indigo-700' },
        ].map(m => (
          <div key={m.name} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm border border-gray-100">
            <div>
              <div className="text-xs font-semibold text-gray-800">{m.name}</div>
              <div className="text-xs text-gray-400">{m.type}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.stage}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MattersSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="mb-3 flex items-center gap-0.5">
        {['Intake', 'Assessment', 'Active', 'Filed', 'Closed'].map((s, i) => (
          <div key={s} className="flex items-center gap-0.5 flex-1">
            <div className={`flex-1 rounded py-1 text-center text-xs font-medium ${i <= 2 ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {s}
            </div>
            {i < 4 && <span className="text-gray-300 text-xs shrink-0">›</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5">
          <Search className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-400">Search matters...</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { file: '2026-0047', name: 'Sharma, Patel', area: 'Immigration', stage: 'Filing', cls: 'bg-violet-100 text-violet-700', urgent: false },
          { file: '2026-0048', name: 'Chen, Wei', area: 'Immigration', stage: 'Assessment', cls: 'bg-amber-100 text-amber-700', urgent: true },
          { file: '2026-0039', name: 'Kowalski, Anna', area: 'Family Law', stage: 'Active', cls: 'bg-indigo-100 text-indigo-700', urgent: false },
          { file: '2026-0041', name: 'Rodriguez, Ana', area: 'Immigration', stage: 'Active', cls: 'bg-indigo-100 text-indigo-700', urgent: false },
        ].map(m => (
          <div key={m.file} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-gray-400">{m.file}</span>
                <span className="text-xs font-semibold text-gray-800 truncate">{m.name}</span>
              </div>
              <div className="text-xs text-gray-400">{m.area}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {m.urgent && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-xs text-rose-600">Due soon</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.stage}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DocumentsSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 mb-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-700">
          <Brain className="h-3.5 w-3.5" />
          Auto-classifying new uploads
        </div>
        <div className="space-y-1.5">
          {[
            { from: 'scan004.pdf', to: 'Sharma_Passport_2025.pdf' },
            { from: 'document_1.pdf', to: 'Marriage_Certificate.pdf' },
            { from: 'img_3829.jpg', to: 'Patel_PR_Card.jpg' },
          ].map(r => (
            <div key={r.from} className="flex items-center gap-2 text-xs">
              <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-gray-400 line-through shrink-0">{r.from}</span>
              <ArrowRight className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-gray-700 truncate">{r.to}</span>
              <CheckCircle className="ml-auto h-3 w-3 text-emerald-500 shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { folder: 'Identity Documents', files: 3, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { folder: 'Immigration Forms', files: 4, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
          { folder: 'Financial Records', files: 9, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { folder: 'Employment Letters', files: 3, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
        ].map(g => (
          <div key={g.folder} className={`rounded-xl border ${g.border} ${g.bg} px-3 py-2 flex items-center justify-between`}>
            <div className={`flex items-center gap-2 text-xs font-semibold ${g.color}`}>
              <FolderOpen className="h-3.5 w-3.5" />
              {g.folder}
            </div>
            <span className="text-xs text-gray-500">{g.files} files</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContactsSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="mb-3 flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2">
        <Search className="h-3 w-3 text-gray-400" />
        <span className="text-xs text-gray-400">Search contacts...</span>
      </div>
      <div className="mb-3 flex gap-2">
        {['All', 'Clients', 'Leads', 'Firms'].map((tag, i) => (
          <span key={tag} className={`rounded-full px-3 py-1 text-xs font-medium ${i === 0 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {tag}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {[
          { name: 'Priya Sharma', matter: '3 matters', status: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
          { name: 'Wei Chen', matter: '1 matter', status: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
          { name: 'Ana Rodriguez', matter: 'Consultation booked', status: 'Lead', cls: 'bg-amber-50 text-amber-700' },
          { name: 'James Kowalski', matter: '2 matters', status: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
        ].map(c => (
          <div key={c.name} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              {c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-800">{c.name}</div>
              <div className="text-xs text-gray-400">{c.matter}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="mb-3 grid grid-cols-5 gap-1 text-center">
        {[
          { day: 'Mon', date: 9 },
          { day: 'Tue', date: 10 },
          { day: 'Wed', date: 11 },
          { day: 'Thu', date: 12 },
          { day: 'Fri', date: 13 },
        ].map((d, i) => (
          <div key={d.day} className={`rounded-lg py-1.5 ${i === 2 ? 'bg-amber-500' : 'bg-gray-50'}`}>
            <div className={`text-xs font-medium ${i === 2 ? 'text-white/80' : 'text-gray-500'}`}>{d.day}</div>
            <div className={`text-sm font-bold ${i === 2 ? 'text-white' : 'text-gray-700'}`}>{d.date}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-400 mb-1">Today&rsquo;s Schedule</div>
        {[
          { time: '9:00 AM', client: 'Sharma, Patel', type: 'Consultation', cls: 'border-l-indigo-500 bg-indigo-50' },
          { time: '10:30 AM', client: 'Chen, Wei', type: 'Document Review', cls: 'border-l-violet-500 bg-violet-50' },
          { time: '2:00 PM', client: 'Rodriguez, Ana', type: 'Video Call', cls: 'border-l-amber-500 bg-amber-50' },
          { time: '3:30 PM', client: 'Kowalski, Anna', type: 'Consultation', cls: 'border-l-emerald-500 bg-emerald-50' },
        ].map(a => (
          <div key={a.time} className={`rounded-r-xl border-l-2 px-3 py-2 ${a.cls}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-800">{a.client}</div>
                <div className="text-xs text-gray-500">{a.type}</div>
              </div>
              <span className="text-xs font-medium text-gray-600">{a.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BillingSlide() {
  return (
    <div className="flex-1 p-4 overflow-hidden">
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Revenue MTD', value: '$24,500', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Outstanding', value: '$3,200', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Trust Held', value: '$18,750', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl ${s.bg} p-2.5`}>
            <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-gray-400 mb-1">Recent Invoices</div>
        {[
          { id: '#INV-0021', client: 'Sharma, Patel', amount: '$3,500', status: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
          { id: '#INV-0022', client: 'Chen, Wei', amount: '$1,800', status: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
          { id: '#INV-0023', client: 'Rodriguez, Ana', amount: '$2,400', status: 'Sent', cls: 'bg-blue-100 text-blue-700' },
          { id: '#INV-0024', client: 'Kowalski, Anna', amount: '$1,000', status: 'Draft', cls: 'bg-gray-100 text-gray-500' },
        ].map(inv => (
          <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm border border-gray-100">
            <div>
              <div className="text-xs font-semibold text-gray-800">{inv.client}</div>
              <div className="text-xs text-gray-400">{inv.id}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700">{inv.amount}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inv.cls}`}>{inv.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const SLIDE_COMPONENTS = [
  DashboardSlide,
  MattersSlide,
  DocumentsSlide,
  ContactsSlide,
  CalendarSlide,
  BillingSlide,
]

export function DashboardSlideshow() {
  const [active, setActive] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActive(prev => (prev + 1) % SLIDES.length)
        setFading(false)
      }, 300)
    }, SLIDE_DURATION)
    return () => clearInterval(timer)
  }, [])

  const go = (idx: number) => {
    if (idx === active) return
    setFading(true)
    setTimeout(() => {
      setActive(idx)
      setFading(false)
    }, 200)
  }

  const s = STYLES[active]
  const slide = SLIDES[active]
  const SlideContent = SLIDE_COMPONENTS[active]

  return (
    <div className="relative mx-auto mt-16 max-w-6xl">
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
            app.norvaos.com/{slide.url}
          </div>
        </div>

        <div className="flex min-h-[420px] bg-gray-50">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r border-gray-200 bg-white px-3 py-4">
            <div className="mb-4 flex items-center gap-2 px-2">
              <div className={`h-6 w-6 rounded-md transition-colors duration-300 ${s.logo}`} />
              <div className="h-3 w-16 rounded-full bg-gray-200" />
            </div>
            {SLIDES.map((sl, i) => (
              <button
                key={sl.label}
                onClick={() => go(i)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors cursor-pointer ${
                  i === active ? s.sidebar : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <div className={`h-3 w-3 rounded-sm transition-colors ${i === active ? STYLES[i].dot : 'bg-gray-300'}`} />
                {sl.label}
              </button>
            ))}
          </div>

          {/* Slide content */}
          <div className={`flex flex-1 flex-col transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}>
            <SlideContent />
          </div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {SLIDES.map((sl, i) => (
          <button
            key={sl.label}
            onClick={() => go(i)}
            aria-label={`View ${sl.label}`}
            className={`rounded-full transition-all duration-300 cursor-pointer ${
              i === active ? `h-2 w-8 ${STYLES[i].progress}` : 'h-2 w-2 bg-gray-200 hover:bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
