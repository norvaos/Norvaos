'use client'

import { useState } from 'react'
import { Crown, Check, ArrowRight, Scale, Shield, Zap, Users, Globe } from 'lucide-react'

const features = [
  { icon: Scale, text: 'Multi-practice law firm OS' },
  { icon: Shield, text: 'Bank-grade tenant isolation' },
  { icon: Zap, text: 'AI-powered document drafting' },
  { icon: Users, text: 'Client portal with real-time updates' },
  { icon: Globe, text: 'Canadian data sovereignty (PIPEDA)' },
]

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [firmName, setFirmName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    // For now, just simulate a submission
    // In production, POST to /api/waitlist
    await new Promise((r) => setTimeout(r, 1000))
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#060609] text-white overflow-hidden relative">
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-amber-500/[0.03] blur-[120px]" />
        <div className="absolute -bottom-[30%] -right-[20%] w-[60%] h-[60%] rounded-full bg-violet-500/[0.03] blur-[120px]" />
      </div>

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">NorvaOS</span>
        </div>
        <a
          href="/login"
          className="text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          Sign in
        </a>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 pt-16 pb-24 lg:pt-24 lg:pb-32">
        {/* Badge */}
        <div className="mb-8 flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-400">Now accepting early access applications</span>
        </div>

        {/* Headline */}
        <h1 className="max-w-3xl text-center text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
          The Operating System for{' '}
          <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
            Canadian Law Firms
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-center text-lg text-white/40 leading-relaxed">
          Multi-practice management, AI-powered drafting, client portals, and
          PIPEDA-compliant data sovereignty  -  all in one platform.
        </p>

        {/* Waitlist form */}
        <div className="mt-12 w-full max-w-md">
          {submitted ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">You&apos;re on the list!</h3>
              <p className="text-sm text-white/40">
                We&apos;ll reach out to <span className="text-white/70">{email}</span> when
                your spot is ready.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
                <div>
                  <label htmlFor="wl-email" className="block text-xs font-medium text-white/40 mb-1.5">
                    Work email
                  </label>
                  <input
                    id="wl-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourfirm.com"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="wl-firm" className="block text-xs font-medium text-white/40 mb-1.5">
                    Firm name <span className="text-white/20">(optional)</span>
                  </label>
                  <input
                    id="wl-firm"
                    type="text"
                    value={firmName}
                    onChange={(e) => setFirmName(e.target.value)}
                    placeholder="Waseer Law Office"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {loading ? 'Joining...' : 'Join the Waitlist'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-center text-[11px] text-white/20">
                No credit card required. We&apos;ll never share your email.
              </p>
            </form>
          )}
        </div>

        {/* Features grid */}
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 max-w-4xl w-full">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.text}
                className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Icon className="h-5 w-5 text-amber-400/70" />
                </div>
                <span className="text-xs font-medium text-white/50 leading-snug">{f.text}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] px-6 py-6">
        <div className="mx-auto max-w-4xl flex items-center justify-between text-[11px] text-white/20">
          <span>NorvaOS  -  Built in Canada</span>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-white/40 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white/40 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
