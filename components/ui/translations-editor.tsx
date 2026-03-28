'use client'

import { useState } from 'react'
import { Plus, X, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { PORTAL_LOCALES, RTL_LOCALES, type PortalLocale } from '@/lib/utils/portal-translations'

interface TranslationsEditorProps {
  translations: Record<string, string>
  onChange: (translations: Record<string, string>) => void
  placeholder?: string
}

export function TranslationsEditor({
  translations,
  onChange,
  placeholder = 'Translated description...',
}: TranslationsEditorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const addedLocales = Object.keys(translations)
  const availableLocales = PORTAL_LOCALES.filter(
    (l) => l.value !== 'en' && !addedLocales.includes(l.value),
  )

  const addLocale = (locale: PortalLocale) => {
    onChange({ ...translations, [locale]: '' })
    setPopoverOpen(false)
  }

  const removeLocale = (locale: string) => {
    const next = { ...translations }
    delete next[locale]
    onChange(next)
  }

  const updateLocale = (locale: string, value: string) => {
    onChange({ ...translations, [locale]: value })
  }

  if (addedLocales.length === 0) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-7 px-2">
            <Globe className="h-3 w-3" />
            Add translation
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {availableLocales.map((l) => (
              <button
                key={l.value}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100"
                onClick={() => addLocale(l.value)}
              >
                <span className="font-medium">{l.nativeLabel}</span>
                <span className="text-muted-foreground text-xs">({l.label})</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="space-y-2">
      {addedLocales.map((locale) => {
        const meta = PORTAL_LOCALES.find((l) => l.value === locale)
        const isRtl = RTL_LOCALES.includes(locale as PortalLocale)
        return (
          <div key={locale} className="flex gap-2 items-start">
            <Badge variant="outline" className="mt-1.5 text-[10px] px-1.5 py-0 shrink-0 font-mono">
              {locale.toUpperCase()}
            </Badge>
            <Textarea
              className="min-h-[36px] text-sm resize-none flex-1"
              dir={isRtl ? 'rtl' : 'ltr'}
              placeholder={`${meta?.nativeLabel ?? locale}: ${placeholder}`}
              rows={1}
              value={translations[locale] ?? ''}
              onChange={(e) => updateLocale(locale, e.target.value)}
            />
            <button
              type="button"
              className="mt-1.5 rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-950/30 shrink-0"
              onClick={() => removeLocale(locale)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-7 px-2">
            <Plus className="h-3 w-3" />
            Add language
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {availableLocales.map((l) => (
              <button
                key={l.value}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100"
                onClick={() => addLocale(l.value)}
              >
                <span className="font-medium">{l.nativeLabel}</span>
                <span className="text-muted-foreground text-xs">({l.label})</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
