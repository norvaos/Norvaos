'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Settings2, Tablet, Monitor, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ─── Types ──────────────────────────────────────────────────────────

interface KioskConfig {
  steps: {
    appointment_lookup: boolean
    identity_verify: boolean
    id_scan: boolean
  }
  branding: {
    welcome_message: string
    logo_url?: string
    primary_color: string
    background_color: string
  }
  data_safety_notice: string
  inactivity_timeout_seconds: number
  confirmation_display_seconds: number
  id_scan_retention_days: number
  max_check_ins_per_hour: number
}

interface FrontDeskConfig {
  available_actions: {
    mark_contacted: boolean
    log_call: boolean
    send_follow_up: boolean
    mark_no_answer: boolean
    schedule_consultation: boolean
  }
  auto_follow_up_threshold: number
  show_check_in_queue: boolean
  show_call_log: boolean
  visible_lead_statuses: string[]
  field_overrides: {
    call_notes_min_length: number
    follow_up_message_min_length: number
  }
}

// ─── Hook ───────────────────────────────────────────────────────────

function useWorkflowConfig() {
  return useQuery({
    queryKey: ['admin', 'workflow-config'],
    queryFn: async () => {
      const res = await fetch('/api/settings/workflow-config')
      if (!res.ok) throw new Error('Failed to load config')
      return res.json() as Promise<{
        kiosk_config: Partial<KioskConfig>
        front_desk_config: Partial<FrontDeskConfig>
        feature_flags: Record<string, boolean>
      }>
    },
  })
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_KIOSK: KioskConfig = {
  steps: { appointment_lookup: true, identity_verify: true, id_scan: true },
  branding: {
    welcome_message: 'Welcome! Please check in for your appointment.',
    primary_color: '#1e293b',
    background_color: '#f8fafc',
  },
  data_safety_notice: 'Your ID will be scanned for verification purposes only. The scan will be stored securely and automatically deleted after 90 days.',
  inactivity_timeout_seconds: 120,
  confirmation_display_seconds: 15,
  id_scan_retention_days: 90,
  max_check_ins_per_hour: 30,
}

const DEFAULT_FRONT_DESK: FrontDeskConfig = {
  available_actions: {
    mark_contacted: true,
    log_call: true,
    send_follow_up: true,
    mark_no_answer: true,
    schedule_consultation: true,
  },
  auto_follow_up_threshold: 3,
  show_check_in_queue: true,
  show_call_log: true,
  visible_lead_statuses: ['new', 'contacted', 'qualified', 'proposal'],
  field_overrides: {
    call_notes_min_length: 10,
    follow_up_message_min_length: 10,
  },
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Admin Workflow Configuration  -  controls kiosk and front desk surfaces.
 *
 * Storage: tenants.settings.kiosk_config and tenants.settings.front_desk_config JSONB fields.
 * Rule #18: Feature flags hide surfaces, never bypass server checks.
 */
export default function WorkflowConfigPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useWorkflowConfig()

  const [kioskConfig, setKioskConfig] = useState<KioskConfig>(DEFAULT_KIOSK)
  const [frontDeskConfig, setFrontDeskConfig] = useState<FrontDeskConfig>(DEFAULT_FRONT_DESK)

  // Sync from server data
  useEffect(() => {
    if (data) {
      setKioskConfig({ ...DEFAULT_KIOSK, ...data.kiosk_config, steps: { ...DEFAULT_KIOSK.steps, ...data.kiosk_config?.steps }, branding: { ...DEFAULT_KIOSK.branding, ...data.kiosk_config?.branding }, field_overrides: undefined } as unknown as KioskConfig)
      setFrontDeskConfig({
        ...DEFAULT_FRONT_DESK,
        ...data.front_desk_config,
        available_actions: { ...DEFAULT_FRONT_DESK.available_actions, ...data.front_desk_config?.available_actions },
        field_overrides: { ...DEFAULT_FRONT_DESK.field_overrides, ...data.front_desk_config?.field_overrides },
      })
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (payload: { kiosk_config?: KioskConfig; front_desk_config?: FrontDeskConfig }) => {
      const res = await fetch('/api/settings/workflow-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to save')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Configuration saved successfully')
      queryClient.invalidateQueries({ queryKey: ['admin', 'workflow-config'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function saveKiosk() {
    saveMutation.mutate({ kiosk_config: kioskConfig })
  }

  function saveFrontDesk() {
    saveMutation.mutate({ front_desk_config: frontDeskConfig })
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings2 className="w-6 h-6" />
          Workflow Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure what your kiosk and front desk surfaces display and which actions are available.
        </p>
      </div>

      <Tabs defaultValue="kiosk">
        <TabsList>
          <TabsTrigger value="kiosk" className="gap-1.5">
            <Tablet className="w-4 h-4" />
            Kiosk
          </TabsTrigger>
          <TabsTrigger value="front-desk" className="gap-1.5">
            <Monitor className="w-4 h-4" />
            Front Desk
          </TabsTrigger>
        </TabsList>

        {/* ── Kiosk Configuration ──────────────────────────────────── */}
        <TabsContent value="kiosk" className="space-y-6 mt-4">
          {/* Check-In Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check-In Steps</CardTitle>
              <CardDescription>
                Toggle which steps are shown during the kiosk check-in flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow
                label="Appointment Lookup"
                description="Allow clients to search for their appointment"
                checked={kioskConfig.steps.appointment_lookup}
                onCheckedChange={(v) => setKioskConfig((c) => ({ ...c, steps: { ...c.steps, appointment_lookup: v } }))}
              />
              <SwitchRow
                label="Identity Verification"
                description="Require date of birth verification for returning clients"
                checked={kioskConfig.steps.identity_verify}
                onCheckedChange={(v) => setKioskConfig((c) => ({ ...c, steps: { ...c.steps, identity_verify: v } }))}
              />
              <SwitchRow
                label="ID Scan"
                description="Allow clients to upload or scan their ID document"
                checked={kioskConfig.steps.id_scan}
                onCheckedChange={(v) => setKioskConfig((c) => ({ ...c, steps: { ...c.steps, id_scan: v } }))}
              />
            </CardContent>
          </Card>

          {/* Branding */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>
                Customize the kiosk appearance for your firm.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Welcome Message</Label>
                <Input
                  value={kioskConfig.branding.welcome_message}
                  onChange={(e) => setKioskConfig((c) => ({ ...c, branding: { ...c.branding, welcome_message: e.target.value } }))}
                  maxLength={200}
                  className="text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={kioskConfig.branding.primary_color}
                      onChange={(e) => setKioskConfig((c) => ({ ...c, branding: { ...c.branding, primary_color: e.target.value } }))}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      value={kioskConfig.branding.primary_color}
                      onChange={(e) => setKioskConfig((c) => ({ ...c, branding: { ...c.branding, primary_color: e.target.value } }))}
                      className="text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={kioskConfig.branding.background_color}
                      onChange={(e) => setKioskConfig((c) => ({ ...c, branding: { ...c.branding, background_color: e.target.value } }))}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      value={kioskConfig.branding.background_color}
                      onChange={(e) => setKioskConfig((c) => ({ ...c, branding: { ...c.branding, background_color: e.target.value } }))}
                      className="text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Safety & Retention */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Safety & Retention</CardTitle>
              <CardDescription>
                Control data handling and retention for ID scans.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Data Safety Notice</Label>
                <Textarea
                  value={kioskConfig.data_safety_notice}
                  onChange={(e) => setKioskConfig((c) => ({ ...c, data_safety_notice: e.target.value }))}
                  maxLength={1000}
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-slate-400">
                  Shown to clients before ID scan. {kioskConfig.data_safety_notice.length}/1000 characters.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">ID Scan Retention (days)</Label>
                  <Input
                    type="number"
                    value={kioskConfig.id_scan_retention_days}
                    onChange={(e) => setKioskConfig((c) => ({ ...c, id_scan_retention_days: Number(e.target.value) || 90 }))}
                    min={1}
                    max={365}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Inactivity Timeout (sec)</Label>
                  <Input
                    type="number"
                    value={kioskConfig.inactivity_timeout_seconds}
                    onChange={(e) => setKioskConfig((c) => ({ ...c, inactivity_timeout_seconds: Number(e.target.value) || 120 }))}
                    min={30}
                    max={600}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Max Check-ins/Hour</Label>
                  <Input
                    type="number"
                    value={kioskConfig.max_check_ins_per_hour}
                    onChange={(e) => setKioskConfig((c) => ({ ...c, max_check_ins_per_hour: Number(e.target.value) || 30 }))}
                    min={1}
                    max={100}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveKiosk} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Kiosk Configuration
            </Button>
          </div>
        </TabsContent>

        {/* ── Front Desk Configuration ─────────────────────────────── */}
        <TabsContent value="front-desk" className="space-y-6 mt-4">
          {/* Available Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Available Actions</CardTitle>
              <CardDescription>
                Toggle which action buttons are available in Front Desk mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchRow
                label="Mark as Contacted"
                description="Log a successful contact attempt"
                checked={frontDeskConfig.available_actions.mark_contacted}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, available_actions: { ...c.available_actions, mark_contacted: v } }))}
              />
              <SwitchRow
                label="Log Call"
                description="Record inbound/outbound call details"
                checked={frontDeskConfig.available_actions.log_call}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, available_actions: { ...c.available_actions, log_call: v } }))}
              />
              <SwitchRow
                label="Send Follow-Up"
                description="Send email or SMS follow-up message"
                checked={frontDeskConfig.available_actions.send_follow_up}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, available_actions: { ...c.available_actions, send_follow_up: v } }))}
              />
              <SwitchRow
                label="Mark No Answer"
                description="Auto-increment follow-up count on unanswered calls"
                checked={frontDeskConfig.available_actions.mark_no_answer}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, available_actions: { ...c.available_actions, mark_no_answer: v } }))}
              />
              <SwitchRow
                label="Schedule Consultation"
                description="Book a consultation directly from front desk"
                checked={frontDeskConfig.available_actions.schedule_consultation}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, available_actions: { ...c.available_actions, schedule_consultation: v } }))}
              />
            </CardContent>
          </Card>

          {/* Auto Follow-Up & Visibility */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation & Visibility</CardTitle>
              <CardDescription>
                Configure automated behaviors and what is visible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Auto Follow-Up After (attempts)</Label>
                  <Input
                    type="number"
                    value={frontDeskConfig.auto_follow_up_threshold}
                    onChange={(e) => setFrontDeskConfig((c) => ({ ...c, auto_follow_up_threshold: Number(e.target.value) || 3 }))}
                    min={1}
                    max={10}
                    className="text-sm"
                  />
                  <p className="text-xs text-slate-400">
                    Trigger auto follow-up after this many failed contact attempts.
                  </p>
                </div>
              </div>

              <Separator />

              <SwitchRow
                label="Show Check-In Queue"
                description="Display the kiosk check-in queue on the front desk dashboard"
                checked={frontDeskConfig.show_check_in_queue}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, show_check_in_queue: v }))}
              />
              <SwitchRow
                label="Show Call Log"
                description="Display the call log page in the front desk navigation"
                checked={frontDeskConfig.show_call_log}
                onCheckedChange={(v) => setFrontDeskConfig((c) => ({ ...c, show_call_log: v }))}
              />
            </CardContent>
          </Card>

          {/* Required Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Required Field Overrides</CardTitle>
              <CardDescription>
                Extend the default minimum field requirements for actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Call Notes Min Length</Label>
                  <Input
                    type="number"
                    value={frontDeskConfig.field_overrides.call_notes_min_length}
                    onChange={(e) => setFrontDeskConfig((c) => ({ ...c, field_overrides: { ...c.field_overrides, call_notes_min_length: Number(e.target.value) || 10 } }))}
                    min={0}
                    max={500}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Follow-Up Message Min Length</Label>
                  <Input
                    type="number"
                    value={frontDeskConfig.field_overrides.follow_up_message_min_length}
                    onChange={(e) => setFrontDeskConfig((c) => ({ ...c, field_overrides: { ...c.field_overrides, follow_up_message_min_length: Number(e.target.value) || 10 } }))}
                    min={0}
                    max={500}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveFrontDesk} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Front Desk Configuration
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Utility Components ─────────────────────────────────────────────

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
