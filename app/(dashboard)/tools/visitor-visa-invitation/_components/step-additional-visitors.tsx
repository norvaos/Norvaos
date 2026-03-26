'use client'

import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import { COUNTRIES } from '@/lib/utils/visitor-visa-constants'

import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

export function StepAdditionalVisitors() {
  const form = useFormContext<VisitorVisaFormValues>()
  const hasAdditional = form.watch('additional_visitors.has_additional')

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'additional_visitors.visitors',
  })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">Additional Visitors</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Are there other people being invited alongside the primary visitor?
        </p>
        <Separator className="my-3" />

        <FormField
          control={form.control}
          name="additional_visitors.has_additional"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <FormLabel className="text-sm">
                  I am inviting additional visitors
                </FormLabel>
              </div>
              <FormControl>
                <Switch
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {hasAdditional && (
        <div className="space-y-4">
          {fields.map((item, index) => (
            <div
              key={item.id}
              className="relative rounded-lg border bg-muted/30 p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Visitor {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name={`additional_visitors.visitors.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Full legal name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`additional_visitors.visitors.${index}.relationship`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship to You *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Mother, Brother" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name={`additional_visitors.visitors.${index}.date_of_birth`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`additional_visitors.visitors.${index}.passport_number`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Passport Number</FormLabel>
                      <FormControl>
                        <Input placeholder="AB1234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`additional_visitors.visitors.${index}.country`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              append({
                name: '',
                date_of_birth: '',
                passport_number: '',
                relationship: '',
                country: '',
              })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Another Visitor
          </Button>
        </div>
      )}

      {!hasAdditional && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Toggle the switch above if you are inviting additional visitors alongside the primary visitor.
        </div>
      )}
    </div>
  )
}
