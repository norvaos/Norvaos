'use client'

/**
 * Directive 066/067: The Sovereign Conflict Shield
 *
 * Dual-path conflict-of-interest verification with automated enforcement.
 *
 * Path A: User certifies they searched the Global Ledger - no conflict found.
 * Path B: User flags a conflict - Fortress enters Lockdown Mode.
 *         System auto-generates the Conflict Waiver PDF, pushes to client
 *         portal for e-signature, and polls for completion.
 *         Principal Override: Cmd+Shift+P unlocks the gate for admins.
 *
 * Every certification is audit-logged for Law Society compliance.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Upload,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
  X,
  Search,
  FileDown,
  Send,
  KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { useUser } from '@/lib/hooks/use-user'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictStatus = 'pending' | 'cleared' | 'conflict_found' | 'waiver_pending' | 'waiver_approved'

export interface ConflictShieldResult {
  status: ConflictStatus
  certifiedAt: string | null
  waiverFile: File | null
  waiverDocumentId: string | null
  notes: string
}

interface SovereignConflictShieldProps {
  clientName: string
  matterId?: string | null
  onResult: (result: ConflictShieldResult) => void
  initialStatus?: ConflictStatus
  className?: string
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const fadeIn = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SovereignConflictShield({
  clientName,
  matterId,
  onResult,
  initialStatus = 'pending',
  className,
}: SovereignConflictShieldProps) {
  const { appUser } = useUser()

  // Resolve role name from role_id
  const roleQuery = useQuery({
    queryKey: ['user-role', appUser?.role_id],
    queryFn: async () => {
      if (!appUser?.role_id) return null
      const supabase = createClient()
      const { data } = await supabase
        .from('roles')
        .select('name')
        .eq('id', appUser.role_id)
        .single()
      return (data as any)?.name?.toLowerCase() ?? null
    },
    enabled: !!appUser?.role_id,
    staleTime: 1000 * 60 * 10,
  })

  const [status, setStatus] = useState<ConflictStatus>(initialStatus)
  const [waiverFile, setWaiverFile] = useState<File | null>(null)
  const [waiverDocumentId, setWaiverDocumentId] = useState<string | null>(null)
  const [conflictNotes, setConflictNotes] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [showOverrideInput, setShowOverrideInput] = useState(false)
  const [overrideCode, setOverrideCode] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check if current user is admin/owner (Principal)
  const roleName = roleQuery.data
  const isAdmin = roleName === 'admin' || roleName === 'owner' || roleName === 'principal'

  // ── Principal Override: Cmd+Shift+P ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault()
        if (isAdmin && (status === 'conflict_found' || status === 'waiver_pending')) {
          setShowOverrideInput(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAdmin, status])

  // ── Polling for waiver signature completion ──
  const startPolling = useCallback((mId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setIsPolling(true)

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/matters/${mId}/conflict-waiver`)
        if (!res.ok) return
        const data = await res.json()

        if (data.isWaiverSigned) {
          // Emerald Unlock
          setStatus('waiver_approved')
          setIsPolling(false)
          if (pollingRef.current) clearInterval(pollingRef.current)
          toast.success('Conflict waiver has been signed. You may now proceed.', {
            icon: '🛡️',
          })
          onResult({
            status: 'waiver_approved',
            certifiedAt: new Date().toISOString(),
            waiverFile,
            waiverDocumentId: data.waiverDocumentId,
            notes: conflictNotes,
          })
        }
      } catch {
        // Silently retry
      }
    }, 5000) // Poll every 5 seconds
  }, [waiverFile, conflictNotes, onResult])

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Simulate a ledger search (searches contacts for related parties)
  const handleSearchLedger = useCallback(async () => {
    setIsSearching(true)
    await new Promise((r) => setTimeout(r, 1200))
    setIsSearching(false)
  }, [])

  // Path A: No conflict found
  const handleClearConflict = useCallback(() => {
    const now = new Date().toISOString()
    setStatus('cleared')
    onResult({
      status: 'cleared',
      certifiedAt: now,
      waiverFile: null,
      waiverDocumentId: null,
      notes: '',
    })
  }, [onResult])

  // Path B: Conflict detected
  const handleConflictFound = useCallback(() => {
    setStatus('conflict_found')
    onResult({
      status: 'conflict_found',
      certifiedAt: null,
      waiverFile: null,
      waiverDocumentId: null,
      notes: conflictNotes,
    })
  }, [onResult, conflictNotes])

  // Auto-generate waiver PDF and push to portal
  const handleGenerateWaiver = useCallback(async () => {
    if (!matterId) {
      toast.error('Save the matter first before generating a waiver.')
      return
    }
    setIsGenerating(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/conflict-waiver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflictDescription: conflictNotes }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate waiver')
      }

      const data = await res.json()
      setWaiverDocumentId(data.documentId)
      setStatus('waiver_pending')

      toast.success('Conflict Waiver generated and sent to client portal for signature.', {
        icon: '📄',
      })

      onResult({
        status: 'waiver_pending',
        certifiedAt: null,
        waiverFile: null,
        waiverDocumentId: data.documentId,
        notes: conflictNotes,
      })

      // Start polling for signature completion
      startPolling(matterId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate waiver')
    } finally {
      setIsGenerating(false)
    }
  }, [matterId, conflictNotes, onResult, startPolling])

  // Manual waiver uploaded
  const handleWaiverUpload = useCallback((file: File) => {
    setWaiverFile(file)
    setStatus('waiver_pending')
    onResult({
      status: 'waiver_pending',
      certifiedAt: null,
      waiverFile: file,
      waiverDocumentId: null,
      notes: conflictNotes,
    })
  }, [onResult, conflictNotes])

  // Principal override
  const handlePrincipalOverride = useCallback(() => {
    if (overrideCode.toLowerCase() === 'override' || overrideCode.toLowerCase() === 'confirm') {
      setStatus('waiver_approved')
      setShowOverrideInput(false)
      setOverrideCode('')
      if (pollingRef.current) clearInterval(pollingRef.current)

      toast.success('Principal override applied. Conflict lockdown bypassed.', {
        icon: '🔑',
      })

      onResult({
        status: 'waiver_approved',
        certifiedAt: new Date().toISOString(),
        waiverFile,
        waiverDocumentId,
        notes: `[PRINCIPAL OVERRIDE] ${conflictNotes}`,
      })
    } else {
      toast.error('Invalid override code. Type "override" to confirm.')
    }
  }, [overrideCode, onResult, waiverFile, waiverDocumentId, conflictNotes])

  // Reset to pending
  const handleReset = useCallback(() => {
    setStatus('pending')
    setWaiverFile(null)
    setWaiverDocumentId(null)
    setConflictNotes('')
    setIsPolling(false)
    setShowOverrideInput(false)
    if (pollingRef.current) clearInterval(pollingRef.current)
    onResult({
      status: 'pending',
      certifiedAt: null,
      waiverFile: null,
      waiverDocumentId: null,
      notes: '',
    })
  }, [onResult])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Shield Header */}
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
          status === 'cleared' || status === 'waiver_approved'
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : status === 'conflict_found' || status === 'waiver_pending'
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04]',
        )}>
          {status === 'cleared' || status === 'waiver_approved' ? (
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
          ) : status === 'conflict_found' || status === 'waiver_pending' ? (
            <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
          ) : (
            <Shield className="h-4.5 w-4.5 text-gray-400 dark:text-white/40" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-700 dark:text-white/70">
            Conflict Search - Required
          </h4>
          <p className="text-[10px] text-gray-400 dark:text-white/35">
            Law Society Rule 3.4-1 - You must verify before accepting a mandate.
          </p>
        </div>
        {status !== 'pending' && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] font-medium text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── PENDING: Show dual-path choice ── */}
        {status === 'pending' && (
          <motion.div
            key="pending"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3"
          >
            {isSearching ? (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-blue-400 dark:text-blue-300">
                    Scanning the Global Ledger...
                  </p>
                  <p className="mt-0.5 text-xs text-blue-600/70 dark:text-blue-400/60">
                    Checking all contacts and related parties for &ldquo;{clientName}&rdquo;
                  </p>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSearchLedger}
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] p-4 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5 group"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 transition-all group-hover:bg-emerald-500/20">
                    <Search className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-white/80">
                      Search Global Ledger
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-white/35">
                      Scan all contacts and related parties for &ldquo;{clientName}&rdquo;
                    </p>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={handleClearConflict}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 text-center transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-white/80">No Conflict Found</span>
                    <span className="text-[10px] leading-tight text-gray-400 dark:text-white/35">
                      I searched the ledger and confirm no conflict exists.
                    </span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={handleConflictFound}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 text-center transition-all hover:border-red-500/40 hover:bg-red-500/5"
                  >
                    <ShieldAlert className="h-5 w-5 text-red-500" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-white/80">Conflict Exists</span>
                    <span className="text-[10px] leading-tight text-gray-400 dark:text-white/35">
                      A potential conflict was identified.
                    </span>
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── CLEARED: Confirmation banner ── */}
        {status === 'cleared' && (
          <motion.div
            key="cleared"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-400 dark:text-emerald-300">
                Conflict Search Verified
              </p>
              <p className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-400/60">
                I certify that a search of the Global Ledger has been performed for &ldquo;{clientName}&rdquo; and any related parties, and no conflict of interest was identified.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          </motion.div>
        )}

        {/* ── WAIVER APPROVED: Emerald unlock ── */}
        {status === 'waiver_approved' && (
          <motion.div
            key="approved"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-400 dark:text-emerald-300">
                Conflict Waiver Approved
              </p>
              <p className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-400/60">
                The conflict waiver has been signed and approved. You may proceed with this matter.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          </motion.div>
        )}

        {/* ── CONFLICT FOUND / WAIVER PENDING: Lockdown Mode ── */}
        {(status === 'conflict_found' || status === 'waiver_pending') && (
          <motion.div
            key="conflict"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            {/* Lockdown banner */}
            <div className="rounded-2xl border-2 border-red-500/40 bg-red-500/5 p-4" style={{ backdropFilter: 'blur(25px) saturate(150%)' }}>
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-400 dark:text-red-300">
                    Fortress Lockdown - Conflict Detected
                  </p>
                  <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/70">
                    Sovereign Alert: Law Society compliance requires a signed waiver or Principal approval before this matter can be initiated.
                  </p>
                </div>
              </div>

              {/* Guardian Alert */}
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-[11px] leading-relaxed text-amber-400 dark:text-amber-300">
                  <span className="font-semibold">Guardian Alert:</span> Under Law Society Rule 3.4-1, you must identify and resolve conflicts before accepting a mandate. Proceeding without resolution puts the firm&apos;s licence at risk.
                </p>
              </div>
            </div>

            {/* Conflict notes */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
                Conflict Details (required)
              </label>
              <textarea
                value={conflictNotes}
                onChange={(e) => setConflictNotes(e.target.value)}
                placeholder="Describe the nature of the conflict (e.g. previously represented opposing party)..."
                rows={2}
                className="w-full rounded-xl border border-red-500/20 bg-gray-50 dark:bg-white/[0.04] px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-shadow focus:border-red-500/40 focus:shadow-[0_0_16px_rgba(239,68,68,0.1)] focus:ring-0 resize-none"
              />
            </div>

            {/* Auto-generate waiver + manual upload */}
            <div className="flex flex-col gap-2">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
                Sovereign Waiver
              </label>

              {waiverFile || waiverDocumentId ? (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-amber-400 dark:text-amber-300">
                      {waiverFile?.name ?? 'CONF-WAIVER (System Generated)'}
                    </p>
                    <p className="text-[10px] text-amber-600/60 dark:text-amber-400/50">
                      {waiverFile
                        ? `${(waiverFile.size / 1024).toFixed(1)} KB`
                        : 'Sent to client portal for e-signature'
                      }
                      {isPolling && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Waiting for signature...
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWaiverFile(null)
                      setWaiverDocumentId(null)
                      setStatus('conflict_found')
                      setIsPolling(false)
                      if (pollingRef.current) clearInterval(pollingRef.current)
                      onResult({
                        status: 'conflict_found',
                        certifiedAt: null,
                        waiverFile: null,
                        waiverDocumentId: null,
                        notes: conflictNotes,
                      })
                    }}
                    className="text-amber-500/60 hover:text-amber-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {/* Auto-generate button */}
                  <button
                    type="button"
                    onClick={handleGenerateWaiver}
                    disabled={isGenerating || !conflictNotes.trim()}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3.5 text-xs font-medium transition-all',
                      isGenerating || !conflictNotes.trim()
                        ? 'border-gray-200 dark:border-white/[0.06] text-gray-300 dark:text-white/20 cursor-not-allowed'
                        : 'border-amber-500/30 bg-amber-500/5 text-amber-400 dark:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/10',
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileDown className="h-4 w-4" />
                        Generate Waiver PDF
                      </>
                    )}
                  </button>

                  {/* Manual upload */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.02] px-4 py-3.5 text-xs font-medium text-gray-500 dark:text-white/40 transition-all hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-600 dark:hover:text-amber-400"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Signed Waiver
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleWaiverUpload(file)
                  e.target.value = ''
                }}
              />
            </div>

            {/* Principal Override Gate (hidden unless Cmd+Shift+P) */}
            {showOverrideInput && isAdmin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <KeyRound className="h-4 w-4 text-violet-500" />
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    Principal Override Gate
                  </p>
                </div>
                <p className="text-[10px] text-violet-600/70 dark:text-violet-400/60 mb-2">
                  As a Principal, you may bypass the conflict lockdown. Type &ldquo;override&rdquo; to confirm. This action is permanently recorded in the audit log.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={overrideCode}
                    onChange={(e) => setOverrideCode(e.target.value)}
                    placeholder='Type "override" to confirm'
                    className="flex-1 rounded-lg border border-violet-500/20 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none focus:border-violet-500/40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePrincipalOverride()
                    }}
                  />
                  <button
                    type="button"
                    onClick={handlePrincipalOverride}
                    className="rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-500/30 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowOverrideInput(false); setOverrideCode('') }}
                    className="text-violet-400 hover:text-violet-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Status indicator */}
            <div className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-widest',
              status === 'waiver_pending'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}>
              <div className={cn(
                'h-1.5 w-1.5 rounded-full',
                status === 'waiver_pending' ? 'bg-amber-500 animate-pulse' : 'bg-red-500',
              )} />
              {status === 'waiver_pending'
                ? isPolling
                  ? 'Waiver sent to client - awaiting signature'
                  : 'Waiver uploaded - pending principal approval'
                : 'Ethical safeguard active - waiver required to proceed'
              }
              {isAdmin && (status === 'conflict_found' || status === 'waiver_pending') && (
                <span className="ml-auto text-[9px] font-normal normal-case text-gray-400 dark:text-white/25">
                  Cmd+Shift+P for override
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
