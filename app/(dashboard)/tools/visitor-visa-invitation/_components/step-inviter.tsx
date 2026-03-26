'use client'

import { useFormContext } from 'react-hook-form'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import { CANADIAN_PROVINCES, IMMIGRATION_STATUSES } from '@/lib/utils/visitor-visa-constants'

import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
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

export function StepInviter() {
  const form = useFormContext<VisitorVisaFormValues>()
  const immigrationStatus = form.watch('inviter.immigration_status')

  const showPermitExpiry =
    immigrationStatus === 'work_permit' ||
    immigrationStatus === 'study_permit' ||
    immigrationStatus === 'other'

  const showEmployerSchool =
    immigrationStatus === 'work_permit' || immigrationStatus === 'study_permit'

  return (
    <div className="space-y-6">
      {/* Personal Details */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Personal Details</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="inviter.full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Legal Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. John Michael Smith" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inviter.date_of_birth"
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
        </div>
      </div>

      {/* Canadian Address */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Canadian Address</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="inviter.street_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address *</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main Street, Apt 4" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="inviter.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl>
                    <Input placeholder="Toronto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="inviter.province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Province / Territory *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CANADIAN_PROVINCES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
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
            name="inviter.postal_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Postal Code *</FormLabel>
                <FormControl>
                  <Input placeholder="A1A 1A1" maxLength={7} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Contact Information */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Contact Information</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="inviter.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone *</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+1 (416) 555-0000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inviter.email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Immigration & Employment */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Immigration & Employment</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="inviter.immigration_status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Immigration Status in Canada *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select your status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {IMMIGRATION_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {showPermitExpiry && (
            <FormField
              control={form.control}
              name="inviter.permit_expiry_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permit Expiry Date *</FormLabel>
                  <FormControl>
                    <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {showEmployerSchool && (
            <FormField
              control={form.control}
              name="inviter.employer_school_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {immigrationStatus === 'study_permit' ? 'School / Institution Name *' : 'Employer Name *'}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        immigrationStatus === 'study_permit'
                          ? 'University of Toronto'
                          : 'Company name'
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="inviter.occupation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Occupation *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Software Engineer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inviter.employer_company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employer / Company Name</FormLabel>
                <FormControl>
                  <Input placeholder="Optional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inviter.annual_income"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Annual Income (CAD)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="e.g. 65000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  )
}
