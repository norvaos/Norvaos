'use client'

import { FileText, Download, Eye, CheckCircle2, Clock, AlertTriangle, Package, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { toast } from 'sonner'
import type { FormPackVersion, FormPackArtifact } from '@/lib/types/form-packs'

// ─── Props ───────────────────────────────────────────────────────────────────

interface FinalPackagePanelProps {
  matterId: string
  tenantId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FinalPackagePanel({ matterId, tenantId }: FinalPackagePanelProps) {
  // Fetch all form pack versions for this matter (latest first)
  const { data: versions, isLoading } = useQuery({
    queryKey: ['form_pack_versions', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('form_pack_versions')
        .select('id, pack_type, version_number, status, validation_result, created_at, approved_at')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as Pick<FormPackVersion, 'id' | 'pack_type' | 'version_number' | 'status' | 'validation_result' | 'created_at' | 'approved_at'>[]
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })

  // Fetch artifacts for all versions
  const versionIds = versions?.map((v) => v.id) ?? []
  const { data: artifacts } = useQuery({
    queryKey: ['form_pack_artifacts', matterId, versionIds],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('form_pack_artifacts')
        .select('id, pack_version_id, form_code, file_name, file_size, storage_path, is_final, created_at')
        .in('pack_version_id', versionIds)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as Pick<FormPackArtifact, 'id' | 'pack_version_id' | 'form_code' | 'file_name' | 'file_size' | 'storage_path' | 'is_final' | 'created_at'>[]
    },
    enabled: versionIds.length > 0,
    staleTime: 30_000,
  })

  const handleDownload = async (artifact: Pick<FormPackArtifact, 'storage_path' | 'file_name'>) => {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('form-packs')
      .createSignedUrl(artifact.storage_path, 60)

    if (error || !data?.signedUrl) {
      toast.error('Failed to generate download link')
      return
    }

    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = artifact.file_name
    a.click()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const approvedVersions = versions?.filter((v) => v.status === 'approved') ?? []
  const draftVersions = versions?.filter((v) => v.status === 'draft') ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-3 py-2 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            Final Package
            <NorvaWhisper contentKey="engine.final_package" />
          </h3>
          <Badge variant="secondary" className="text-[10px]">
            {approvedVersions.length} approved
          </Badge>
        </div>
      </div>

      {/* Package items */}
      <div className="flex-1 overflow-y-auto">
        {(!versions || versions.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Package className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium">No packages yet</p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
              Generate and approve forms in the <strong>Forms</strong> tab. Once approved, they appear here in a single submission-ready queue for the IRCC portal.
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-muted/50 text-left max-w-[260px]">
              <p className="text-[10px] font-medium mb-1">Quick Start</p>
              <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li>Switch to the <strong>Forms</strong> tab</li>
                <li>Generate a form pack (e.g. IMM 5257)</li>
                <li>Review and <strong>Approve</strong> the draft</li>
                <li>Return here to download the final package</li>
              </ol>
            </div>
          </div>
        )}

        {/* Approved packs first */}
        {approvedVersions.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-emerald-950/20 dark:bg-emerald-950/10 border-b">
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400 dark:text-emerald-400">
                Approved  -  Ready to Submit
              </span>
            </div>
            {approvedVersions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                artifacts={artifacts?.filter((a) => a.pack_version_id === version.id) ?? []}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* Draft packs */}
        {draftVersions.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-muted/30 border-b">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Drafts
              </span>
            </div>
            {draftVersions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                artifacts={artifacts?.filter((a) => a.pack_version_id === version.id) ?? []}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Version Row ─────────────────────────────────────────────────────────────

function VersionRow({
  version,
  artifacts,
  onDownload,
}: {
  version: Pick<FormPackVersion, 'id' | 'pack_type' | 'version_number' | 'status' | 'validation_result' | 'created_at' | 'approved_at'>
  artifacts: Pick<FormPackArtifact, 'id' | 'pack_version_id' | 'form_code' | 'file_name' | 'file_size' | 'storage_path' | 'is_final' | 'created_at'>[]
  onDownload: (artifact: Pick<FormPackArtifact, 'storage_path' | 'file_name'>) => void
}) {
  const isApproved = version.status === 'approved'
  const validation = version.validation_result
  const hasWarnings = validation && validation.warnings.length > 0

  return (
    <div className="border-b">
      {/* Version header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isApproved ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-none" />
        ) : (
          <Clock className="h-4 w-4 text-amber-500 flex-none" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">
            {version.pack_type} v{version.version_number}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isApproved ? 'Approved' : 'Draft'}  -  {new Date(version.created_at).toLocaleDateString()}
          </p>
        </div>
        {hasWarnings && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-none" />
        )}
      </div>

      {/* Artifact files */}
      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="flex items-center gap-2 px-3 py-1.5 pl-9 bg-muted/20 group"
        >
          <FileText className="h-3.5 w-3.5 text-muted-foreground flex-none" />
          <span className="text-[11px] flex-1 truncate">{artifact.file_name}</span>
          {artifact.file_size && (
            <span className="text-[10px] text-muted-foreground">
              {(artifact.file_size / 1024).toFixed(0)} KB
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDownload(artifact)}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
