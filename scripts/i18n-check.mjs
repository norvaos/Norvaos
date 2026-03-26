#!/usr/bin/env node

/**
 * i18n Dictionary Parity Checker
 *
 * Validates that all locale dictionaries contain the same keys as the
 * English (en) base dictionary. Optionally filters by a target script
 * family (e.g. --target=nastaliq for Urdu/Farsi).
 *
 * Usage:
 *   node scripts/i18n-check.mjs
 *   node scripts/i18n-check.mjs --target=nastaliq
 */

import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve, basename } from 'node:path'

const DICT_DIR = resolve(import.meta.dirname, '../lib/i18n/dictionaries')

// Script-family locale groups
const SCRIPT_FAMILIES = {
  nastaliq: ['ur', 'fa'],
  arabic: ['ar', 'fa'],
  rtl: ['ar', 'ur', 'fa'],
}

const args = process.argv.slice(2)
const targetFlag = args.find((a) => a.startsWith('--target='))
const targetFamily = targetFlag ? targetFlag.split('=')[1] : null

async function loadDict(locale) {
  const url = pathToFileURL(resolve(DICT_DIR, `${locale}.ts`))
  // Use a simple regex parse since .ts files can't be directly imported
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(resolve(DICT_DIR, `${locale}.ts`), 'utf-8')
  // Extract all quoted keys from the dictionary
  const keys = []
  const keyRegex = /['"]([^'"]+)['"]\s*:/g
  let match
  while ((match = keyRegex.exec(content)) !== null) {
    keys.push(match[1])
  }
  return new Set(keys)
}

async function main() {
  const files = await readdir(DICT_DIR)
  const locales = files
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => basename(f, '.ts'))

  const enKeys = await loadDict('en')
  console.log(`\n  Base dictionary (en): ${enKeys.size} keys\n`)

  const targetLocales = targetFamily && SCRIPT_FAMILIES[targetFamily]
    ? locales.filter((l) => SCRIPT_FAMILIES[targetFamily].includes(l))
    : locales.filter((l) => l !== 'en')

  let totalMissing = 0

  for (const locale of targetLocales) {
    const localeKeys = await loadDict(locale)
    const missing = [...enKeys].filter((k) => !localeKeys.has(k))
    const extra = [...localeKeys].filter((k) => !enKeys.has(k))

    if (missing.length === 0 && extra.length === 0) {
      console.log(`  ✓ ${locale}: ${localeKeys.size} keys  -  parity OK`)
    } else {
      if (missing.length > 0) {
        console.log(`  ✗ ${locale}: MISSING ${missing.length} keys`)
        missing.forEach((k) => console.log(`      - ${k}`))
        totalMissing += missing.length
      }
      if (extra.length > 0) {
        console.log(`  ⚠ ${locale}: ${extra.length} extra keys (not in en)`)
        extra.forEach((k) => console.log(`      + ${k}`))
      }
    }
  }

  console.log('')

  if (totalMissing > 0) {
    console.error(`  ✗ ${totalMissing} missing keys across ${targetLocales.length} locales\n`)
    process.exit(1)
  } else {
    console.log(`  ✓ All ${targetLocales.length} locale(s) have full parity with en\n`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
