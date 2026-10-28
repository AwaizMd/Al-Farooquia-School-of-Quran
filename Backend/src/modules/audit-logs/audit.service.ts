import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../database/prisma.js'

type Tx = Prisma.TransactionClient

export interface AuditEntry {
  action: string
  summary: string
  entityType?: string
  entityId?: string
  /** Structured context. Never include passwords, tokens, codes or secrets. */
  metadata?: Prisma.InputJsonValue
  /** Overrides the actor taken from the request (e.g. login before a session exists). */
  actor?: { userId: string | null; name: string; role: string }
}

export async function audit(entry: AuditEntry, req?: Request, db: Tx | typeof prisma = prisma) {
  const actor = entry.actor ?? (req?.auth ? { userId: req.auth.user.id, name: req.auth.user.displayName, role: req.auth.roles.join(',') } : { userId: null, name: 'System', role: 'system' })
  await db.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      action: entry.action,
      summary: entry.summary,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? undefined,
      ip: req?.ip ?? null,
      requestId: (req?.id as string | undefined) ?? null,
    },
  })
}
