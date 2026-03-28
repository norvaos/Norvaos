'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, ExternalLink, Globe, HelpCircle, Key, Loader2, Plus, Printer, QrCode, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'react-qr-code'
import { useTenant } from '@/lib/hooks/use-tenant'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KioskQuestionsSettings } from '@/components/kiosk/kiosk-questions-settings'
import { PORTAL_LOCALES, type PortalLocale } from '@/lib/utils/portal-translations'
import type { KioskQuestion } from '@/lib/types/kiosk-question'

interface KioskToken {
  id: string
  token: string
  expires_at: string
  is_active: boolean
  last_accessed_at: string | null
  access_count: number | null
  created_at: string
}

interface KioskConfig {
  logo_url?: string
  primary_color?: string
  welcome_message?: string
  inactivity_timeout?: number
  data_safety_notice?: string
  enable_id_scan?: boolean
  enable_identity_verify?: boolean
  id_scan_retention_days?: number
  enabled_languages?: PortalLocale[]
  kiosk_questions?: KioskQuestion[]
}

function useKioskSettings() {
  return useQuery({
    queryKey: ['settings', 'kiosk'],
    queryFn: async () => {
      const res = await fetch('/api/settings/kiosk')
      if (!res.ok) throw new Error('Failed to load kiosk settings')
      return res.json() as Promise<{ config: KioskConfig; tokens: KioskToken[] }>
    },
  })
}

function useSaveKioskConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (config: KioskConfig) => {
      const res = await fetch('/api/settings/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'kiosk'] })
      toast.success('Kiosk settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })
}

function useGenerateToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateToken: true }),
      })
      if (!res.ok) throw new Error('Failed to generate token')
      return res.json() as Promise<{ token: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'kiosk'] })
      toast.success('New kiosk token generated')
    },
    onError: () => toast.error('Failed to generate token'),
  })
}

function useRevokeToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tokenId: string) => {
      const res = await fetch('/api/settings/kiosk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      })
      if (!res.ok) throw new Error('Failed to revoke')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'kiosk'] })
      toast.success('Token revoked')
    },
    onError: () => toast.error('Failed to revoke token'),
  })
}

function KioskQrDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const url = `${window.location.origin}/kiosk/${token}`

  function handlePrint() {
    const win = window.open('', '_blank', 'width=400,height=500')
    if (!win) return
    const svg = qrRef.current?.querySelector('svg')?.outerHTML ?? ''
    win.document.write(`
      <html><head><title>Kiosk QR Code</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center;
               justify-content: center; min-height: 100vh; font-family: sans-serif; }
        svg { width: 220px; height: 220px; }
        p { margin-top: 12px; font-size: 11px; color: #555; word-break: break-all;
            text-align: center; max-width: 240px; }
        h2 { margin: 0 0 16px; font-size: 15px; color: #111; }
      </style></head>
      <body><h2>Kiosk Check-In</h2>${svg}<p>${url}</p></body></html>
    `)
    win.document.close()
    win.focus()
    win.print()
    win.close()
  }

  function handleDownload() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const canvas = document.createElement('canvas')
    const size = 512
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(svgUrl)
      const a = document.createElement('a')
      a.download = `kiosk-qr-${token.slice(0, 8)}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = svgUrl
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            Kiosk QR Code
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div ref={qrRef} className="p-4 bg-white rounded-lg border border-slate-200">
            <QRCode value={url} size={200} />
          </div>
          <p className="text-xs text-slate-500 text-center break-all max-w-[240px]">{url}</p>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function KioskSettingsPage() {
  const tenant = useTenant()
  const { data, isLoading } = useKioskSettings()
  const saveMutation = useSaveKioskConfig()
  const generateMutation = useGenerateToken()
  const revokeMutation = useRevokeToken()

  const [config, setConfig] = useState<KioskConfig>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)

  // Sync loaded config to state (once)
  const [synced, setSynced] = useState(false)
  if (data?.config && !synced) {
    setConfig(data.config)
    setSynced(true)
  }

  function updateConfig(patch: Partial<KioskConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }))
    setHasChanges(true)
  }

  function handleSave() {
    saveMutation.mutate(config)
    setHasChanges(false)
  }

  function copyKioskUrl(token: string) {
    const url = `${window.location.origin}/kiosk/${token}`
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Kiosk URL copied to clipboard')
    })
  }

  function toggleLanguage(locale: PortalLocale) {
    const current = config.enabled_languages ?? ['en']
    const next = current.includes(locale)
      ? current.filter((l) => l !== locale)
      : [...current, locale]
    // Always keep English
    if (!next.includes('en')) next.unshift('en')
    updateConfig({ enabled_languages: next })
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const tokens = data?.tokens ?? []
  const enabledLangs = config.enabled_languages ?? ['en']
  const kioskQuestions = config.kiosk_questions ?? []

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-6 h-6" />
            Kiosk Setup
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure the lobby check-in kiosk for clients.
          </p>
        </div>
      </div>

      {/* Kiosk Tokens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Kiosk Tokens
              </CardTitle>
              <CardDescription>
                Generate tokens for kiosk devices. Each token lasts 1 year.
              </CardDescription>
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              size="sm"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Generate Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No kiosk tokens yet. Generate one to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-slate-600 truncate">
                        {t.token.slice(0, 8)}...{t.token.slice(-4)}
                      </code>
                      {t.is_active ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-950/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-400">
                          Revoked
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Created {new Date(t.created_at).toLocaleDateString()}
                      {t.access_count ? ` \u2022 ${t.access_count} accesses` : ''}
                      {t.last_accessed_at
                        ? ` \u2022 Last used ${new Date(t.last_accessed_at).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {t.is_active && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setQrToken(t.token)}
                          title="Show QR code"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyKioskUrl(t.token)}
                          title="Copy kiosk URL"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/kiosk/${t.token}`, '_blank')}
                          title="Open kiosk"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(t.id)}
                          disabled={revokeMutation.isPending}
                          className="text-red-500 hover:text-red-400"
                          title="Revoke token"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Languages
          </CardTitle>
          <CardDescription>
            Enable languages for the kiosk. Clients can choose their language on the welcome screen.
            English is always enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PORTAL_LOCALES.map((loc) => {
              const isEnabled = enabledLangs.includes(loc.value)
              const isEnglish = loc.value === 'en'
              return (
                <button
                  key={loc.value}
                  type="button"
                  disabled={isEnglish}
                  onClick={() => toggleLanguage(loc.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
                    isEnabled
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${isEnglish ? 'opacity-70 cursor-default' : ''}`}
                >
                  <div
                    className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${
                      isEnabled ? 'bg-slate-900 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {isEnabled && (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{loc.nativeLabel}</p>
                    <p className="text-xs text-slate-500 truncate">{loc.label}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Check-In Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            Check-In Questions
          </CardTitle>
          <CardDescription>
            Configure questions shown to clients during kiosk check-in.
            Questions support conditional visibility and multi-language translations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KioskQuestionsSettings
            questions={kioskQuestions}
            enabledLanguages={enabledLangs}
            onChange={(q) => updateConfig({ kiosk_questions: q })}
          />
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customise how the kiosk looks for your clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Welcome Message</label>
            <Input
              value={config.welcome_message ?? ''}
              onChange={(e) => updateConfig({ welcome_message: e.target.value })}
              placeholder="Welcome! Please check in for your appointment."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={config.primary_color ?? '#0f172a'}
                onChange={(e) => updateConfig({ primary_color: e.target.value })}
                className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
              />
              <Input
                value={config.primary_color ?? '#0f172a'}
                onChange={(e) => updateConfig({ primary_color: e.target.value })}
                placeholder="#0f172a"
                className="w-32"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Logo URL</label>
            <Input
              value={config.logo_url ?? ''}
              onChange={(e) => updateConfig({ logo_url: e.target.value })}
              placeholder="https://your-firm.com/logo.png"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Inactivity Timeout (seconds)</label>
            <Input
              type="number"
              value={config.inactivity_timeout ?? 120}
              onChange={(e) => updateConfig({ inactivity_timeout: parseInt(e.target.value) || 120 })}
              min={30}
              max={600}
            />
          </div>
        </CardContent>
      </Card>

      {/* Check-In Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Check-In Steps</CardTitle>
          <CardDescription>
            Control which steps are shown during the check-in flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Identity Verification (DOB)</p>
              <p className="text-xs text-slate-500">Require clients to verify their date of birth</p>
            </div>
            <Switch
              checked={config.enable_identity_verify !== false}
              onCheckedChange={(checked) => updateConfig({ enable_identity_verify: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">ID Scan</p>
              <p className="text-xs text-slate-500">Allow clients to upload a photo of their ID</p>
            </div>
            <Switch
              checked={config.enable_id_scan !== false}
              onCheckedChange={(checked) => updateConfig({ enable_id_scan: checked })}
            />
          </div>

          {config.enable_id_scan !== false && (
            <div className="space-y-2 pl-4 border-l-2 border-slate-100">
              <label className="text-sm font-medium text-slate-700">
                ID Scan Retention (days)
              </label>
              <Input
                type="number"
                value={config.id_scan_retention_days ?? 90}
                onChange={(e) => updateConfig({ id_scan_retention_days: parseInt(e.target.value) || 90 })}
                min={7}
                max={365}
              />
              <p className="text-xs text-slate-500">
                ID scans will be automatically deleted after this period.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Safety Notice */}
      <Card>
        <CardHeader>
          <CardTitle>Data Safety Notice</CardTitle>
          <CardDescription>
            Custom notice shown to clients before ID scan upload.
            Leave blank for the default notice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.data_safety_notice ?? ''}
            onChange={(e) => updateConfig({ data_safety_notice: e.target.value })}
            placeholder="Leave blank to use the default data safety notice."
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Save button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="shadow-lg"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Save Changes
          </Button>
        </div>
      )}

      {qrToken && <KioskQrDialog token={qrToken} onClose={() => setQrToken(null)} />}
    </div>
  )
}
