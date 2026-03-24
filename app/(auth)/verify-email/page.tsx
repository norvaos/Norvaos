'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HelperTip } from '@/components/ui/helper-tip'
import { Mail, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [isResending, setIsResending] = useState(false)

  async function handleResend() {
    if (!email) {
      toast.error('No email address found. Please sign up again.')
      return
    }
    setIsResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? 'Failed to resend verification email.')
        return
      }
      toast.success('Verification email sent! Check your inbox.')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Mail className="size-8 text-primary" />
        </div>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We&apos;ve sent a verification link to{' '}
          {email ? <span className="font-medium text-foreground">{email}</span> : 'your email'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          <p>Click the link in the email to verify your account and activate your firm.</p>
          <p className="mt-2 text-xs">
            Didn&apos;t receive it? Check your spam folder or click below to resend.
          </p>
        </div>
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <span>Why do we require this?</span>
          <HelperTip contentKey="onboarding.email_verification" />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={isResending || !email}
        >
          {isResending ? (
            <>
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 size-4" />
              Resend verification email
            </>
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Wrong email?{' '}
          <Link href="/signup" className="text-primary hover:underline">Sign up again</Link>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Already verified?{' '}
          <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </CardFooter>
    </Card>
  )
}
