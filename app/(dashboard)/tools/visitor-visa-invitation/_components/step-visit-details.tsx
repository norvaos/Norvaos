'use client'

import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import { differenceInDays, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import { VISIT_PURPOSES } from '@/lib/utils/visitor-visa-constants'

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

export function StepVisitDetails() {
  const form = useFormContext<VisitorVisaFormValues>()
  const purpose = form.watch('visit.purpose')
  const arrivalDate = form.watch('visit.arrival_date')
  const departureDate = form.watch('visit.departure_date')

  const duration = useMemo(() => {
    if (!arrivalDate || !departureDate) return null
    try {
      const days = differenceInDays(parseISO(departureDate), parseISO(arrivalDate))
      return days > 0 ? days : null
    } catch {
      return null
    }
  }, [arrivalDate, departureDate])

  return (
    <div className="space-y-6">
      {/* Purpose */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Purpose of Visit</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="visit.purpose"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Why is the visitor coming to Canada? *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {VISIT_PURPOSES.map((p) => (
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

          {/* Business fields */}
          {purpose === 'business' && (
            <>
              <FormField
                control={form.control}
                name="visit.business_purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Purpose *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Describe the business purpose of the visit..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="visit.business_company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Company / Organization</FormLabel>
                    <FormControl>
                      <Input placeholder="Company name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Event fields */}
          {purpose === 'event' && (
            <>
              <FormField
                control={form.control}
                name="visit.event_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event / Conference Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Tech Summit 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="visit.event_dates"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Dates</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. March 10-12, 2026" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="visit.event_location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Metro Toronto Convention Centre" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}

          {/* Medical fields */}
          {purpose === 'medical' && (
            <>
              <FormField
                control={form.control}
                name="visit.medical_facility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medical Facility / Hospital *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Toronto General Hospital" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="visit.medical_treatment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Treatment</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cardiac surgery" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Wedding fields */}
          {purpose === 'wedding' && (
            <>
              <FormField
                control={form.control}
                name="visit.wedding_whose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Whose Wedding? *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. My daughter, Sarah" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="visit.wedding_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wedding Date</FormLabel>
                      <FormControl>
                        <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="visit.wedding_venue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wedding Venue</FormLabel>
                      <FormControl>
                        <Input placeholder="Venue name and city" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}

          {/* Other purpose */}
          {purpose === 'other' && (
            <FormField
              control={form.control}
              name="visit.other_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Please Describe the Purpose *</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Describe the reason for the visit..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>

      {/* Travel Dates */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Travel Dates</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="visit.arrival_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned Arrival Date *</FormLabel>
                  <FormControl>
                    <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visit.departure_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned Departure Date *</FormLabel>
                  <FormControl>
                    <TenantDateInput value={field.value ?? ''} onChange={(iso) => field.onChange(iso)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {duration !== null && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Duration of stay: <span className="font-medium text-foreground">{duration} days</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Places to Visit */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Itinerary</h3>
        <Separator className="my-3" />
        <FormField
          control={form.control}
          name="visit.places_to_visit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Places the Visitor Plans to Visit</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="e.g. Toronto, Niagara Falls, Ottawa"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
