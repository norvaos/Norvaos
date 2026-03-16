'use client'

import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
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

// ─── Schema ───────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Please provide more detail').max(5000),
  area: z.enum(['email', 'calendar', 'billing', 'matters', 'auth', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
})

type IssueForm = z.infer<typeof issueSchema>

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitIssue(data: IssueForm): Promise<{ reference: string }> {
  const res = await fetch('/api/support/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Submission failed' }))
    throw new Error(error ?? 'Submission failed')
  }
  return res.json()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupportIssuePage() {
  const [reference, setReference] = useState<string | null>(null)

  const form = useForm<IssueForm>({
    resolver: standardSchemaResolver(issueSchema),
    defaultValues: {
      title: '',
      description: '',
      area: 'other',
      severity: 'medium',
    },
  })

  const mutation = useMutation({
    mutationFn: submitIssue,
    onSuccess: (data) => {
      setReference(data.reference)
      form.reset()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not submit issue')
    },
  })

  if (reference) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
              <h2 className="text-lg font-semibold">Issue Received</h2>
              <p className="text-sm text-muted-foreground">
                Your issue has been logged and the operations team has been notified.
              </p>
              <p className="text-xs font-mono bg-muted px-3 py-1 rounded">
                Reference: {reference}
              </p>
              <Button variant="outline" size="sm" onClick={() => setReference(null)}>
                Submit Another Issue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report an Issue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Internal support issue intake. For urgent matters, contact the operations team directly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue Details</CardTitle>
          <CardDescription>
            All fields are required. Your submission is logged securely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief description of the issue" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Affected Area</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select area" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="calendar">Calendar</SelectItem>
                          <SelectItem value="billing">Billing</SelectItem>
                          <SelectItem value="matters">Matters</SelectItem>
                          <SelectItem value="auth">Authentication</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Severity</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select severity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                              Critical
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what happened, steps to reproduce, and any error messages..."
                        rows={5}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={mutation.isPending} className="w-full">
                {mutation.isPending ? 'Submitting...' : 'Submit Issue'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
