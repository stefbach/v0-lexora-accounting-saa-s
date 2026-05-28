import { describe, it, expect } from 'vitest'
import { PCMError, isPCMError } from './errors'

describe('PCMError', () => {
  it('mappe les codes vers les bons status HTTP', () => {
    expect(new PCMError('PCM_001', 'x').httpStatus).toBe(404)
    expect(new PCMError('PCM_003', 'x').httpStatus).toBe(409)
    expect(new PCMError('PCM_006', 'x').httpStatus).toBe(422)
    expect(new PCMError('PCM_007', 'x').httpStatus).toBe(403)
    expect(new PCMError('PCM_009', 'x').httpStatus).toBe(400)
  })

  it('sérialise en JSON avec code + message + details', () => {
    const e = new PCMError('PCM_003', 'doublon', { numero: '401' })
    expect(e.toJSON()).toEqual({ error: 'doublon', code: 'PCM_003', details: { numero: '401' } })
  })

  it('isPCMError discrimine correctement', () => {
    expect(isPCMError(new PCMError('PCM_001', 'x'))).toBe(true)
    expect(isPCMError(new Error('autre'))).toBe(false)
    expect(isPCMError(null)).toBe(false)
    expect(isPCMError({ code: 'PCM_001' })).toBe(false)
  })
})
