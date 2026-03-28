'use client'

/**
 * Directive 033: Sovereign Brand Identity  -  Settings Page
 *
 * Split-pane WYSIWYG experience:
 *   Left Panel:  Control Centre (logo upload, signature upload, layout picker, colours)
 *   Right Panel: Live A4 Canvas preview of the letterhead
 *
 * The Lawyer uploads their assets once → NorvaOS auto-injects branding
 * onto every document (invoice, retainer, cover letter).
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Upload, Image, Pen, Sparkles, CheckCircle2, FolderTree, FileText, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { norvaToast } from '@/lib/utils/norva-branding'
import { generateFilingPreview, type FilingConvention } from '@/lib/services/sovereign-storage-engine'

// ── Types ────────────────────────────────────────────────────────────────────

interface BrandData {
  name: string
  logo_url: string | null
  signature_url: string | null
  letterhead_layout: 'classic' | 'modern' | 'minimal' | null
  legal_disclaimer: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  brand_activated_at: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  office_phone: string | null
  office_fax: string | null
  filing_convention: FilingConvention | null
  logoPublicUrl: string | null
  signaturePublicUrl: string | null
}

type LetterheadLayout = 'classic' | 'modern' | 'minimal'

// ── Data Hook ────────────────────────────────────────────────────────────────

function useBrandData() {
  return useQuery<BrandData>({
    queryKey: ['settings', 'brand'],
    queryFn: async () => {
      const res = await fetch('/api/settings/brand')
      if (!res.ok) throw new Error('Failed to load brand data')
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Page Component ──────────��────────────────────────────────────────────────

export default function BrandIdentityPage() {
  const { data: brand, isLoading } = useBrandData()
  const queryClient = useQueryClient()

  // Local state for live preview
  const [layout, setLayout] = useState<LetterheadLayout>('classic')
  const [disclaimer, setDisclaimer] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1a3b65')
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'logo' | 'signature' | null>(null)
  const [filingConvention, setFilingConvention] = useState<FilingConvention>('professional')

  const logoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)

  // Sync from server data
  useEffect(() => {
    if (brand) {
      setLayout(brand.letterhead_layout || 'classic')
      setDisclaimer(brand.legal_disclaimer || '')
      setPrimaryColor(brand.primary_color || '#1a3b65')
      setLogoPreviewUrl(brand.logoPublicUrl)
      setSignaturePreviewUrl(brand.signaturePublicUrl)
      setFilingConvention(brand.filing_convention || 'professional')
    }
  }, [brand])

  // ── Filing Preview (Directive 040) ─────────────────────────────────────
  const filingPreview = useMemo(
    () => generateFilingPreview('2026-WASEER-001', 'Ahmed Khan', filingConvention),
    [filingConvention],
  )

  // ── Mutations ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterhead_layout: layout,
          legal_disclaimer: disclaimer || null,
          primary_color: primaryColor,
          filing_convention: filingConvention,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'brand'] })
      norvaToast('brand_saved')
    },
  })

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      })
      if (!res.ok) throw new Error('Failed to activate')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'brand'] })
      norvaToast('brand_activated')
    },
  })

  // ── File Upload ──────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (assetType: 'logo' | 'signature', file: File) => {
      if (file.size > 2 * 1024 * 1024) {
        norvaToast('file_too_large')
        return
      }

      setUploading(assetType)
      try {
        const formData = new FormData()
        formData.append('action', `upload-${assetType}`)
        formData.append('file', file)

        const res = await fetch('/api/settings/brand', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')
        const { publicUrl } = await res.json()

        if (assetType === 'logo') setLogoPreviewUrl(publicUrl)
        else setSignaturePreviewUrl(publicUrl)

        queryClient.invalidateQueries({ queryKey: ['settings', 'brand'] })
      } catch {
        norvaToast('upload_failed')
      } finally {
        setUploading(null)
      }
    },
    [queryClient],
  )

  const handleDrop = useCallback(
    (assetType: 'logo' | 'signature') => (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFileUpload(assetType, file)
    },
    [handleFileUpload],
  )

  const handleFileInputChange = useCallback(
    (assetType: 'logo' | 'signature') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileUpload(assetType, file)
    },
    [handleFileUpload],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isActivated = !!brand?.brand_activated_at

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sovereign Brand Identity</h1>
          <p className="text-muted-foreground">
            Upload your logo and signature once  -  NorvaOS applies them to every document automatically.
          </p>
        </div>
        {isActivated && (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Brand Active
          </Badge>
        )}
      </div>

      {/* Split-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left Panel: Control Centre ────────────────────────── */}
        <div className="space-y-4">
          {/* Logo Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Image className="h-4 w-4" />
                Firm Logo
              </CardTitle>
              <CardDescription>SVG or PNG preferred. Max 2MB.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop('logo')}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => logoInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  'hover:border-primary/50 hover:bg-primary/5',
                  uploading === 'logo' && 'opacity-50 pointer-events-none',
                )}
              >
                {logoPreviewUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoPreviewUrl}
                      alt="Firm Logo"
                      className="max-h-16 max-w-[200px] object-contain"
                    />
                    <p className="text-xs text-muted-foreground">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {uploading === 'logo' ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    )}
                    <p className="text-sm text-muted-foreground">
                      Drag your Logo here, or click to browse
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleFileInputChange('logo')}
              />
            </CardContent>
          </Card>

          {/* Signature Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Pen className="h-4 w-4" />
                Digital Signature
              </CardTitle>
              <CardDescription>Transparent PNG of the Principal Lawyer&apos;s signature.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop('signature')}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => signatureInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
                  'hover:border-primary/50 hover:bg-primary/5',
                  uploading === 'signature' && 'opacity-50 pointer-events-none',
                )}
              >
                {signaturePreviewUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signaturePreviewUrl}
                      alt="Signature"
                      className="max-h-12 max-w-[180px] object-contain"
                    />
                    <p className="text-xs text-muted-foreground">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {uploading === 'signature' ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <Pen className="h-6 w-6 text-muted-foreground" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Drop signature PNG here
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={handleFileInputChange('signature')}
              />
            </CardContent>
          </Card>

          {/* Layout Preset */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Prestige Layout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={layout} onValueChange={(v) => setLayout(v as LetterheadLayout)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic  -  Logo left, name right</SelectItem>
                  <SelectItem value="modern">Modern  -  Logo centred, name below</SelectItem>
                  <SelectItem value="minimal">Minimal  -  Text only, no logo</SelectItem>
                </SelectContent>
              </Select>

              <div className="space-y-2">
                <Label className="text-xs">Primary Accent Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-8 w-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#1a3b65"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Legal Disclaimer (footer)</Label>
                <Textarea
                  value={disclaimer}
                  onChange={(e) => setDisclaimer(e.target.value)}
                  placeholder="This document is confidential and intended only for the named recipient..."
                  rows={3}
                  className="text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              variant="outline"
              className="flex-1"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending || isActivated}
              className={cn(
                'flex-1 transition-all',
                !isActivated &&
                  'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white',
              )}
            >
              {activateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isActivated ? 'Brand Active' : 'Activate Brand Identity'}
            </Button>
          </div>
        </div>

        {/* ── Right Panel: Live A4 Canvas Preview ──────────────── */}
        <Card className="lg:sticky lg:top-20 h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live Letterhead Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-md border shadow-sm overflow-hidden">
              {/* A4 proportional preview (595:842 ≈ 1:1.414) */}
              <div
                className="relative mx-auto"
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  aspectRatio: '595 / 842',
                  padding: '24px',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {/* Header Preview */}
                <LetterheadPreview
                  layout={layout}
                  firmName={brand?.name || 'Your Firm Name'}
                  address={buildAddress(brand)}
                  phone={brand?.office_phone || null}
                  logoUrl={logoPreviewUrl}
                  primaryColor={primaryColor}
                />

                {/* Emerald accent line */}
                <div
                  className="mt-3 mb-1"
                  style={{ height: '2px', background: '#339966' }}
                />
                <div
                  className="mb-4"
                  style={{ height: '0.5px', background: '#b0b0b0' }}
                />

                {/* Placeholder content */}
                <div className="space-y-2">
                  <div className="h-2 bg-gray-200 rounded w-1/3" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-5/6" />
                  <div className="h-4" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-4/5" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-2/3" />
                  <div className="h-6" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-5/6" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                </div>

                {/* Signature Preview */}
                {signaturePreviewUrl && (
                  <div className="absolute bottom-20 right-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signaturePreviewUrl}
                      alt="Signature preview"
                      className="max-h-8 max-w-[100px] object-contain opacity-70"
                    />
                    <div className="border-t border-gray-300 mt-1 w-[100px]" />
                    <p className="text-[6px] text-gray-400 mt-0.5">Principal Lawyer</p>
                  </div>
                )}

                {/* Footer Preview */}
                <div className="absolute bottom-4 left-6 right-6 text-center">
                  {disclaimer && (
                    <p className="text-[5px] text-gray-300 mb-1 leading-tight">
                      {disclaimer}
                    </p>
                  )}
                  <p className="text-[6px] text-gray-300">
                    Generated by NorvaOS  -  {brand?.name || 'Your Firm Name'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Directive 040: Filing Preview Card ──────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Sovereign Auto-Filer Preview
          </CardTitle>
          <CardDescription>
            Choose how NorvaOS auto-names and organises uploaded documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">Filing Convention</Label>
            <Select
              value={filingConvention}
              onValueChange={(v) => setFilingConvention(v as FilingConvention)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional  -  By category folders</SelectItem>
                <SelectItem value="chronological">Chronological  -  By date</SelectItem>
                <SelectItem value="flat">Flat  -  All in one folder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium mb-3">
              Sample matter: 2026-WASEER-001 (Ahmed Khan)
            </p>
            {filingPreview.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs font-mono bg-background rounded px-3 py-1.5 border"
              >
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground truncate">{item.originalName}</span>
                <ArrowRight className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-emerald-400 dark:text-emerald-400 truncate font-medium">
                  {item.filedPath}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Slot-based uploads use the existing auto-rename pattern. This convention applies to ad-hoc (non-slot) uploads only.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Letterhead Preview Component ────��────────────────────────────────────────

function LetterheadPreview({
  layout,
  firmName,
  address,
  phone,
  logoUrl,
  primaryColor,
}: {
  layout: LetterheadLayout
  firmName: string
  address: string | null
  phone: string | null
  logoUrl: string | null
  primaryColor: string
}) {
  if (layout === 'modern') {
    return (
      <div className="text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo"
            className="max-h-10 max-w-[120px] object-contain mx-auto mb-2"
          />
        )}
        <h1 className="font-bold text-sm" style={{ color: primaryColor }}>
          {firmName}
        </h1>
        {address && (
          <p className="text-[7px] text-gray-400 mt-0.5 whitespace-pre-line">{address}</p>
        )}
        {phone && <p className="text-[6px] text-gray-400">{phone}</p>}
      </div>
    )
  }

  if (layout === 'minimal') {
    return (
      <div>
        <h1 className="font-bold text-sm" style={{ color: primaryColor }}>
          {firmName}
        </h1>
        {address && (
          <p className="text-[7px] text-gray-400 mt-0.5 whitespace-pre-line">{address}</p>
        )}
      </div>
    )
  }

  // Classic (default)
  return (
    <div className="flex items-start gap-3">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Logo"
          className="max-h-10 max-w-[80px] object-contain shrink-0"
        />
      )}
      <div>
        <h1 className="font-bold text-sm" style={{ color: primaryColor }}>
          {firmName}
        </h1>
        {address && (
          <p className="text-[7px] text-gray-400 mt-0.5 whitespace-pre-line">{address}</p>
        )}
        {phone && <p className="text-[6px] text-gray-400">{phone}</p>}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAddress(brand: BrandData | undefined): string | null {
  if (!brand) return null
  const parts: string[] = []
  if (brand.address_line1) parts.push(brand.address_line1)
  if (brand.address_line2) parts.push(brand.address_line2)
  const cityParts: string[] = []
  if (brand.city) cityParts.push(brand.city)
  if (brand.province) cityParts.push(brand.province)
  if (cityParts.length > 0) {
    parts.push(
      brand.postal_code
        ? `${cityParts.join(', ')}  ${brand.postal_code}`
        : cityParts.join(', '),
    )
  }
  return parts.length > 0 ? parts.join('\n') : null
}
