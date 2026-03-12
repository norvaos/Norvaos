'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Phone, User, Mail, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface PhoneSearchProps {
  tenantId: string
}

interface ContactResult {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
  phone_primary: string | null
}

/**
 * Smart phone search for the Front Desk dashboard.
 * Search contacts by phone, name, or email.
 * Shows history and quick actions (Log Call, Create Lead).
 */
export function PhoneSearch({ tenantId }: PhoneSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])

  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const supabase = createClient()
      const term = `%${searchQuery.trim()}%`

      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary')
        .eq('tenant_id', tenantId)
        .or(`phone_primary.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},email_primary.ilike.${term}`)
        .limit(10)

      if (error) throw error
      return data ?? []
    },
    onSuccess: (data) => setResults(data),
  })

  function handleSearch() {
    if (query.trim().length < 2) return
    searchMutation.mutate(query)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          Quick Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Phone, name, or email..."
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={searchMutation.isPending || query.trim().length < 2}
          >
            {searchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((contact) => (
              <div
                key={contact.id}
                className="p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-900">
                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </span>
                </div>
                {contact.phone_primary && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-500">{contact.phone_primary}</span>
                  </div>
                )}
                {contact.email_primary && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Mail className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-500">{contact.email_primary}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {searchMutation.isSuccess && results.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No contacts found.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
