'use client'

import { useFormContext } from 'react-hook-form'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import { COUNTRIES, RELATIONSHIPS, GENDERS } from '@/lib/utils/visitor-visa-constants'

import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Textarea } from '@/components/ui/textarea'
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

export function StepVisitor() {
  const form = useFormContext<VisitorVisaFormValues>()
  const relationship = form.watch('visitor.relationship')

  return (
    <div className="space-y-6">
      {/* Personal Details */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Visitor&apos;s Personal Details</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="visitor.full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Legal Name (as on passport) *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Maria Garcia Lopez" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="visitor.date_of_birth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth *</FormLabel>
                  <FormControl>
                    <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visitor.gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
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
      </div>

      {/* Passport Information */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Passport Information</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="visitor.passport_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Passport Number *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. AB1234567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visitor.passport_expiry_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Passport Expiry Date *</FormLabel>
                <FormControl>
                  <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Country & Address */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Country & Address</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="visitor.country_of_citizenship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country of Citizenship *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select country" />
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

            <FormField
              control={form.control}
              name="visitor.country_of_residence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country of Residence *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select country" />
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

          <FormField
            control={form.control}
            name="visitor.address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Address in Home Country *</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Street, City, State/Province, Postal Code" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Contact */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Contact Information</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="visitor.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+91 98765 43210" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visitor.email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="visitor@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Relationship */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Relationship</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="visitor.relationship"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Relationship to You *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {relationship === 'other' && (
            <FormField
              control={form.control}
              name="visitor.relationship_other"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Please Specify Relationship *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Family friend, Colleague" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </div>
  )
}
