'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Fingerprint,
  Send,
  Camera,
  CheckCircle2,
  Clock,
  ChevronDown,
  ArrowRight,
  Scan,
  User,
  Calendar,
  Hash,
  Globe,
} from 'lucide-react'

type VerificationStep = 'initiate' | 'document-select' | 'awaiting' | 'review'

interface DocumentOption {
  id: string
  label: string
  icon: React.ReactNode
}

const documentTypes: DocumentOption[] = [
  { id: 'passport', label: 'Passport', icon: <Globe className="w-4 h-4" /> },
  { id: 'drivers_licence', label: "Driver's Licence", icon: <Scan className="w-4 h-4" /> },
  { id: 'pr_card', label: 'PR Card', icon: <User className="w-4 h-4" /> },
  { id: 'national_id', label: 'National ID', icon: <Hash className="w-4 h-4" /> },
]

const fieldSlideIn = {
  initial: { opacity: 0, y: 16, height: 0 } as const,
  animate: { opacity: 1, y: 0, height: 'auto' as const },
  exit: { opacity: 0, y: -8, height: 0 },
  transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
}

export function GateCCapture() {
  const [step, setStep] = useState<VerificationStep>('initiate')
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [showDocSelector, setShowDocSelector] = useState(false)

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
            <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-semibold tracking-widest uppercase">
              Gate C &middot; Active
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            Identity Verification
          </h1>
          <p className="text-white/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Verify the client's identity before proceeding to the retainer agreement.
          </p>
        </motion.div>

        {/* Client Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl p-5 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-white/85 font-medium">Amira Hassan</p>
              <p className="text-white/30 text-[12px] mt-0.5">amira.hassan@email.com &middot; +1 (416) 555-0142</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-medium">Pending</span>
            </div>
          </div>
        </motion.div>

        {/* The Corridor — Progressive Disclosure */}
        <div className="space-y-4">
          {/* Step 1: Document Type Selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <button
              onClick={() => setShowDocSelector(!showDocSelector)}
              className="w-full rounded-2xl p-5 text-left transition-all"
              style={{
                background: selectedDoc
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                border: selectedDoc ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    selectedDoc ? 'bg-emerald-500/15' : 'bg-white/5'
                  }`}>
                    {selectedDoc ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <span className="text-[12px] font-bold text-white/30">1</span>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${selectedDoc ? 'text-emerald-400/90' : 'text-white/60'}`}>
                      Document Type
                    </p>
                    {selectedDoc && (
                      <p className="text-[12px] text-white/40 mt-0.5">
                        {documentTypes.find((d) => d.id === selectedDoc)?.label}
                      </p>
                    )}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/20 transition-transform ${showDocSelector ? 'rotate-180' : ''}`} />
              </div>
            </button>

            <AnimatePresence>
              {showDocSelector && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  className="grid grid-cols-2 gap-3 mt-3 px-1"
                >
                  {documentTypes.map((doc) => (
                    <motion.button
                      key={doc.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setSelectedDoc(doc.id)
                        setShowDocSelector(false)
                        setStep('document-select')
                      }}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                        selectedDoc === doc.id
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-white/[0.03] border border-white/5 text-white/50 hover:border-white/15 hover:text-white/70'
                      }`}
                    >
                      {doc.icon}
                      <span className="text-sm font-medium">{doc.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Step 2: Capture Method — slides in after document selected */}
          <AnimatePresence>
            {selectedDoc && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <span className="text-[12px] font-bold text-white/30">2</span>
                  </div>
                  <p className="text-sm font-medium text-white/60">Capture Method</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-col items-center gap-3 p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/20 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/15 transition-colors">
                      <Camera className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">
                        In-Office Scan
                      </p>
                      <p className="text-[11px] text-white/25 mt-1">Scan the document now</p>
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep('awaiting')}
                    className="flex flex-col items-center gap-3 p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/20 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/15 transition-colors">
                      <Send className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">
                        Remote Capture
                      </p>
                      <p className="text-[11px] text-white/25 mt-1">Send link to client</p>
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 3: SMS Send — the dominant action */}
          <AnimatePresence>
            {step === 'awaiting' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="pt-4"
              >
                {/* THE PRIMARY ACTION — Emerald Pulse */}
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="w-full relative rounded-2xl p-6 flex items-center justify-center gap-3 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  }}
                >
                  {/* Breathing Pulse Ring */}
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

                  <Send className="w-5 h-5 text-white relative z-10" />
                  <span className="text-white font-semibold text-base relative z-10">
                    Send SMS to Client
                  </span>
                  <ArrowRight className="w-4 h-4 text-white/70 relative z-10 ml-1" />
                </motion.button>

                <p className="text-center text-[11px] text-white/20 mt-3">
                  A secure link will be sent to +1 (416) 555-0142 for document upload
                </p>

                {/* Awaiting indicator */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 rounded-xl p-4 flex items-center gap-3"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 flex items-center justify-center shrink-0"
                  />
                  <div>
                    <p className="text-[12px] text-white/50 font-medium">Awaiting Client Response</p>
                    <p className="text-[11px] text-white/20 mt-0.5">
                      The operator can continue other work. You'll be notified when documents arrive.
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
