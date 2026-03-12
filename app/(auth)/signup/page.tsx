'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Lock } from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'

const schema = z.object({
  firmName: z.string().min(2, 'Firm name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.email('Please enter a valid email address'),
  firmSize: z.string().min(1, 'Please select your firm size'),
})

type FormValues = z.infer<typeof schema>

export default function EarlyAccessPage() {
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
  })

  async function onSubmit(data: FormValues) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? 'Something went wrong. Please try again.')
        return
      }
      setSubmitted(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card className="text-center">
        <CardContent className="pt-10 pb-8 px-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">You&apos;re on the list</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you for your interest in NorvaOS. We&apos;ll reach out with your invitation when we&apos;re ready to onboard your firm.
          </p>
          <div className="mt-6 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-start gap-3 text-left">
            <Lock className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-700">
              NorvaOS is invitation-only during our launch phase. Each firm is onboarded personally to ensure a smooth start.
            </p>
          </div>
          <Link href="/" className="mt-6 inline-block text-sm text-indigo-600 hover:underline">
            ← Back to home
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <NorvaLogo size={28} id="signup" />
          <span className="font-semibold text-gray-900">NorvaOS</span>
        </div>
        <CardTitle>Request early access</CardTitle>
        <CardDescription>
          NorvaOS is invitation-only. Submit your details and we&apos;ll be in touch when we&apos;re ready to onboard your firm.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firmName">Firm name</Label>
            <Input id="firmName" placeholder="Acme Law LLP" disabled={isLoading} {...register('firmName')} />
            {errors.firmName && <p className="text-sm text-destructive">{errors.firmName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" placeholder="Jane" disabled={isLoading} {...register('firstName')} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" placeholder="Doe" disabled={isLoading} {...register('lastName')} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" placeholder="jane@yourfirm.com" disabled={isLoading} {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="firmSize">Firm size</Label>
            <select
              id="firmSize"
              disabled={isLoading}
              {...register('firmSize')}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">Select firm size</option>
              <option value="solo">Solo practitioner</option>
              <option value="2-5">2–5 lawyers</option>
              <option value="6-15">6–15 lawyers</option>
              <option value="16-50">16–50 lawyers</option>
              <option value="50+">50+ lawyers</option>
            </select>
            {errors.firmSize && <p className="text-sm text-destructive">{errors.firmSize.message}</p>}
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 flex items-start gap-3">
            <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Access is by invitation only. We personally onboard every firm to ensure a smooth setup.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Request early access'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an invitation?{' '}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
