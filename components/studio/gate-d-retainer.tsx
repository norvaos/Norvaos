'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSignature,
  CheckCircle2,
  ArrowRight,
  Send,
  FileText,
  DollarSign,
  Download,
  PartyPopper,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Gate D — Retainer Agreement (Vision 2035)
// ---------------------------------------------------------------------------
// Step 1: Select retainer template
// Step 2: Set fee structure
// Step 3: Send for signature → gate clears → matter opens
// ---------------------------------------------------------------------------

type RetainerStep = 'template' | 'fees' | 'send' | 'signed' | 'complete'

interface GateDRetainerProps {
  onComplete?: () => void
}

const templates = [
  { id: 'standard', label: 'Standard Retainer', desc: 'General legal services agreement' },
  { id: 'immigration', label: 'Immigration Retainer', desc: 'IRCC application services' },
  { id: 'family', label: 'Family Law Retainer', desc: 'Family law representation' },
  { id: 'consultation', label: 'Consultation Only', desc: 'Limited-scope advisory' },
]

export function GateDRetainer({ onComplete }: GateDRetainerProps) {
  const [step, setStep] = useState<RetainerStep>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [feeAmount, setFeeAmount] = useState('')

  const handleSend = () => {
    setStep('send')
    // Simulate e-signature
    setTimeout(() => setStep('signed'), 2500)
  }

  const handleComplete = () => {
    setStep('complete')
    setTimeout(() => onComplete?.(), 1200)
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
            <FileSignature className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-semibold tracking-widest uppercase">
              Gate D &middot; Final Gate
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            Retainer Agreement
          </h1>
          <p className="text-white/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Prepare and send the retainer agreement for signature. The matter opens upon execution.
          </p>
        </motion.div>

        <div className="space-y-4">
          {/* Step 1: Template Selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl p-5"
            style={{
              background: selectedTemplate
                ? 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%)'
                : 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: selectedTemplate ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedTemplate ? 'bg-emerald-500/15' : 'bg-white/5'
              }`}>
                {selectedTemplate ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[12px] font-bold text-white/30">1</span>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${selectedTemplate ? 'text-emerald-400/90' : 'text-white/60'}`}>
                  Agreement Template
                </p>
                {selectedTemplate && (
                  <p className="text-[12px] text-white/40 mt-0.5">
                    {templates.find((t) => t.id === selectedTemplate)?.label}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <motion.button
                  key={t.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedTemplate(t.id)
                    setStep('fees')
                  }}
                  className={`flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all ${
                    selectedTemplate === t.id
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-white/[0.03] border border-white/5 hover:border-white/15'
                  }`}
                >
                  <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${
                    selectedTemplate === t.id ? 'text-emerald-400' : 'text-white/30'
                  }`} />
                  <div>
                    <p className={`text-sm font-medium ${
                      selectedTemplate === t.id ? 'text-emerald-400' : 'text-white/60'
                    }`}>{t.label}</p>
                    <p className="text-[11px] text-white/25 mt-0.5">{t.desc}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Step 2: Fee Structure */}
          <AnimatePresence>
            {selectedTemplate && step !== 'template' && (
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
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    step !== 'fees' ? 'bg-emerald-500/15' : 'bg-white/5'
                  }`}>
                    {step !== 'fees' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <DollarSign className="w-4 h-4 text-white/30" />
                    )}
                  </div>
                  <p className={`text-sm font-medium ${step !== 'fees' ? 'text-emerald-400/90' : 'text-white/60'}`}>
                    Fee Structure
                  </p>
                </div>

                {step === 'fees' ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
                      <input
                        type="text"
                        value={feeAmount}
                        onChange={(e) => setFeeAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/30 transition-colors"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleSend}
                      disabled={!feeAmount.trim()}
                      className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-medium hover:bg-emerald-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      Prepare Agreement
                    </motion.button>
                  </div>
                ) : (
                  <p className="text-[12px] text-white/40">${feeAmount} CAD</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 3: Sending / Awaiting Signature */}
          <AnimatePresence>
            {step === 'send' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-2xl p-6 flex items-center gap-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 shrink-0"
                />
                <div>
                  <p className="text-sm text-white/60 font-medium">Sending Agreement…</p>
                  <p className="text-[11px] text-white/25 mt-0.5">
                    E-signature request sent via secure link
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Signed Confirmation + Open Matter */}
          <AnimatePresence>
            {(step === 'signed' || step === 'complete') && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div
                  className="rounded-2xl p-5 mb-4"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-400/90">Agreement Executed</p>
                      <p className="text-[12px] text-white/30 mt-0.5">
                        Signed by client. Agreement stored in Norva Vault.
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:border-emerald-500/20 transition-all"
                    >
                      <Download className="w-4 h-4 text-white/40" />
                    </motion.button>
                  </div>
                </div>

                {step === 'signed' && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={handleComplete}
                    className="w-full relative rounded-2xl p-6 flex items-center justify-center gap-3 overflow-hidden"
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
                    <PartyPopper className="w-5 h-5 text-white relative z-10" />
                    <span className="text-white font-semibold text-base relative z-10">
                      Open Matter
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
