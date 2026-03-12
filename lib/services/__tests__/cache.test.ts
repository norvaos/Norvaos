import { describe, it, expect } from 'vitest'
import { assertTenantKey, cacheKey } from '../cache'

const VALID_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_TENANT_ID_B = '660e8400-e29b-41d4-a716-446655440001'

describe('cache – tenant key enforcement', () => {
  describe('assertTenantKey', () => {
    it('accepts valid tenant-prefixed key', () => {
      expect(() => assertTenantKey(`t:${VALID_TENANT_ID}:gating:matter-123`)).not.toThrow()
    })

    it('accepts key with multiple segments', () => {
      expect(() =>
        assertTenantKey(`t:${VALID_TENANT_ID}:matters:list:abc:1`)
      ).not.toThrow()
    })

    it('rejects key without tenant prefix', () => {
      expect(() => assertTenantKey('gating:matter-123')).toThrow(
        'Cache key must start with t:{tenantId}:'
      )
    })

    it('rejects key with invalid UUID format', () => {
      expect(() => assertTenantKey('t:not-a-uuid:gating:123')).toThrow(
        'Cache key must start with t:{tenantId}:'
      )
    })

    it('rejects empty key', () => {
      expect(() => assertTenantKey('')).toThrow('Cache key must start with t:{tenantId}:')
    })

    it('rejects key that looks like tenant prefix but has wrong format', () => {
      expect(() => assertTenantKey('t:12345:gating:123')).toThrow(
        'Cache key must start with t:{tenantId}:'
      )
    })
  })

  describe('cacheKey', () => {
    it('builds a correctly formatted key', () => {
      const key = cacheKey(VALID_TENANT_ID, 'gating', 'matter-xyz')
      expect(key).toBe(`t:${VALID_TENANT_ID}:gating:matter-xyz`)
    })

    it('handles single segment', () => {
      const key = cacheKey(VALID_TENANT_ID, 'authctx')
      expect(key).toBe(`t:${VALID_TENANT_ID}:authctx`)
    })

    it('handles multiple segments', () => {
      const key = cacheKey(VALID_TENANT_ID, 'matters', 'list', 'hash123', '1')
      expect(key).toBe(`t:${VALID_TENANT_ID}:matters:list:hash123:1`)
    })

    it('produces keys that pass assertTenantKey', () => {
      const key = cacheKey(VALID_TENANT_ID, 'test', 'value')
      expect(() => assertTenantKey(key)).not.toThrow()
    })
  })

  describe('cross-tenant safety', () => {
    it('tenant A key does not match tenant B prefix', () => {
      const keyA = cacheKey(VALID_TENANT_ID, 'gating', 'matter-1')
      const keyB = cacheKey(VALID_TENANT_ID_B, 'gating', 'matter-1')

      expect(keyA).not.toBe(keyB)
      expect(keyA.startsWith(`t:${VALID_TENANT_ID}:`)).toBe(true)
      expect(keyB.startsWith(`t:${VALID_TENANT_ID_B}:`)).toBe(true)
      expect(keyA.startsWith(`t:${VALID_TENANT_ID_B}:`)).toBe(false)
    })
  })
})
