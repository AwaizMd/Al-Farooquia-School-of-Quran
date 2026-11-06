import type { KioskDevice } from '../generated/prisma/client.js'
import type { Permission } from '../modules/auth/permissions.js'
import type { Role, SessionStage } from '../generated/prisma/enums.js'
import type { MadrasaRef } from '../tenancy/access.js'

export interface AuthContext {
  session: { id: string; stage: SessionStage; csrfToken: string; reauthenticatedAt: Date | null; recoveryRequestId: string | null }
  user: { id: string; displayName: string; email: string | null; username: string | null; locale: string }
  /** Roles in the active madrasa (plus organization roles). Permissions come from these. */
  roles: Role[]
  /** Every role the user holds anywhere: decides MFA and session timeouts (strictest wins). */
  allRoles: Role[]
  permissions: Set<Permission>
  /** Set for fully signed-in requests by resolveMadrasa. */
  madrasa?: { activeId: string | null; ids: string[]; list: MadrasaRef[]; allRoles: Role[]; familyOnly: boolean }
}

declare global {
  namespace Express {
    interface Request {
      /** Set by loadSession when a valid, unrevoked session cookie is present (any stage). */
      auth?: AuthContext
      /** Set by requireKiosk on the kiosk device routes. */
      kiosk?: KioskDevice
    }
  }
}

export {}
