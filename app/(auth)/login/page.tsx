'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Mail, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

const loginSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardHeader>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    }>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/'
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<{
    type: 'credentials' | 'unverified' | 'unknown'
    message: string
    email?: string
  } | null>(null)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: standardSchemaResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function handleResendVerification(email: string) {
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      toast.success('Verification email sent! Check your inbox.')
    } catch {
      toast.error('Failed to resend verification email.')
    } finally {
      setResending(false)
    }
  }

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        const isUnverified = error.message.toLowerCase().includes('email not confirmed')
        if (isUnverified) {
          setFormError({
            type: 'unverified',
            message: 'Your email address has not been verified. Please check your inbox for a verification link.',
            email: data.email,
          })
        } else {
          // Don't leak whether the email exists  -  always show generic message
          setFormError({
            type: 'credentials',
            message: 'Invalid email or password. Please check your credentials and try again.',
          })
        }
        return
      }

      router.push(redirectTo)
      router.refresh()
    } catch {
      setFormError({
        type: 'unknown',
        message: 'Something went wrong. Please try again in a moment.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to your account</CardTitle>
        <CardDescription>
          Enter your email and password to continue
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* ── Inline error alert ────────────────────────────────── */}
          {formError && (
            <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <p>{formError.message}</p>
                {formError.type === 'unverified' && formError.email && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-destructive underline"
                    disabled={resending}
                    onClick={() => handleResendVerification(formError.email!)}
                  >
                    <Mail className="mr-1 h-3 w-3" />
                    {resending ? 'Sending...' : 'Resend verification email'}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@yourfirm.com"
              autoComplete="email"
              disabled={isLoading}
              className={formError?.type === 'credentials' ? 'border-destructive' : ''}
              {...register('email')}
              onChange={(e) => {
                register('email').onChange(e)
                if (formError) setFormError(null)
              }}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                className={`pr-10 ${formError?.type === 'credentials' ? 'border-destructive' : ''}`}
                {...register('password')}
                onChange={(e) => {
                  register('password').onChange(e)
                  if (formError) setFormError(null)
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            By signing in you agree to our{' '}
            <Link href="/terms" className="underline hover:text-primary">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
