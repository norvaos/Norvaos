'use client'

/**
 * Regulatory Status Sidebar  -  Directive 41.2 (LSO/CICC Standards)
 *
 * Displays "License to Practice" integrity for the Command Centre:
 *   1. Conflict Check Badge: [Status] | [Timestamp] | [Officer_ID]
 *   2. AML Shield: Green only when Gov ID hash matches uploaded Identity doc
 *   3. Agreement Tracker: Link to signed Retainer with immutable SHA-256 hash
 */

import { useCommandCentre } from '../command-centre-context'
import { useTenant } from '@/lib/hooks/use-tenant'
import { formatDateTime } from '@/lib/utils/formatters'
import {
  useLatestConflictScan,
  useAMLShield,
  useRetainerAgreement,
} from '@/lib/hooks/use-compliance-data'
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Fingerprint,
  FileSignature,
  ExternalLink,
  Loader2,
  Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Jurisdiction Config (now reads from tenants.home_province) ───────────────

import { resolveRegulatoryBody } from '@/lib/config/jurisdictions'

// ── Hooks imported from lib/hooks/use-compliance-data.ts (Directive 41.3) ─────

// ── Component ──────────────────────────────────────────────────────────────────

export function RegulatorySidebar() {
  const { lead, matter, contact, tenantId, entityId, entityType } = useCommandCentre()
  const { tenant } = useTenant()

  const contactId = contact?.id ?? null
  const leadId = entityType === 'lead' ? entityId : lead?.id ?? null
  const matterId = entityType === 'matter' ? entityId : matter?.id ?? null

  // Read home_province directly from TenantProvider (populated by /api/auth/me → select('*'))
  const regBody = resolveRegulatoryBody(tenant?.home_province ?? null)

  const { data: conflictScan, isLoading: scanLoading } = useLatestConflictScan(contactId, tenantId)
  const { data: amlResult, isLoading: amlLoading } = useAMLShield(contactId, tenantId)
  const { data: retainer, isLoading: retainerLoading } = useRetainerAgreement(leadId, matterId, tenantId)

  const isLoading = scanLoading || amlLoading || retainerLoading

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-blue-600" />
          Regulatory Status
        </CardTitle>
        {/* ── Firm Compliance Badge (Global Tenant Level) ────────── */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge
                  variant="outline"
                  className="gap-1 text-[9px] border-emerald-500/30 bg-emerald-950/30 text-emerald-400"
                >
                  <Building2 className="size-2.5" />
                  {regBody ? `${regBody.name} (${regBody.abbr})` : 'No Regulatory Body Set'}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[9px] border-blue-500/20 text-blue-600"
                >
                  {regBody ? `${regBody.scope === 'federal' ? 'Federal' : regBody.provinceCode}  -  Compliance Active` : 'Configure in Settings → Firm'}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-xs">
              Firm-level compliance set to {regBody ? regBody.name : 'unconfigured'}. All modules (AML Shield, Conflict Check, Sovereign Block) operate under {regBody ? `${regBody.abbr} regulations` : 'default rules'}.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ── 1. Conflict Check Badge ───────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {scanLoading ? (
              <Loader2 className="size-3.5 animate-spin text-slate-400" />
            ) : conflictScan?.status === 'completed' && (conflictScan.score ?? 0) < 50 ? (
              <ShieldCheck className="size-3.5 text-green-600" />
            ) : conflictScan?.status === 'completed' ? (
              <ShieldAlert className="size-3.5 text-amber-600" />
            ) : (
              <Shield className="size-3.5 text-slate-400" />
            )}
            <span className="text-xs font-medium">Conflict Check</span>
          </div>
          {conflictScan ? (
            <div className="ml-5.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <Badge variant="outline" className={cn(
                'text-[9px]',
                conflictScan.status === 'completed' && (conflictScan.score ?? 0) < 50
                  ? 'border-emerald-500/20 bg-emerald-950/30 text-emerald-400'
                  : conflictScan.status === 'completed'
                    ? 'border-amber-500/20 bg-amber-950/30 text-amber-400'
                    : 'border-slate-200 text-slate-500',
              )}>
                {conflictScan.status === 'completed' ? `Score: ${conflictScan.score ?? 0}` : conflictScan.status}
              </Badge>
              <span className="text-slate-300">|</span>
              <span>{conflictScan.completed_at ? formatDateTime(conflictScan.completed_at) : formatDateTime(conflictScan.created_at)}</span>
              <span className="text-slate-300">|</span>
              <span>{conflictScan.officer_name ?? 'System'}</span>
            </div>
          ) : !scanLoading ? (
            <p className="ml-5.5 text-[10px] text-muted-foreground">No conflict scan on record</p>
          ) : null}
        </div>

        {/* ── 2. AML Shield ─────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {amlLoading ? (
              <Loader2 className="size-3.5 animate-spin text-slate-400" />
            ) : amlResult?.hashMatch ? (
              <Fingerprint className="size-3.5 text-green-600" />
            ) : amlResult?.hasIdentityDoc ? (
              <Fingerprint className="size-3.5 text-amber-500" />
            ) : (
              <Fingerprint className="size-3.5 text-slate-400" />
            )}
            <span className="text-xs font-medium">AML Shield</span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-auto text-[9px]',
                      amlResult?.hashMatch
                        ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400'
                        : 'border-slate-200 text-slate-500',
                    )}
                  >
                    {amlResult?.hashMatch ? 'MATCH' : amlResult?.hasIdentityDoc ? 'MISMATCH' : 'PENDING'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs max-w-xs">
                  {amlResult?.hashMatch
                    ? 'SHA-256 hash of Government ID matches the uploaded Identity document.'
                    : amlResult?.hasIdentityDoc
                      ? 'Identity document uploaded but hash does not match Government ID verification.'
                      : 'No Identity category document uploaded yet.'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {amlResult?.uploadedIdHash && (
            <p className="ml-5.5 text-[10px] font-mono text-muted-foreground truncate">
              {amlResult.uploadedIdHash.slice(0, 16)}…{amlResult.uploadedIdHash.slice(-8)}
            </p>
          )}
        </div>

        {/* ── 3. Agreement Tracker ──────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {retainerLoading ? (
              <Loader2 className="size-3.5 animate-spin text-slate-400" />
            ) : retainer?.signed_at ? (
              <FileSignature className="size-3.5 text-green-600" />
            ) : retainer ? (
              <FileSignature className="size-3.5 text-amber-500" />
            ) : (
              <FileSignature className="size-3.5 text-slate-400" />
            )}
            <span className="text-xs font-medium">Retainer Agreement</span>
          </div>
          {retainer ? (
            <div className="ml-5.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <a
                  href={retainer.storage_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                >
                  {retainer.file_name}
                  <ExternalLink className="size-2.5" />
                </a>
                {retainer.signed_at && (
                  <Badge variant="outline" className="text-[8px] border-emerald-500/20 bg-emerald-950/30 text-emerald-400">
                    SIGNED
                  </Badge>
                )}
              </div>
              {retainer.content_hash && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[10px] font-mono text-muted-foreground cursor-help">
                        SHA-256: {retainer.content_hash.slice(0, 16)}…{retainer.content_hash.slice(-8)}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-mono max-w-sm break-all">
                      {retainer.content_hash}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ) : !retainerLoading ? (
            <p className="ml-5.5 text-[10px] text-muted-foreground">No retainer agreement on record</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
