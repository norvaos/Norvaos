'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { NorvaLogo } from '@/components/landing/norva-logo'
import { CheckCircle2 } from 'lucide-react'
import { HelperTip } from '@/components/ui/helper-tip'
import { setActiveTenant } from '@/lib/hooks/use-user'

const schema = z.object({
  firmName: z.string().min(2, 'Firm name is required'),
  membershipNo: z.string().max(100).optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match — please ensure both entries are identical',
  path: ['confirmPassword'],
})

type FormValues = z.infer<typeof schema>

export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [signupComplete, setSignupComplete] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
  })

  async function onSubmit(data: FormValues) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmName: data.firmName,
          membershipNo: data.membershipNo || undefined,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? 'Something went wrong. Please try again.')
        return
      }
      // Pin the new tenant as active so login lands on the right firm
      if (result.data?.tenant?.id) {
        setActiveTenant(result.data.tenant.id)
      }
      setSignupEmail(data.email)
      setSignupComplete(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (signupComplete) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="size-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Account Created</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-[320px] mx-auto">
            We&apos;ve sent a verification link to{' '}
            <span className="font-medium text-foreground">{signupEmail}</span>.
            Check your inbox (and spam folder) to verify your account and start your provisioning.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => router.push(`/verify-email?email=${encodeURIComponent(signupEmail)}`)}
          >
            Continue to Verification
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Didn&apos;t receive it? You can resend from the next page.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your firm account</CardTitle>
        <CardDescription>
          Set up NorvaOS for your firm. You&apos;ll be the account admin.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firmName">Firm name <HelperTip contentKey="onboarding.firm_name" /></Label>
            <Input id="firmName" placeholder="Acme Law LLP" disabled={isLoading} {...register('firmName')} />
            {errors.firmName && <p className="text-sm text-destructive">{errors.firmName.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="membershipNo">Law Society / CICC ID <span className="text-xs font-normal text-muted-foreground">(Optional)</span> <HelperTip contentKey="onboarding.membership_no" /></Label>
            <Input id="membershipNo" placeholder="e.g. 12345 or RCICxxxxx" disabled={isLoading} {...register('membershipNo')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name <HelperTip contentKey="onboarding.first_name" /></Label>
              <Input id="firstName" placeholder="Jane" disabled={isLoading} {...register('firstName')} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name <HelperTip contentKey="onboarding.last_name" /></Label>
              <Input id="lastName" placeholder="Doe" disabled={isLoading} {...register('lastName')} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email <HelperTip contentKey="onboarding.email_professional" /></Label>
            <Input id="email" type="email" placeholder="jane@yourfirm.com" disabled={isLoading} {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password <HelperTip contentKey="onboarding.password" /></Label>
            <Input id="password" type="password" placeholder="At least 8 characters" disabled={isLoading} {...register('password')} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" placeholder="Repeat your password" disabled={isLoading} {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 border-t pt-6 mt-2">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
