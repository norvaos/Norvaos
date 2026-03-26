import { describe, it, expect } from 'vitest'
import { validateNotification } from '../microsoft-webhooks'

describe('validateNotification', () => {
  it('returns valid:true when validationToken is provided', () => {
    const result = validateNotification('', 'some-validation-token')
    expect(result).toEqual({ valid: true })
  })

  it('returns valid:false when clientState is empty', () => {
    const result = validateNotification('')
    expect(result).toEqual({ valid: false })
  })

  it('returns valid:true when clientState is non-empty', () => {
    const result = validateNotification('abc123deadbeef')
    expect(result).toEqual({ valid: true })
  })
})
