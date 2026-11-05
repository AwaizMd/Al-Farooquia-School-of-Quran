-- CR-01 step 1/3 (expand): organization, madrasas and memberships; a nullable
-- "madrasaId" on every campus table. Nothing is removed or rewritten here.

-- Roles. ADMIN keeps its rows under the new name; the new values are added in
-- this migration and first used by the backfill (a new enum value cannot be used
-- in the transaction that adds it).
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'MADRASA_ADMIN';
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN' BEFORE 'MADRASA_ADMIN';
ALTER TYPE "Role" ADD VALUE 'COMMITTEE_MEMBER' AFTER 'PRINCIPAL';
ALTER TYPE "Role" ADD VALUE 'CA' AFTER 'COMMITTEE_MEMBER';
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT' AFTER 'CA';

CREATE TYPE "Feature" AS ENUM ('HOSTEL', 'FEES', 'ACCOUNTS', 'NAMAZ_TRACKING', 'STAFF_ATTENDANCE', 'ASSESSMENTS', 'SCHEDULED_REPORTS', 'BIOMETRIC');

CREATE TABLE "organizations" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "nameArabic" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "madrasas" (
    "id" UUID NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "nameArabic" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "madrasas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "madrasas_code_key" ON "madrasas"("code");
ALTER TABLE "madrasas" ADD CONSTRAINT "madrasas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "madrasa_settings" (
    "madrasaId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "weeklyOff" SMALLINT NOT NULL,
    "feeDueDay" SMALLINT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "madrasa_settings_pkey" PRIMARY KEY ("madrasaId")
);
ALTER TABLE "madrasa_settings" ADD CONSTRAINT "madrasa_settings_madrasaId_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "madrasa_features" (
    "madrasaId" UUID NOT NULL,
    "feature" "Feature" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "madrasa_features_pkey" PRIMARY KEY ("madrasaId","feature")
);
ALTER TABLE "madrasa_features" ADD CONSTRAINT "madrasa_features_madrasaId_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "madrasa_memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "madrasaId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(3),
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "madrasa_memberships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "madrasa_memberships_madrasaId_role_idx" ON "madrasa_memberships"("madrasaId", "role");
CREATE UNIQUE INDEX "madrasa_memberships_userId_madrasaId_role_key" ON "madrasa_memberships"("userId", "madrasaId", "role");
ALTER TABLE "madrasa_memberships" ADD CONSTRAINT "madrasa_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "madrasa_memberships" ADD CONSTRAINT "madrasa_memberships_madrasaId_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nullable for now; the backfill fills them and the contract step makes them required.
ALTER TABLE "groups" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "staff_profiles" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "group_mentor_assignments" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "students" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "student_guardians" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "group_enrollments" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "attendance_sessions" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "attendance_records" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "attendance_corrections" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "learning_records" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "learning_record_revisions" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "grading_scales" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "grade_bands" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "exams" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "exam_groups" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "exam_subjects" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "exam_results" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "exam_marks" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "fee_plans" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "invoices" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "payments" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "payment_allocations" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "receipts" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "receipt_sequences" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "fee_adjustments" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "refunds" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "refund_allocations" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "concessions" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "hostel_rooms" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "hostel_beds" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "bed_assignments" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "hostel_roll_entries" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "reminder_rules" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "message_templates" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "scheduled_report_config" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "report_runs" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "payment_settings" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "manual_payment_submissions" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "madrasaId" UUID;
ALTER TABLE "notification_deliveries" ADD COLUMN "madrasaId" UUID;

-- Where an account was created (it can be managed there before any role or record links it).
ALTER TABLE "users" ADD COLUMN "homeMadrasaId" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_homeMadrasaId_fkey" FOREIGN KEY ("homeMadrasaId") REFERENCES "madrasas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
