'use client'

/**
 * ChainLockActivateButton  -  Directive 016 + 016.1: "Emerald Flow" Chain-Lock Visual
 *
 * Wrapped in a GenesisGuard that enforces:
 *   - readinessScore must be 100
 *   - genesisBlock must not already exist
 *
 * Activation sequence:
 *   1. Call fn_generate_matter_genesis_block RPC
 *   2. On success → Sovereign Confetti (Emerald Green + Sovereign Gold)
 *   3. Switch matter status to ACTIVE (Emerald Green)
 *   4. Lock dissolves → Sparkle animates in → "Matter Sealed"
 *
 * If guard conditions are not met, button stays in Sovereign Purple
 * disabled state with tooltip: "Shield Requirements Incomplete: View Readiness Report."
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import confetti from 'canvas-confetti'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Lock, Sparkles, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PreFlightChecklist } from '@/components/matters/pre-flight-checklist'
import { SovereignSparkle } from '@/components/layout/sovereign-sparkle'
import { useUIStore } from '@/lib/stores/ui-store'

// ── Exported Hooks ─────────────────────────────────────────────────────────────

/**
 * Fetches the existing genesis block for a matter (if any).
 */
export function useGenesisBlock(matterId: string) {
  return useQuery({
    queryKey: ['genesis-block', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_genesis_metadata')
        .select('id, genesis_hash, is_compliant, compliance_notes, generated_at')
        .eq('matter_id', matterId)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Generates the genesis block via the Supabase RPC.
 * On success: fires Sovereign Confetti + invalidates caches.
 */
function useGenerateGenesisBlock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      tenantId,
      userId,
      conflictSearchId,
    }: {
      matterId: string
      tenantId: string
      userId: string
      conflictSearchId: string
      _onSparkle?: () => void
    }) => {
      const supabase = createClient()

      // 1. Generate the genesis block (Directive 032: conflict search weld)
      const { data, error } = await supabase.rpc('fn_generate_matter_genesis_block', {
        p_matter_id: matterId,
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_conflict_search_id: conflictSearchId,
      })
      if (error) throw error

      // 2. Switch matter status to ACTIVE
      const { error: statusError } = await supabase
        .from('matters')
        .update({ status: 'active' })
        .eq('id', matterId)
        .eq('tenant_id', tenantId)

      if (statusError) {
        console.error('[genesis] Failed to activate matter:', statusError)
      }

      return data
    },
    onSuccess: (_data, variables) => {
      // 3. Sovereign Confetti  -  Emerald Green + Sovereign Gold
      fireSovereignConfetti()

      // Directive 032: Fire the 8-second Sovereign Sparkle overlay
      variables._onSparkle?.()

      // Session B: UI_REFRESH event  -  force CSS re-render for liquid-fill sync
      useUIStore.getState().fireSovereignIgnition()

      // 4. Invalidate all relevant caches
      queryClient.invalidateQueries({ queryKey: ['genesis-block', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['readiness', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['matters', 'detail', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
    },
  })
}

// ── Sovereign Confetti ─────────────────────────────────────────────────────────

const EMERALD_GREEN = '#50C878'
const SOVEREIGN_GOLD = '#D4AF37'

function fireSovereignConfetti() {
  const defaults = {
    spread: 360,
    ticks: 80,
    gravity: 0.8,
    decay: 0.92,
    startVelocity: 25,
    colors: [EMERALD_GREEN, SOVEREIGN_GOLD, '#22c55e', '#d4af37', '#10b981'],
  }

  // Burst from left
  confetti({
    ...defaults,
    particleCount: 40,
    origin: { x: 0.3, y: 0.6 },
  })

  // Burst from right
  confetti({
    ...defaults,
    particleCount: 40,
    origin: { x: 0.7, y: 0.6 },
  })

  // Centre starburst (delayed)
  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 60,
      spread: 120,
      startVelocity: 35,
      origin: { x: 0.5, y: 0.5 },
      shapes: ['star'],
      scalar: 1.2,
    })
  }, 200)
}

// ── GenesisGuard ───────────────────────────────────────────────────────────────

interface GenesisGuardProps {
  readinessScore: number | null | undefined
  genesisExists: boolean
  children: React.ReactNode
}

/**
 * Directive 016.1: Component Guard.
 * If readinessScore < 100 OR genesis already exists, the button stays
 * in Sovereign Purple disabled state with an explanatory tooltip.
 */
function GenesisGuard({ readinessScore, genesisExists, children }: GenesisGuardProps) {
  const score = readinessScore ?? 0
  const isGuarded = score < 100 && !genesisExists

  if (!isGuarded) {
    return <>{children}</>
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Button
              variant="default"
              size="sm"
              disabled
              className="bg-gradient-to-r from-violet-600/60 to-purple-600/60 text-white/70 border-0 cursor-not-allowed"
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              Activate Matter
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="flex items-start gap-2 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-600">Shield Requirements Incomplete</p>
              <p className="text-muted-foreground mt-0.5">
                Readiness must reach 100% before the Genesis Block can be sealed.
                Current score: {score}%.
              </p>
              <p className="text-primary mt-1 font-medium">View Readiness Report.</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Main Button ────────────────────────────────────────────────────────────────

interface ChainLockActivateButtonProps {
  matterId: string
  tenantId: string
  readinessScore?: number | null
  disabled?: boolean
  className?: string
}

export function ChainLockActivateButton({
  matterId,
  tenantId,
  readinessScore,
  disabled = false,
  className,
}: ChainLockActivateButtonProps) {
  const { data: genesis, isLoading: genesisLoading } = useGenesisBlock(matterId)
  const generateGenesis = useGenerateGenesisBlock()
  const [showSparkle, setShowSparkle] = useState(false)
  const [dissolving, setDissolving] = useState(false)
  const [preFlightOpen, setPreFlightOpen] = useState(false)
  const [showSovereignSparkle, setShowSovereignSparkle] = useState(false)
  const prevGenesisRef = useRef<boolean>(false)

  const isSealed = !!genesis
  const isGenerating = generateGenesis.isPending

  // Trigger dissolve → sparkle animation when genesis transitions null → exists
  useEffect(() => {
    if (isSealed && !prevGenesisRef.current) {
      // Fresh seal  -  animate the transition
      setDissolving(true)
      const timer = setTimeout(() => {
        setDissolving(false)
        setShowSparkle(true)
      }, 500)
      prevGenesisRef.current = true
      return () => clearTimeout(timer)
    }
    if (isSealed && prevGenesisRef.current) {
      // Already sealed on mount  -  skip animation
      setShowSparkle(true)
    }
    prevGenesisRef.current = isSealed
  }, [isSealed])

  // Opens the Pre-Flight Checklist modal (Directive 019 hard-gate)
  const handleActivateClick = useCallback(() => {
    if (isSealed || isGenerating || disabled) return
    setPreFlightOpen(true)
  }, [isSealed, isGenerating, disabled])

  // Called only after all 3 pre-flight checks pass
  const handlePreFlightPassed = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userRow) return

    // Directive 032: Resolve the cleared conflict search for the matter's client
    const { data: mc } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!mc?.contact_id) return

    const { data: search } = await (supabase as any)
      .from('global_conflict_results')
      .select('id')
      .eq('source_entity_id', mc.contact_id)
      .eq('status', 'clear')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!search?.id) return

    generateGenesis.mutate({
      matterId,
      tenantId,
      userId: userRow.id,
      conflictSearchId: search.id,
      _onSparkle: () => setShowSovereignSparkle(true),
    })
  }, [matterId, tenantId, generateGenesis])

  if (genesisLoading) {
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        Loading...
      </Button>
    )
  }

  // Wrap in GenesisGuard  -  blocks activation unless readiness === 100
  return (
    <GenesisGuard readinessScore={readinessScore} genesisExists={isSealed}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSealed ? 'outline' : 'default'}
              size="sm"
              disabled={isSealed || isGenerating || disabled}
              onClick={handleActivateClick}
              className={cn(
                'relative overflow-hidden transition-all duration-300',
                !isSealed && !isGenerating && 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0',
                isSealed && 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                className,
              )}
            >
              {/* Lock icon  -  dissolves when genesis block created */}
              {!isSealed && !isGenerating && (
                <Lock className={cn(
                  'mr-1.5 h-3.5 w-3.5 transition-all',
                  dissolving && 'animate-chain-lock-dissolve',
                )} />
              )}

              {/* Spinner during generation */}
              {isGenerating && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}

              {/* Sovereign Sparkle  -  appears after lock dissolves */}
              {isSealed && showSparkle && !dissolving && (
                <Sparkles className="mr-1.5 h-3.5 w-3.5 animate-sovereign-sparkle text-emerald-600" />
              )}

              {/* Shield check for long-term sealed display */}
              {isSealed && !showSparkle && !dissolving && (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              )}

              {isGenerating ? 'Sealing...' : isSealed ? 'Matter Sealed' : 'Activate Matter'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isSealed ? (
              <div className="text-xs space-y-1">
                <p className="font-medium">Genesis Block Sealed</p>
                <p>Hash: {genesis?.genesis_hash?.slice(0, 16)}...</p>
                <p>Compliant: {genesis?.is_compliant ? 'Yes' : 'No'}</p>
                {genesis?.compliance_notes && (
                  <p className="text-muted-foreground">{genesis.compliance_notes}</p>
                )}
              </div>
            ) : (
              <p className="text-xs">Generate the immutable genesis block for this matter</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Directive 019: Pre-Flight Checklist  -  hard-gate before genesis */}
      <PreFlightChecklist
        open={preFlightOpen}
        onOpenChange={setPreFlightOpen}
        matterId={matterId}
        tenantId={tenantId}
        onAllPassed={handlePreFlightPassed}
      />

      {/* Directive 032: 8-second Sovereign Sparkle on Genesis ignition */}
      {showSovereignSparkle && (
        <SovereignSparkle onDismiss={() => setShowSovereignSparkle(false)} />
      )}
    </GenesisGuard>
  )
}
