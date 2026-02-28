'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { profileSchema, type ProfileFormValues } from '@/lib/schemas/settings'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
    </div>
  )
}
