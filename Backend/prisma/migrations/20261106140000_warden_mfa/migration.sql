-- Wardens are staff: MFA is mandatory for every staff and organization role (CLAUDE.md).
UPDATE "mfa_policies" SET "required" = true, "updatedAt" = now() WHERE "role" = 'WARDEN';
