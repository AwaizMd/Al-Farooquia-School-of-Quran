-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRINCIPAL', 'MENTOR', 'STUDENT', 'PARENT', 'WARDEN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SessionStage" AS ENUM ('PRE_MFA', 'MFA_ENROLLMENT', 'FULL');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('INVITE', 'PASSWORD_RESET', 'MFA_RECOVERY');

-- CreateEnum
CREATE TYPE "MfaCredentialStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RecoveryMethod" AS ENUM ('EMAIL_LINK', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "username" TEXT,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "passwordChangedAt" TIMESTAMPTZ(3),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "mfaRecoveryPending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "mfa_policies" (
    "role" "Role" NOT NULL,
    "required" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mfa_policies_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "stage" "SessionStage" NOT NULL,
    "recoveryRequestId" UUID,
    "failedMfaAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleTimeoutSec" INTEGER NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "reauthenticatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_credentials" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MfaCredentialStatus" NOT NULL,
    "secretCiphertext" BYTEA NOT NULL,
    "secretIv" BYTEA NOT NULL,
    "secretTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "lastUsedStep" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "mfa_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "initiatedById" UUID,
    "reason" TEXT NOT NULL,
    "method" "RecoveryMethod" NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "tokenId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "mfa_recovery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_purpose_idx" ON "auth_tokens"("userId", "purpose");

-- CreateIndex
CREATE INDEX "mfa_credentials_userId_status_idx" ON "mfa_credentials"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_codeHash_key" ON "recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "recovery_codes_userId_idx" ON "recovery_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_requests_tokenId_key" ON "mfa_recovery_requests"("tokenId");

-- CreateIndex
CREATE INDEX "mfa_recovery_requests_userId_status_idx" ON "mfa_recovery_requests"("userId", "status");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "mfa_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_requests" ADD CONSTRAINT "mfa_recovery_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_requests" ADD CONSTRAINT "mfa_recovery_requests_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one active authenticator per user.
CREATE UNIQUE INDEX "mfa_credentials_one_active_per_user" ON "mfa_credentials"("userId") WHERE "status" = 'ACTIVE';

-- Audit log is append-only at the database level for every role, not only the app's.
CREATE FUNCTION audit_logs_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END $$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_block_change();

-- Default MFA policy (approved): mandatory for administration and teaching staff.
INSERT INTO "mfa_policies" ("role", "required", "updatedAt") VALUES
  ('ADMIN', true, now()), ('PRINCIPAL', true, now()), ('MENTOR', true, now()),
  ('STUDENT', false, now()), ('PARENT', false, now()), ('WARDEN', false, now());
