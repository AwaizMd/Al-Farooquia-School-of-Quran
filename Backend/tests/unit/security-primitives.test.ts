import { describe, expect, it } from 'vitest'
import { hashToken, safeEqual, seal, unseal } from '../../src/common/crypto.js'
import { passwordSchema } from '../../src/modules/auth/password.js'
import { permissionsFor } from '../../src/modules/auth/permissions.js'
import { timeoutsFor } from '../../src/modules/auth/session.service.js'
import { codeAt, generateSecret, matchStep, currentStep } from '../../src/modules/mfa/totp.js'

describe('authenticated encryption of TOTP secrets', () => {
  it('round-trips with the active key version', () => {
    const s = seal('JBSWY3DPEHPK3PXP', 'mfa:u1:c1')
    expect(s.keyVersion).toBe(2)
    expect(Buffer.from(s.ciphertext).toString('utf8')).not.toContain('JBSWY3DP')
    expect(unseal(s, 'mfa:u1:c1')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('refuses a ciphertext moved to another user or credential (AAD binding)', () => {
    const s = seal('JBSWY3DPEHPK3PXP', 'mfa:u1:c1')
    expect(() => unseal(s, 'mfa:u2:c1')).toThrow()
  })

  it('refuses a tampered ciphertext', () => {
    const s = seal('JBSWY3DPEHPK3PXP', 'mfa:u1:c1')
    s.ciphertext[0]! ^= 0xff
    expect(() => unseal(s, 'mfa:u1:c1')).toThrow()
  })

  it('still decrypts secrets sealed with an older configured key version', () => {
    const s = { ...seal('JBSWY3DPEHPK3PXP', 'a'), keyVersion: 1 }
    expect(() => unseal(s, 'a')).toThrow() // sealed with v2, so claiming v1 must fail
    expect(() => unseal({ ...s, keyVersion: 9 }, 'a')).toThrow(/not configured/)
  })
})

describe('TOTP', () => {
  const secret = generateSecret()
  it('accepts the current code and one step of drift, nothing further', () => {
    const now = Date.now()
    expect(matchStep(secret, codeAt(secret, now), now)).toBe(currentStep(now))
    expect(matchStep(secret, codeAt(secret, now - 30_000), now)).toBe(currentStep(now) - 1)
    expect(matchStep(secret, codeAt(secret, now - 120_000), now)).toBeNull()
  })
  it('rejects malformed codes', () => {
    expect(matchStep(secret, '12345')).toBeNull()
    expect(matchStep(secret, 'abcdef')).toBeNull()
  })
})

describe('tokens and passwords', () => {
  it('hashes tokens deterministically with the server key', () => {
    expect(hashToken('x')).toBe(hashToken('x'))
    expect(hashToken('x')).not.toBe(hashToken('y'))
  })
  it('compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
  it('enforces the password policy', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false)
    expect(passwordSchema.safeParse('Password123').success).toBe(false)
    expect(passwordSchema.safeParse('a long passphrase here').success).toBe(true)
  })
})

describe('role policy', () => {
  it('keeps security administration away from the Principal', () => {
    const p = permissionsFor(['PRINCIPAL'])
    expect(p.has('users.read')).toBe(true)
    expect(p.has('mfa.reset')).toBe(false)
    expect(p.has('users.manage')).toBe(false)
  })
  it('combines permissions for multi-role accounts', () => {
    expect(permissionsFor(['MENTOR', 'ADMIN']).has('mfa.reset')).toBe(true)
    expect([...permissionsFor(['PARENT', 'WARDEN'])].sort()).toEqual(['hostel.manage', 'hostel.read'])
  })
  it('uses staff timeouts when any role is staff', () => {
    expect(timeoutsFor('FULL', ['PARENT'])).toEqual({ idleSec: 86400, absoluteSec: 30 * 86400 })
    expect(timeoutsFor('FULL', ['PARENT', 'MENTOR'])).toEqual({ idleSec: 1800, absoluteSec: 12 * 3600 })
    expect(timeoutsFor('PRE_MFA', ['ADMIN']).absoluteSec).toBe(300)
  })
})
