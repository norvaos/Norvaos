'use client'

/**
 * DocumentTamperOverlay  -  Directive 016.1: Integrity Overlay
 *
 * If a document's SHA-256 does not match the Genesis record (or the stored
 * content_hash), applies a backdrop-blur and a red "Tamper Warning" icon
 * over the file preview area.
 *
 * Usage: Wrap any document preview/card content with this component.
 * Pass the document's tamper_status from the DB.
 */

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type TamperStatus = 'verified' | 'tampered' | 'unchecked' | null | undefined

interface DocumentTamperOverlayProps {
  documentId: string
  tamperStatus: TamperStatus
  /** Wraps the document preview/card content */
  children: React.ReactNode
  className?: string
}

/**
 * Verify a document's integrity via the verify-integrity API.
 */
function useVerifyIntegrity() {
  return useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch('/api/documents/verify-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      if (!res.ok) throw new Error('Verification failed')
      return res.json() as Promise<{
        status: 'verified' | 'tampered' | 'unchecked' | 'missing'
        isTampered?: boolean
      }>
    },
  })
}

export function DocumentTamperOverlay({
  documentId,
  tamperStatus,
  children,
  className,
}: DocumentTamperOverlayProps) {
  const [localStatus, setLocalStatus] = useState<TamperStatus>(tamperStatus)
  const verifyMutation = useVerifyIntegrity()

  const handleVerify = useCallback(async () => {
    const result = await verifyMutation.mutateAsync(documentId)
    setLocalStatus(result.status === 'missing' ? 'tampered' : result.status)
  }, [documentId, verifyMutation])

  const isTampered = localStatus === 'tampered'

  return (
    <div className={cn('relative', className)}>
      {children}

      {/* Tamper Warning Overlay */}
      {isTampered && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg backdrop-blur-md bg-red-950/30 border-2 border-red-500/50">
          <ShieldAlert className="h-8 w-8 text-red-500 drop-shadow-lg" />
          <Badge className="bg-red-600 text-white border-red-700 gap-1.5 px-3 py-1">
            <ShieldAlert className="h-3 w-3" />
            Tamper Warning
          </Badge>
          <p className="text-xs text-red-200 text-center max-w-[200px]">
            Document hash does not match the recorded integrity seal.
            This file may have been modified outside NorvaOS.
          </p>
        </div>
      )}

      {/* Inline tamper badge for non-overlay context */}
      {isTampered && (
        <div className="absolute top-2 right-2 z-20">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  className="bg-red-600 text-white border-red-700 gap-1 cursor-help animate-pulse"
                >
                  <ShieldAlert className="h-3 w-3" />
                  TAMPERED
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-xs">
                  SHA-256 integrity check failed. This document&apos;s content has been
                  modified since it was uploaded. A SENTINEL alert has been logged.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}

/**
 * Compact tamper status indicator for use in slot cards / document rows.
 * Shows a small verify button for unchecked docs, or a status badge.
 */
export function TamperStatusIndicator({
  documentId,
  tamperStatus,
}: {
  documentId: string
  tamperStatus: TamperStatus
}) {
  const [localStatus, setLocalStatus] = useState<TamperStatus>(tamperStatus)
  const verifyMutation = useVerifyIntegrity()

  const handleVerify = useCallback(async () => {
    const result = await verifyMutation.mutateAsync(documentId)
    setLocalStatus(result.status === 'missing' ? 'tampered' : result.status)
  }, [documentId, verifyMutation])

  if (localStatus === 'tampered') {
    return (
      <Badge
        variant="destructive"
        className="gap-1 text-[10px] animate-pulse cursor-help"
        title="SHA-256 integrity check failed"
      >
        <ShieldAlert className="h-2.5 w-2.5" />
        TAMPERED
      </Badge>
    )
  }

  if (localStatus === 'verified') {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50"
        title="SHA-256 integrity verified"
      >
        <ShieldAlert className="h-2.5 w-2.5" />
        Verified
      </Badge>
    )
  }

  // Unchecked  -  show verify button
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleVerify}
      disabled={verifyMutation.isPending}
      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
      title="Verify document integrity (SHA-256)"
    >
      {verifyMutation.isPending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <RefreshCw className="h-2.5 w-2.5 mr-0.5" />
      )}
      Verify
    </Button>
  )
}
