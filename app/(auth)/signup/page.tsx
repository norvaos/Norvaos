'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { JURISDICTIONS, DEFAULT_JURISDICTION } from '@/lib/config/jurisdictions'

const signupSchema = z.object({
  firmName: z.string().min(2, 'Firm name must be at least 2 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  jurisdictionCode: z.string().min(1, 'Jurisdiction is required'),
})

type SignupFormValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: standardSchemaResolver(signupSchema),
    defaultValues: {
      firmName: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      jurisdictionCode: DEFAULT_JURISDICTION,
    },
  })

  const selectedJurisdiction = watch('jurisdictionCode')

  async function onSubmit(data: SignupFormValues) {
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        toast.error('Sign up failed', {
          description: result.error ?? 'An unexpected error occurred.',
        })
        return
      }

      toast.success('Account created successfully')
      router.push('/')
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Set up your firm and start managing your practice
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firmName">Firm name</Label>
            <Input
              id="firmName"
              type="text"
              placeholder="Acme Law LLP"
              disabled={isLoading}
              {...register('firmName')}
            />
            {errors.firmName && (
              <p className="text-sm text-destructive">{errors.firmName.message}</p>
            )}
          </div>

          {/* Jurisdiction selector */}
          <div className="space-y-2">
            <Label>Jurisdiction</Label>
            <TooltipProvider>
              <div className="flex gap-2">
                {JURISDICTIONS.map((j) => (
                  <Tooltip key={j.code}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!j.enabled || isLoading}
                        onClick={() => j.enabled && setValue('jurisdictionCode', j.code)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                          selectedJurisdiction === j.code
                            ? 'border-primary bg-primary/5 font-medium'
                            : j.enabled
                              ? 'border-border hover:border-primary/50'
                              : 'cursor-not-allowed border-border/50 opacity-50'
                        }`}
                      >
                        <span>{j.flag}</span>
                        <span>{j.name}</span>
                      </button>
                    </TooltipTrigger>
                    {!j.enabled && j.disabledTooltip && (
                      <TooltipContent>
                        <p>{j.disabledTooltip}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Jane"
                disabled={isLoading}
                {...register('firstName')}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Doe"
                disabled={isLoading}
                {...register('lastName')}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@yourfirm.com"
              autoComplete="email"
              disabled={isLoading}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={isLoading}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
