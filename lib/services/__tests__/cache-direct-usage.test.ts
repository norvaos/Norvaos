import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'

/**
 * CI guard: Ensures no file in lib/ or app/ imports @upstash/redis directly
 * or calls redis.get()/redis.set() bypassing the cache.ts abstraction.
 *
 * The only file allowed to import @upstash/redis is lib/services/cache.ts.
 */
describe('cache – no direct Redis usage', () => {
  // Collect all TypeScript files in lib/ and app/
  function getAllTsFiles(dir: string): string[] {
    const { execSync } = require('child_process')
    const root = join(__dirname, '..', '..', '..')
    const result = execSync(
      `find ${join(root, dir)} -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v __tests__`,
      { encoding: 'utf-8' }
    )
    return result.trim().split('\n').filter(Boolean)
  }

  it('no file imports @upstash/redis directly (except cache.ts)', () => {
    const violations: string[] = []

    for (const dir of ['lib', 'app']) {
      let files: string[]
      try {
        files = getAllTsFiles(dir)
      } catch {
        continue
      }

      for (const file of files) {
        if (file.endsWith('lib/services/cache.ts')) continue
        if (file.includes('__tests__')) continue

        try {
          const content = readFileSync(file, 'utf-8')
          if (content.includes("from '@upstash/redis'") || content.includes('from "@upstash/redis"')) {
            violations.push(file)
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    expect(
      violations,
      `These files import @upstash/redis directly — use lib/services/cache.ts instead:\n${violations.join('\n')}`
    ).toEqual([])
  })

  it('no file calls redis.get/redis.set directly (except cache.ts)', () => {
    const violations: string[] = []
    const patterns = [/redis\.get\s*\(/, /redis\.set\s*\(/, /redis\.del\s*\(/, /redis\.incr\s*\(/]

    for (const dir of ['lib', 'app']) {
      let files: string[]
      try {
        files = getAllTsFiles(dir)
      } catch {
        continue
      }

      for (const file of files) {
        if (file.endsWith('lib/services/cache.ts')) continue
        if (file.includes('__tests__')) continue

        try {
          const content = readFileSync(file, 'utf-8')
          for (const pattern of patterns) {
            if (pattern.test(content)) {
              violations.push(`${file} matches ${pattern}`)
              break
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    expect(
      violations,
      `These files call redis methods directly — use lib/services/cache.ts instead:\n${violations.join('\n')}`
    ).toEqual([])
  })
})
