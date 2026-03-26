'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, MonitorSmartphone, LayoutGrid, Zap, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

// ─── Types ──────────────────────────────────────────────────────────────────

interface FrontDeskConfig {
  // Zone visibility
  show_schedule: boolean
  show_tasks: boolean
  show_check_ins: boolean
  show_quick_create: boolean
  show_stats_bar: boolean
  // Action group visibility
  show_action_appointments: boolean
  show_action_tasks: boolean
  show_action_documents: boolean
  show_action_walk_in: boolean
  // Operational config
  rooms: string[]
  languages: string[]
  sources: string[]
  free_text_follow_up: boolean
  override_booking_permission: boolean
  new_leads_require_id_scan: boolean
}

const DEFAULT_CONFIG: FrontDeskConfig = {
  show_schedule: true,
  show_tasks: true,
  show_check_ins: true,
  show_quick_create: true,
  show_stats_bar: true,
  show_action_appointments: true,
  show_action_tasks: true,
  show_action_documents: true,
  show_action_walk_in: true,
  rooms: [],
  languages: ['English', 'French'],
  sources: ['Walk-in', 'Phone', 'Website', 'Referral', 'Other'],
  free_text_follow_up: false,
  override_booking_permission: false,
  new_leads_require_id_scan: false,
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

function useFrontDeskSettings() {
  return useQuery({
    queryKey: ['settings', 'front-desk'],
    queryFn: async () => {
      const res = await fetch('/api/settings/front-desk')
      if (!res.ok) throw new Error('Failed to load front desk settings')
      return res.json() as Promise<{ config: Partial<FrontDeskConfig> }>
    },
  })
}

function useSaveFrontDeskConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (config: FrontDeskConfig) => {
      const res = await fetch('/api/settings/front-desk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'front-desk'] })
      queryClient.invalidateQueries({ queryKey: ['front-desk', 'config'] })
      toast.success('Front desk settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })
}

// ─── List Editor ────────────────────────────────────────────────────────────

function ListEditor({
  label,
  description,
  items,
  onChange,
  placeholder,
}: {
  label: string
  description: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
}) {
  const [newItem, setNewItem] = useState('')

  function addItem() {
    const trimmed = newItem.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed])
    setNewItem('')
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={item} variant="secondary" className="gap-1 pl-2.5 pr-1.5 py-1">
            {item}
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="ml-0.5 rounded-full hover:bg-slate-300 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={addItem} disabled={!newItem.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FrontDeskSettingsPage() {
  const { data, isLoading } = useFrontDeskSettings()
  const saveMutation = useSaveFrontDeskConfig()

  const [config, setConfig] = useState<FrontDeskConfig>(DEFAULT_CONFIG)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync loaded config to state (once)
  const [synced, setSynced] = useState(false)
  if (data?.config && !synced) {
    setConfig({ ...DEFAULT_CONFIG, ...data.config })
    setSynced(true)
  }

  function updateConfig(patch: Partial<FrontDeskConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }))
    setHasChanges(true)
  }

  function handleSave() {
    saveMutation.mutate(config)
    setHasChanges(false)
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

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MonitorSmartphone className="w-6 h-6" />
          Front Desk Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure which zones and actions are available on the front desk console.
        </p>
      </div>

      {/* Zone Visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            Dashboard Zones
          </CardTitle>
          <CardDescription>
            Show or hide sections of the front desk home screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            { key: 'show_stats_bar' as const, label: 'Stats Bar', desc: 'Quick stats strip at the top (appointments, check-ins, walk-ins)' },
            { key: 'show_schedule' as const, label: 'Today\'s Schedule', desc: 'Appointment calendar grouped by staff with check-in/notify actions' },
            { key: 'show_tasks' as const, label: 'Tasks Queue', desc: 'Live task list for front desk staff with completion tracking' },
            { key: 'show_check_ins' as const, label: 'Kiosk Check-Ins', desc: 'Real-time check-in queue from kiosk with wait-time indicators' },
            { key: 'show_quick_create' as const, label: 'Quick Create', desc: 'New lead / new contact intake wizard' },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
              <Switch
                checked={config[key] !== false}
                onCheckedChange={(checked) => updateConfig({ [key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action Visibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Contact Actions
          </CardTitle>
          <CardDescription>
            Show or hide action button groups in the contact work panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            { key: 'show_action_appointments' as const, label: 'Appointment Actions', desc: 'Book, reschedule, cancel/no-show, and check-in buttons' },
            { key: 'show_action_tasks' as const, label: 'Task Actions', desc: 'Create and complete task buttons' },
            { key: 'show_action_documents' as const, label: 'Norva Document Bridge', desc: 'Upload document button' },
            { key: 'show_action_walk_in' as const, label: 'New Walk-In', desc: 'Quick create walk-in intake button' },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
              <Switch
                checked={config[key] !== false}
                onCheckedChange={(checked) => updateConfig({ [key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Operational Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Operational Settings</CardTitle>
          <CardDescription>
            Configure operational rules for the front desk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Require ID Scan for New Leads</p>
              <p className="text-xs text-slate-500">New lead intake will prompt for ID document upload</p>
            </div>
            <Switch
              checked={config.new_leads_require_id_scan}
              onCheckedChange={(checked) => updateConfig({ new_leads_require_id_scan: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Allow Free-Text Follow-Up</p>
              <p className="text-xs text-slate-500">Let front desk write custom follow-up messages (vs template-only)</p>
            </div>
            <Switch
              checked={config.free_text_follow_up}
              onCheckedChange={(checked) => updateConfig({ free_text_follow_up: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Allow Booking Override</p>
              <p className="text-xs text-slate-500">Permit front desk to override booking conflicts with reason</p>
            </div>
            <Switch
              checked={config.override_booking_permission}
              onCheckedChange={(checked) => updateConfig({ override_booking_permission: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lists: Rooms, Languages, Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Lists &amp; Options</CardTitle>
          <CardDescription>
            Manage dropdown options used throughout the front desk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ListEditor
            label="Meeting Rooms"
            description="Room options shown when assigning a check-in to a room."
            items={config.rooms}
            onChange={(rooms) => updateConfig({ rooms })}
            placeholder="e.g. Room 1, Boardroom A..."
          />

          <ListEditor
            label="Languages"
            description="Language options shown in the intake form."
            items={config.languages}
            onChange={(languages) => updateConfig({ languages })}
            placeholder="e.g. Spanish, Mandarin..."
          />

          <ListEditor
            label="Referral Sources"
            description="'How did you hear about us' options for new intakes."
            items={config.sources}
            onChange={(sources) => updateConfig({ sources })}
            placeholder="e.g. Social Media, Court..."
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
    </div>
  )
}
