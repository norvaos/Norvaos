'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BULK_LEAD_FIELDS } from '@/lib/services/bulk-lead-import/types'

interface MapColumnsStepProps {
  headers: string[]
  mapping: Record<string, string>
  preview: Record<string, string>[]
  totalRows: number
  onConfirm: (mapping: Record<string, string>, sourceTag: string, campaignTag: string) => void
  onBack: () => void
  isSubmitting: boolean
}

const UNMAPPED = '__unmapped__'

export function MapColumnsStep({
  headers,
  mapping,
  preview,
  totalRows,
  onConfirm,
  onBack,
  isSubmitting,
}: MapColumnsStepProps) {
  const [localMapping, setLocalMapping] = useState<Record<string, string>>(mapping)
  const [sourceTag, setSourceTag] = useState('')
  const [campaignTag, setCampaignTag] = useState('')

  const usedKeys = new Set(Object.values(localMapping))
  const requiredFields = BULK_LEAD_FIELDS.filter((f) => f.required)
  const missingRequired = requiredFields.filter((f) => !usedKeys.has(f.key))

  const handleMappingChange = (csvHeader: string, fieldKey: string) => {
    setLocalMapping((prev) => {
      const next = { ...prev }
      if (fieldKey === UNMAPPED) {
        delete next[csvHeader]
      } else {
        next[csvHeader] = fieldKey
      }
      return next
    })
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="secondary">{totalRows} rows</Badge>
        <Badge variant="secondary">{headers.length} columns</Badge>
        {missingRequired.length > 0 && (
          <Badge variant="destructive">
            Missing: {missingRequired.map((f) => f.label).join(', ')}
          </Badge>
        )}
      </div>

      {/* Column mapping table */}
      <div className="rounded-md border max-h-[320px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">CSV Column</TableHead>
              <TableHead className="w-[200px]">Maps To</TableHead>
              <TableHead>Sample Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {headers.map((header) => (
              <TableRow key={header}>
                <TableCell className="font-mono text-xs">{header}</TableCell>
                <TableCell>
                  <Select
                    value={localMapping[header] ?? UNMAPPED}
                    onValueChange={(v) => handleMappingChange(header, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMAPPED}>
                        <span className="text-muted-foreground">— Skip —</span>
                      </SelectItem>
                      {BULK_LEAD_FIELDS.map((field) => (
                        <SelectItem
                          key={field.key}
                          value={field.key}
                          disabled={usedKeys.has(field.key) && localMapping[header] !== field.key}
                        >
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {preview[0]?.[header] ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Source Attribution */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="sourceTag" className="text-xs">Source Tag (optional)</Label>
          <Input
            id="sourceTag"
            placeholder="e.g. website_form, referral"
            value={sourceTag}
            onChange={(e) => setSourceTag(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="campaignTag" className="text-xs">Campaign Tag (optional)</Label>
          <Input
            id="campaignTag"
            placeholder="e.g. spring_2026_campaign"
            value={campaignTag}
            onChange={(e) => setCampaignTag(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          onClick={() => onConfirm(localMapping, sourceTag, campaignTag)}
          disabled={missingRequired.length > 0 || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Validate & Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
