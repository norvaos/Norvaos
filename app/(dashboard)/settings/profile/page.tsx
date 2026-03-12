'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, User, PenLine, Trash2, RefreshCw, Briefcase } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import {
  profileSchema,
  type ProfileFormValues,
  credentialsSchema,
  type CredentialsFormValues,
} from '@/lib/schemas/settings'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SignaturePad } from '@/components/esign/signature-pad'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

export default function SettingsProfilePage() {
  const { appUser, isLoading: userLoading } = useUser()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['settings', 'profile', appUser?.id],
    queryFn: async () => {
      const supabase = createClient()
      if (!appUser) return null
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', appUser.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!appUser,
  })

  const form = useForm<ProfileFormValues>({
    resolver: standardSchemaResolver(profileSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
    },
  })

  useEffect(() => {
    if (profile) {
      form.reset({
        first_name: profile.first_name ?? '',
        last_name: profile.last_name ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
      })
    }
  }, [profile, form])

  const updateProfile = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const supabase = createClient()
      if (!appUser) throw new Error('No user found')
      const { error } = await supabase
        .from('users')
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone || null,
        })
        .eq('id', appUser.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Profile updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] })
    },
    onError: (error) => {
      toast.error('Failed to update profile.', {
        description: error.message,
      })
    },
  })

  function onSubmit(values: ProfileFormValues) {
    updateProfile.mutate(values)
  }

  const initials = profile
    ? `${(profile.first_name ?? '').charAt(0)}${(profile.last_name ?? '').charAt(0)}`.toUpperCase()
    : ''

  if (userLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
          <p className="text-muted-foreground">Manage your personal information.</p>
        </div>
        <Card>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">
          Manage your personal information and account details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your name and contact details. Your email address cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <Avatar className="h-16 w-16" size="lg">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={initials} />
              <AvatarFallback className="text-lg">
                {initials || <User className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          <Separator className="mb-6" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your first name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your last name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          {...field}
                          disabled
                          className="bg-muted"
                        />
                      </FormControl>
                      <FormDescription>
                        Email address is managed through your authentication provider.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="+1 (555) 000-0000"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Professional Credentials Card ──────────────────────────────── */}
      <ProfessionalCredentialsCard
        userId={appUser!.id}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentSettings={(profile as any)?.settings ?? {}}
      />

      {/* ── E-Signature Card ──────────────────────────────────────────── */}
      <ESignatureCard
        signerName={`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()}
      />
    </div>
  )
}

// ─── Professional Credentials Card ──────────────────────────────────────────

interface ProfentialsCredentialsCardProps {
  userId: string
  currentSettings: Record<string, unknown>
}

function ProfessionalCredentialsCard({ userId, currentSettings }: ProfentialsCredentialsCardProps) {
  const queryClient = useQueryClient()

  const credentials = (currentSettings.professional_credentials ?? {}) as Record<string, string>

  const form = useForm<CredentialsFormValues>({
    resolver: standardSchemaResolver(credentialsSchema),
    defaultValues: {
      display_name: credentials.display_name ?? '',
      title: credentials.title ?? '',
      lso_number: credentials.lso_number ?? '',
      rcic_number: credentials.rcic_number ?? '',
      rep_phone: credentials.rep_phone ?? '',
      rep_email: credentials.rep_email ?? '',
    },
  })

  // Reset when settings change
  useEffect(() => {
    form.reset({
      display_name: credentials.display_name ?? '',
      title: credentials.title ?? '',
      lso_number: credentials.lso_number ?? '',
      rcic_number: credentials.rcic_number ?? '',
      rep_phone: credentials.rep_phone ?? '',
      rep_email: credentials.rep_email ?? '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSettings])

  const updateCredentials = useMutation({
    mutationFn: async (values: CredentialsFormValues) => {
      const supabase = createClient()

      // Merge into existing settings JSONB
      const updatedSettings = {
        ...currentSettings,
        professional_credentials: {
          display_name: values.display_name || null,
          title: values.title || null,
          lso_number: values.lso_number || null,
          rcic_number: values.rcic_number || null,
          rep_phone: values.rep_phone || null,
          rep_email: values.rep_email || null,
        },
      }

      const { error } = await supabase
        .from('users')
        .update({ settings: updatedSettings } as never)
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Professional credentials saved.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] })
    },
    onError: (error) => {
      toast.error('Failed to save credentials.', { description: error.message })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Professional Credentials
        </CardTitle>
        <CardDescription>
          Your display name and regulatory numbers are shown on retainers, e-sign documents,
          and client-facing communications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateCredentials.mutate(v))} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. John A. Smith" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>
                      Full name as it should appear on documents. Leave blank to use your first/last name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Professional Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Barrister & Solicitor" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lso_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LSO Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 12345P" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Law Society of Ontario member number.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rcic_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RCIC / IRCC Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. R123456" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Regulated Canadian Immigration Consultant number.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-2" />
            <p className="text-sm font-medium text-muted-foreground">
              Representative Contact — used on Use of Representative forms (IMM5476E)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="rep_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Representative Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (416) 555-0100" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Phone number shown on Use of Rep form.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rep_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Representative Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="lawyer@yourfirm.ca" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Email shown on Use of Rep form.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateCredentials.isPending}>
                {updateCredentials.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Credentials
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// ─── E-Signature Settings Card ───────────────────────────────────────────────

interface SignatureData {
  mode: 'drawn' | 'typed'
  typedName: string | null
  updatedAt: string
  imageUrl: string | null
}

function ESignatureCard({ signerName }: { signerName: string }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [pendingSignature, setPendingSignature] = useState<{
    dataUrl: string
    mode: 'drawn' | 'typed' | 'uploaded'
    typedName?: string
  } | null>(null)

  // Fetch saved signature
  const { data: savedSignature, isLoading: sigLoading } = useQuery<SignatureData | null>({
    queryKey: ['settings', 'signature'],
    queryFn: async () => {
      const res = await fetch('/api/settings/signature')
      if (!res.ok) throw new Error('Failed to fetch signature')
      const json = await res.json()
      return json.signature ?? null
    },
  })

  // Save signature mutation
  const saveSignature = useMutation({
    mutationFn: async (data: {
      dataUrl: string
      mode: 'drawn' | 'typed' | 'uploaded'
      typedName?: string
    }) => {
      const res = await fetch('/api/settings/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save signature')
      }
    },
    onSuccess: () => {
      toast.success('Signature saved successfully.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'signature'] })
      setIsEditing(false)
      setPendingSignature(null)
    },
    onError: (error) => {
      toast.error('Failed to save signature.', { description: error.message })
    },
  })

  // Delete signature mutation
  const deleteSignature = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/signature', { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to remove signature')
      }
    },
    onSuccess: () => {
      toast.success('Signature removed.')
      queryClient.invalidateQueries({ queryKey: ['settings', 'signature'] })
    },
    onError: (error) => {
      toast.error('Failed to remove signature.', { description: error.message })
    },
  })

  const handleSignatureChange = useCallback(
    (data: { dataUrl: string; mode: 'drawn' | 'typed' | 'uploaded'; typedName?: string } | null) => {
      setPendingSignature(data)
    },
    []
  )

  const handleSave = () => {
    if (!pendingSignature) return
    saveSignature.mutate(pendingSignature)
  }

  const handleReplace = () => {
    setIsEditing(true)
    setPendingSignature(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setPendingSignature(null)
  }

  const hasSavedSignature = savedSignature && savedSignature.imageUrl
  const showEditor = !hasSavedSignature || isEditing

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          E-Signature
        </CardTitle>
        <CardDescription>
          Your saved signature is automatically applied when you send retainers for e-sign.
          Clients will see your signature on the document before adding their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sigLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[150px] w-full max-w-md" />
            <Skeleton className="h-9 w-32" />
          </div>
        ) : showEditor ? (
          <div className="space-y-4">
            <Tabs
              value={signatureMode}
              onValueChange={(v) => {
                setSignatureMode(v as 'draw' | 'type' | 'upload')
                setPendingSignature(null)
              }}
            >
              <TabsList>
                <TabsTrigger value="draw">Draw</TabsTrigger>
                <TabsTrigger value="type">Type</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="max-w-md">
              <SignaturePad
                mode={signatureMode}
                signerName={signerName}
                onSignatureChange={handleSignatureChange}
                disabled={saveSignature.isPending}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!pendingSignature || saveSignature.isPending}
              >
                {saveSignature.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Signature
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preview of saved signature */}
            <div className="rounded-md border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={savedSignature.imageUrl!}
                alt="Your saved signature"
                className="h-[80px] object-contain"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {savedSignature.mode === 'drawn' ? 'Drawn' : 'Typed'} signature
                {savedSignature.updatedAt && (
                  <> · Saved {new Date(savedSignature.updatedAt).toLocaleDateString()}</>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReplace}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Replace
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteSignature.mutate()}
                disabled={deleteSignature.isPending}
              >
                {deleteSignature.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Remove
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
