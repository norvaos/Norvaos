'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Smartphone, MessageSquare } from 'lucide-react'

type Channel = 'sms' | 'whatsapp'

const quickMessages = [
  'Please upload a clear photo of your passport bio page.',
  'We need a copy of your government-issued ID to proceed.',
  'Kindly send a selfie holding your ID for verification.',
]

export function CommBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [channel, setChannel] = useState<Channel>('sms')
  const [message, setMessage] = useState('')

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute bottom-20 right-0 w-[380px] rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #1e1e2a 0%, #16161f 100%)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 32px rgba(16, 185, 129, 0.08)',
            }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <p className="text-white/90 text-sm font-semibold">Client Comm</p>
                <p className="text-white/40 text-[11px] mt-0.5">Amira Hassan &middot; +1 (416) 555-0142</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {/* Channel Toggle */}
            <div className="px-5 pt-4 flex gap-2">
              <button
                onClick={() => setChannel('sms')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  channel === 'sms'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-white/30 border border-white/10 hover:border-white/20'
                }`}
              >
                <Smartphone className="w-3 h-3" /> SMS
              </button>
              <button
                onClick={() => setChannel('whatsapp')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-white/30 border border-white/10 hover:border-white/20'
                }`}
              >
                <MessageSquare className="w-3 h-3" /> WhatsApp
              </button>
            </div>

            {/* Quick Messages */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium mb-2">Quick Nudges</p>
              {quickMessages.map((msg, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(msg)}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-emerald-500/20 text-white/50 hover:text-white/70 text-[12px] leading-relaxed transition-all"
                >
                  {msg}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-5 pb-5">
              <div className="flex gap-2 items-end">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  rows={2}
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white/80 text-sm placeholder:text-white/20 resize-none focus:outline-none focus:border-emerald-500/30 transition-colors"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0"
                  style={{ boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)' }}
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bubble Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-14 h-14 rounded-full flex items-center justify-center relative"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.35), 0 0 0 1px rgba(16, 185, 129, 0.2)',
        }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notification dot */}
        {!isOpen && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0f0f17]" />
        )}
      </motion.button>
    </div>
  )
}
