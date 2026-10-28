import type { Permission } from '../modules/auth/permissions.js'
import type { Role, SessionStage } from '../generated/prisma/enums.js'

export interface AuthContext {
  session: { id: string; stage: SessionStage; csrfToken: string; reauthenticatedAt: Date | null; recoveryRequestId: string | null }
  user: { id: string; displayName: string; email: string | null; username: string | null; locale: string }
  roles: Role[]
  permissions: Set<Permission>
}

declare global {
  namespace Express {
    interface Request {
      /** Set by loadSession when a valid, unrevoked session cookie is present (any stage). */
      auth?: AuthContext
    }
  }
}

export {}
