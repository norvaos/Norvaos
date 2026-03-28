'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  Video,
  MapPin,
  Phone,
  NotebookPen,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Gate B — Meeting Scheduling & Notes (Vision 2035)
// ---------------------------------------------------------------------------
// Step 1: Select meeting mode (In-Person / Video / Phone)
// Step 2: Confirm date/time
// Step 3: Post-meeting notes → gate clears
// ---------------------------------------------------------------------------

type MeetingStep = 'mode' | 'schedule' | 'notes' | 'cleared'

interface GateBMeetingProps {
  onComplete?: () => void
}

const meetingModes = [
  { id: 'in-person', label: 'In-Person', icon: <MapPin className="w-5 h-5" />, desc: 'Office consultation' },
  { id: 'video', label: 'Video Call', icon: <Video className="w-5 h-5" />, desc: 'Microsoft Teams / Zoom' },
  { id: 'phone', label: 'Phone', icon: <Phone className="w-5 h-5" />, desc: 'Telephone consultation' },
]

export function GateBMeeting({ onComplete }: GateBMeetingProps) {
  const [step, setStep] = useState<MeetingStep>('mode')
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  const handleConfirmSchedule = () => setStep('notes')

  const handleComplete = () => {
    setStep('cleared')
    setTimeout(() => onComplete?.(), 800)
  }

  return (
    <div className="flex-1 flex items-start justify-center px-8 pt-4 pb-20">
      <div className="w-full max-w-2xl">
        {/* Mission Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-semibold tracking-widest uppercase">
              Gate B &middot; Active
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            Initial Consultation
          </h1>
          <p className="text-white/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Schedule and complete the initial consultation with the client.
          </p>
        </motion.div>

        <div className="space-y-4">
          {/* Step 1: Meeting Mode */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedMode ? 'bg-emerald-500/15' : 'bg-white/5'
              }`}>
                {selectedMode ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[12px] font-bold text-white/30">1</span>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${selectedMode ? 'text-emerald-400/90' : 'text-white/60'}`}>
                  Meeting Format
                </p>
                {selectedMode && (
                  <p className="text-[12px] text-white/40 mt-0.5">
                    {meetingModes.find((m) => m.id === selectedMode)?.label}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {meetingModes.map((mode) => (
                <motion.button
                  key={mode.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedMode(mode.id)
                    setStep('schedule')
                  }}
                  className={`flex flex-col items-center gap-3 p-5 rounded-xl transition-all ${
                    selectedMode === mode.id
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-white/[0.03] border border-white/5 text-white/50 hover:border-white/15 hover:text-white/70'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    selectedMode === mode.id
                      ? 'bg-emerald-500/15 border border-emerald-500/20'
                      : 'bg-white/5 border border-white/10'
                  }`}>
                    {mode.icon}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{mode.label}</p>
                    <p className="text-[11px] text-white/25 mt-1">{mode.desc}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Step 2: Date/Time Confirmation */}
          <AnimatePresence>
            {selectedMode && step !== 'mode' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl p-5"
                style={{
                  background: step === 'schedule'
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
                    : 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%)',
                  border: step === 'schedule' ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(16,185,129,0.15)',
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    step !== 'schedule' ? 'bg-emerald-500/15' : 'bg-white/5'
                  }`}>
                    {step !== 'schedule' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <span className="text-[12px] font-bold text-white/30">2</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium ${step !== 'schedule' ? 'text-emerald-400/90' : 'text-white/60'}`}>
                    Schedule
                  </p>
                </div>

                {step === 'schedule' && (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                          type="date"
                          className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white/80 text-sm focus:outline-none focus:border-emerald-500/30 transition-colors [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex-1 relative">
                        <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                          type="time"
                          className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white/80 text-sm focus:outline-none focus:border-emerald-500/30 transition-colors [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleConfirmSchedule}
                      className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-medium hover:bg-emerald-500/15 transition-all"
                    >
                      Confirm Meeting
                    </motion.button>
                  </div>
                )}

                {step !== 'schedule' && (
                  <p className="text-[12px] text-white/40 mt-0.5">Meeting confirmed</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 3: Post-Meeting Notes */}
          <AnimatePresence>
            {(step === 'notes' || step === 'cleared') && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div
                  className="rounded-2xl p-5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <NotebookPen className="w-4 h-4 text-white/30" />
                    </div>
                    <p className="text-sm font-medium text-white/60">Meeting Notes</p>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Summary of the consultation…"
                    rows={4}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm placeholder:text-white/20 resize-none focus:outline-none focus:border-emerald-500/30 transition-colors"
                  />
                </div>

                {/* Complete Gate */}
                {step === 'notes' && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={handleComplete}
                    className="w-full relative rounded-2xl p-6 flex items-center justify-center gap-3 overflow-hidden mt-4"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-2xl"
                      animate={{
                        boxShadow: [
                          'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                          'inset 0 0 30px rgba(255,255,255,0.08), 0 8px 48px rgba(16, 185, 129, 0.5), 0 0 80px rgba(16, 185, 129, 0.15)',
                          'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                        ],
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <CheckCircle2 className="w-5 h-5 text-white relative z-10" />
                    <span className="text-white font-semibold text-base relative z-10">
                      Meeting Complete &amp; Proceed
                    </span>
                    <ArrowRight className="w-4 h-4 text-white/70 relative z-10 ml-1" />
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
