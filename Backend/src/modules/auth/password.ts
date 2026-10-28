import { hash, verify } from '@node-rs/argon2'
import { z } from 'zod'

// Argon2id with the library defaults (m=19 MiB, t=2, p=1), which meet the
// OWASP minimum. Raise memoryCost if the production host has headroom.
export const hashPassword = (password: string) => hash(password)

let dummyHash: Promise<string> | undefined
/** Verifies against a throwaway hash when the account does not exist, so timing does not reveal it. */
export async function verifyPassword(passwordHash: string | null | undefined, password: string) {
  if (!passwordHash) {
    dummyHash ??= hash('not-a-real-password-placeholder')
    await verify(await dummyHash, password)
    return false
  }
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

const COMMON = new Set(['password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'iloveyou12', 'admin12345', 'welcome123', 'farooquia1', 'madarsa123', 'bismillah1', 'allahuakbar'])

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'This password is too common. Choose another.')
