'use client'

/**
 * Directive 061: The Sovereign Command Map
 *
 * A single-page, print-friendly cheat sheet for every workstation in the firm.
 * Dark mode aesthetic with Emerald accents matching the Fortress UI.
 * Written at a 10th-grade reading level.
 */

import {
  Sparkles,
  Users,
  CheckSquare,
  DollarSign,
  Calendar,
  BookOpen,
  Shield,
  Flame,
  Mic,
  Keyboard,
  Zap,
  Command,
  Printer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const SLASH_COMMANDS = [
  { cmd: '/task', usage: '/task', result: 'Creates a new task in the Breeze.', icon: CheckSquare },
  { cmd: '/contact', usage: '/contact', result: 'Opens the Contact Creator.', icon: Users },
  { cmd: '/genesis', usage: '/genesis', result: 'Starts the New Matter Wizard.', icon: Sparkles },
  { cmd: '/bill', usage: '/bill', result: 'Opens the billing page to create an invoice.', icon: DollarSign },
  { cmd: '/event', usage: '/event', result: 'Opens the calendar to add an event.', icon: Calendar },
  { cmd: '/help', usage: '/help', result: 'Opens the help guide for any topic.', icon: BookOpen },
  { cmd: '/ignite', usage: '/ignite', result: 'Submit a matter when the score hits 100.', icon: Flame },
  { cmd: '/whisper', usage: '/whisper', result: 'Start the AI meeting recorder.', icon: Mic },
  { cmd: '/audit', usage: '/audit', result: 'Run a forensic scan for gaps. (Admin)', icon: Shield },
]

const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open the Command Bar (the brain of the system).' },
  { keys: ['⌘', 'N'], desc: 'Start a new matter with the creation wizard.' },
  { keys: ['Esc'], desc: 'Close any popup or modal instantly.' },
  { keys: ['Tab'], desc: 'Move through form fields without using the mouse.' },
  { keys: ['Enter'], desc: 'Confirm and continue to the next step.' },
  { keys: ['↑', '↓'], desc: 'Navigate through search results or command list.' },
  { keys: ['Tab'], desc: 'Auto-complete a slash command (e.g. /ta → /task).' },
]

const TIPS = [
  'Press ⌘+K and just start typing. The system searches contacts, matters, tasks, and documents instantly.',
  'Type / in the command bar to see all available commands. Start typing to filter.',
  'When you see grey text appear after your typing, press Tab to auto-complete the command.',
  'Every action creates a toast notification at the bottom of the screen with an Undo option.',
  'The Readiness Score updates in real time. Upload a document and watch the ring fill instantly.',
]

export default function CommandMapPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white print:bg-white print:text-black">
      {/* Print Button (hidden in print) */}
      <div className="fixed top-6 right-6 z-50 print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Cheat Sheet
        </Button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12 print:px-4 print:py-4">
        {/* Header */}
        <div className="mb-12 text-center print:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 mb-4">
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Sovereign Command Map
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight print:text-2xl">
            The Only Page You Need
          </h1>
          <p className="mt-2 text-sm text-white/50 print:text-gray-500">
            Pin this to your workstation. Master the keyboard. Stay on the Emerald Path.
          </p>
        </div>

        {/* Section 1: Slash Commands */}
        <section className="mb-10 print:mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/20">
              <Zap className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">The Power of / (Slash Commands)</h2>
              <p className="text-xs text-white/40 print:text-gray-500">
                Open the Command Bar with ⌘+K, then type these to execute instant actions.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 print:border-gray-300 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 print:border-gray-300 bg-white/[0.02] print:bg-gray-50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-white/40 print:text-gray-500">
                    Command
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-white/40 print:text-gray-500">
                    What It Does
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 print:divide-gray-200">
                {SLASH_COMMANDS.map(({ cmd, result, icon: Icon }) => (
                  <tr key={cmd} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-emerald-400 shrink-0 print:text-emerald-600" />
                        <code className="rounded bg-emerald-500/10 print:bg-emerald-950/30 px-2 py-0.5 text-xs font-mono text-emerald-400 print:text-emerald-400">
                          {cmd}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/70 print:text-gray-700">
                      {result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: Keyboard Shortcuts */}
        <section className="mb-10 print:mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/20">
              <Keyboard className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <p className="text-xs text-white/40 print:text-gray-500">
                Master the keyboard to stay in the flow. Zero mouse clicks needed.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            {SHORTCUTS.map(({ keys, desc }, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-lg border border-white/5 print:border-gray-200 bg-white/[0.02] print:bg-gray-50 px-4 py-3"
              >
                <div className="flex items-center gap-1 shrink-0">
                  {keys.map((key, ki) => (
                    <span key={ki}>
                      {ki > 0 && <span className="mx-0.5 text-white/20 print:text-gray-300">+</span>}
                      <kbd className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border border-white/10 print:border-gray-300 bg-white/5 print:bg-white px-2 text-xs font-mono text-white/70 print:text-gray-700">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
                <span className="text-sm text-white/60 print:text-gray-600">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Quick Tips */}
        <section className="mb-10 print:mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/20">
              <Command className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Quick Tips</h2>
              <p className="text-xs text-white/40 print:text-gray-500">
                Things that make you faster on day one.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {TIPS.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-white/5 print:border-gray-200 bg-white/[0.02] print:bg-gray-50 px-4 py-3"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400 print:bg-emerald-950/40 print:text-emerald-400">
                  {i + 1}
                </span>
                <p className="text-sm text-white/60 print:text-gray-600">{tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer Quote */}
        <div className="mt-12 border-t border-white/10 print:border-gray-300 pt-8 text-center print:mt-6 print:pt-4">
          <blockquote className="text-sm italic text-white/30 print:text-gray-400">
            &ldquo;In the Sovereign Fortress, speed is a sign of precision. Use the Command Bar
            to eliminate the noise and stay on the Emerald Path.&rdquo;
          </blockquote>
          <p className="mt-3 text-[10px] uppercase tracking-widest text-emerald-400/40 print:text-emerald-600">
            NorvaOS - Sovereign Command Map v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
