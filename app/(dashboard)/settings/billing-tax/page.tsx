'use client'

import { useState } from 'react'
import { useTaxProfiles, useTaxJurisdictions, useCreateTaxProfile, useCreateTaxCode } from '@/lib/queries/tax-profiles'
import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewProfileForm {
  name: string
  jurisdictionId: string
}

interface NewCodeForm {
  label: string
  rate: string
  isDefault: boolean
}

// ── Page Content ──────────────────────────────────────────────────────────────

function BillingTaxContent() {
  const { tenant } = useTenant()
  const { data: profiles, isLoading } = useTaxProfiles(tenant?.id ?? '')
  const { data: jurisdictions } = useTaxJurisdictions()
  const createProfile = useCreateTaxProfile()
  const createCode = useCreateTaxCode()

  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null)
  const [showNewProfile, setShowNewProfile] = useState(false)
  const [newProfileForm, setNewProfileForm] = useState<NewProfileForm>({ name: '', jurisdictionId: '' })

  const [addCodeProfileId, setAddCodeProfileId] = useState<string | null>(null)
  const [newCodeForm, setNewCodeForm] = useState<NewCodeForm>({ label: '', rate: '', isDefault: false })

  const handleCreateProfile = async () => {
    if (!tenant?.id || !newProfileForm.name.trim()) return
    await createProfile.mutateAsync({
      tenantId: tenant.id,
      name: newProfileForm.name.trim(),
      jurisdictionId: newProfileForm.jurisdictionId || null,
    })
    setShowNewProfile(false)
    setNewProfileForm({ name: '', jurisdictionId: '' })
  }

  const handleCreateCode = async () => {
    if (!addCodeProfileId || !newCodeForm.label.trim() || !newCodeForm.rate) return
    const rateNum = parseFloat(newCodeForm.rate) / 100
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) return

    await createCode.mutateAsync({
      taxProfileId: addCodeProfileId,
      label: newCodeForm.label.trim(),
      rate: rateNum,
      isDefault: newCodeForm.isDefault,
    })
    setAddCodeProfileId(null)
    setNewCodeForm({ label: '', rate: '', isDefault: false })
  }

  if (!tenant) return null

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tax Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Configure tax profiles and codes for your invoices.
          </p>
        </div>
        <Button onClick={() => setShowNewProfile(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Profile
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !profiles?.length ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground text-sm py-12">
            No tax profiles configured. Create one to enable tax on invoices.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader
                className="py-3 px-4 cursor-pointer"
                onClick={() =>
                  setExpandedProfileId(expandedProfileId === profile.id ? null : profile.id)
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedProfileId === profile.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-sm font-medium">{profile.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {profile.tax_codes?.length ?? 0} codes
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              {expandedProfileId === profile.id && (
                <CardContent className="pt-0 pb-4 px-4">
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1.5 text-left font-medium">Label</th>
                        <th className="py-1.5 text-right font-medium">Rate</th>
                        <th className="py-1.5 text-right font-medium">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profile.tax_codes ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-muted-foreground">
                            No tax codes yet.
                          </td>
                        </tr>
                      ) : (
                        (profile.tax_codes ?? []).map((code) => (
                          <tr key={code.id} className="border-b last:border-0">
                            <td className="py-1.5">{code.label}</td>
                            <td className="py-1.5 text-right">
                              {(code.rate * 100).toFixed(3).replace(/\.?0+$/, '')}%
                            </td>
                            <td className="py-1.5 text-right">
                              {code.is_default ? (
                                <Badge variant="default" className="text-xs">Default</Badge>
                              ) : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddCodeProfileId(profile.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Tax Code
                  </Button>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* New Profile Dialog */}
      <Dialog open={showNewProfile} onOpenChange={setShowNewProfile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Tax Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Profile Name</Label>
              <Input
                value={newProfileForm.name}
                onChange={(e) => setNewProfileForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ontario HST, BC GST+PST"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jurisdiction (optional)</Label>
              <Select
                value={newProfileForm.jurisdictionId}
                onValueChange={(v) => setNewProfileForm((f) => ({ ...f, jurisdictionId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select jurisdiction…" />
                </SelectTrigger>
                <SelectContent>
                  {(jurisdictions ?? []).map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.name} ({j.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProfile(false)}>Cancel</Button>
            <Button
              disabled={!newProfileForm.name.trim() || createProfile.isPending}
              onClick={handleCreateProfile}
            >
              {createProfile.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tax Code Dialog */}
      <Dialog open={!!addCodeProfileId} onOpenChange={(o) => !o && setAddCodeProfileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tax Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={newCodeForm.label}
                onChange={(e) => setNewCodeForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. HST 13%, GST 5%"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate (%)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                max="100"
                value={newCodeForm.rate}
                onChange={(e) => setNewCodeForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="e.g. 13 for 13%"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-default"
                checked={newCodeForm.isDefault}
                onChange={(e) => setNewCodeForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="is-default" className="cursor-pointer">Set as default for this profile</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCodeProfileId(null)}>Cancel</Button>
            <Button
              disabled={!newCodeForm.label.trim() || !newCodeForm.rate || createCode.isPending}
              onClick={handleCreateCode}
            >
              {createCode.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add Tax Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function BillingTaxPage() {
  return (
    <RequirePermission entity="billing" action="view">
      <BillingTaxContent />
    </RequirePermission>
  )
}
