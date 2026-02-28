'use client'

import { useFormContext } from 'react-hook-form'
import type { VisitorVisaFormValues } from '@/lib/schemas/visitor-visa-invitation'
import {
  ACCOMMODATION_TYPES,
  EXPENSE_RESPONSIBILITY,
  EMPLOYMENT_STATUSES,
} from '@/lib/utils/visitor-visa-constants'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  FormControl,
  FormDescription,
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

export function StepAccommodation() {
  const form = useFormContext<VisitorVisaFormValues>()
  const stayingWith = form.watch('accommodation.staying_with')
  const expenseResponsibility = form.watch('accommodation.expense_responsibility')

  const showAccommodationDetails =
    stayingWith === 'hotel' || stayingWith === 'airbnb'
  const showOtherDetails = stayingWith === 'other'
  const showFinancialDetails =
    expenseResponsibility === 'inviter' || expenseResponsibility === 'shared'

  return (
    <div className="space-y-6">
      {/* Accommodation */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Accommodation</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="accommodation.staying_with"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Where will the visitor stay? *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select accommodation type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ACCOMMODATION_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {showAccommodationDetails && (
            <>
              <FormField
                control={form.control}
                name="accommodation.accommodation_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {stayingWith === 'hotel' ? 'Hotel Name *' : 'Airbnb / Rental Name *'}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Name of accommodation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accommodation.accommodation_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accommodation Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Full address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {showOtherDetails && (
            <FormField
              control={form.control}
              name="accommodation.accommodation_other_details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accommodation Details *</FormLabel>
                  <FormControl>
                    <Input placeholder="Describe where the visitor will stay" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>

      {/* Financial Responsibility */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Financial Support</h3>
        <Separator className="my-3" />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="accommodation.expense_responsibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Who will cover the travel expenses? *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select who covers expenses" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EXPENSE_RESPONSIBILITY.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {showFinancialDetails && (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-medium text-foreground">
                  What will you provide during the visit?
                </p>

                <FormField
                  control={form.control}
                  name="accommodation.will_provide_accommodation"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm">Accommodation</FormLabel>
                        <FormDescription className="text-xs">
                          Free place to stay during the visit
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="accommodation.will_provide_food"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm">Food & Meals</FormLabel>
                        <FormDescription className="text-xs">
                          Daily meals during the stay
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="accommodation.will_provide_transportation"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm">Transportation</FormLabel>
                        <FormDescription className="text-xs">
                          Local travel and transportation
                        </FormDescription>
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

                <FormField
                  control={form.control}
                  name="accommodation.will_provide_spending_money"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm">Spending Money</FormLabel>
                        <FormDescription className="text-xs">
                          Pocket money for personal expenses
                        </FormDescription>
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

              <Separator />

              <p className="text-sm font-medium text-foreground">
                Your Financial Details (optional, strengthens the letter)
              </p>

              <FormField
                control={form.control}
                name="accommodation.employment_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMPLOYMENT_STATUSES.map((s) => (
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="accommodation.inviter_annual_income"
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

                <FormField
                  control={form.control}
                  name="accommodation.number_of_dependents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Dependents</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} placeholder="e.g. 2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
