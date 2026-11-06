-- CreateEnum
CREATE TYPE "KioskStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "StaffSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'MISSED_CHECKOUT');

-- CreateEnum
CREATE TYPE "StaffSessionSource" AS ENUM ('KIOSK', 'MANUAL');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "kioskDefaults" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "attendancePinHash" TEXT;

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "attendanceExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qrRevokedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT,
    "location" TEXT,
    "status" "KioskStatus" NOT NULL DEFAULT 'PENDING',
    "registrationCodeHash" TEXT,
    "registrationExpiresAt" TIMESTAMPTZ(3),
    "tokenHash" TEXT,
    "previousTokenHash" TEXT,
    "previousTokenUntil" TIMESTAMPTZ(3),
    "credentialIssuedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastScanAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "allowedIps" TEXT[],
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_scans" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "kioskId" UUID NOT NULL,
    "requestId" TEXT,
    "outcome" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "staffId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB,

    CONSTRAINT "kiosk_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_token_uses" (
    "jti" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "usedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "qr_token_uses_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "staff_shifts" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceLateMinutes" SMALLINT NOT NULL DEFAULT 10,
    "graceEarlyMinutes" SMALLINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shift_assignments" (
    "madrasaId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,

    CONSTRAINT "staff_shift_assignments_pkey" PRIMARY KEY ("staffId","shiftId")
);

-- CreateTable
CREATE TABLE "staff_attendance_sessions" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" UUID,
    "checkInAt" TIMESTAMPTZ(3) NOT NULL,
    "checkOutAt" TIMESTAMPTZ(3),
    "status" "StaffSessionStatus" NOT NULL DEFAULT 'OPEN',
    "source" "StaffSessionSource" NOT NULL DEFAULT 'KIOSK',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER,
    "checkInKioskId" UUID,
    "checkOutKioskId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_corrections" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "previous" JSONB,
    "reason" TEXT NOT NULL,
    "correctedById" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_registrationCodeHash_key" ON "kiosk_devices"("registrationCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_tokenHash_key" ON "kiosk_devices"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_previousTokenHash_key" ON "kiosk_devices"("previousTokenHash");

-- CreateIndex
CREATE INDEX "kiosk_devices_madrasaId_idx" ON "kiosk_devices"("madrasaId");

-- CreateIndex
CREATE INDEX "kiosk_scans_madrasaId_at_idx" ON "kiosk_scans"("madrasaId", "at" DESC);

-- CreateIndex
CREATE INDEX "kiosk_scans_kioskId_at_idx" ON "kiosk_scans"("kioskId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_scans_kioskId_requestId_key" ON "kiosk_scans"("kioskId", "requestId");

-- CreateIndex
CREATE INDEX "qr_token_uses_expiresAt_idx" ON "qr_token_uses"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_shifts_madrasaId_name_key" ON "staff_shifts"("madrasaId", "name");

-- CreateIndex
CREATE INDEX "staff_shift_assignments_madrasaId_idx" ON "staff_shift_assignments"("madrasaId");

-- CreateIndex
CREATE INDEX "staff_attendance_sessions_madrasaId_date_idx" ON "staff_attendance_sessions"("madrasaId", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_sessions_staffId_date_idx" ON "staff_attendance_sessions"("staffId", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_corrections_sessionId_idx" ON "staff_attendance_corrections"("sessionId");

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_scans" ADD CONSTRAINT "kiosk_scans_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_scans" ADD CONSTRAINT "kiosk_scans_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "kiosk_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shift_assignments" ADD CONSTRAINT "staff_shift_assignments_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shift_assignments" ADD CONSTRAINT "staff_shift_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shift_assignments" ADD CONSTRAINT "staff_shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "staff_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "staff_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_checkInKioskId_fkey" FOREIGN KEY ("checkInKioskId") REFERENCES "kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_checkOutKioskId_fkey" FOREIGN KEY ("checkOutKioskId") REFERENCES "kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_corrections" ADD CONSTRAINT "staff_attendance_corrections_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_corrections" ADD CONSTRAINT "staff_attendance_corrections_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "staff_attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One open session per person, whichever kiosk or request gets there first.
CREATE UNIQUE INDEX "staff_attendance_sessions_one_open" ON "staff_attendance_sessions"("staffId") WHERE "status" = 'OPEN';

ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_grace_range" CHECK ("graceLateMinutes" BETWEEN 0 AND 240 AND "graceEarlyMinutes" BETWEEN 0 AND 240);
ALTER TABLE "staff_attendance_sessions" ADD CONSTRAINT "staff_attendance_sessions_shape" CHECK (
  "lateMinutes" >= 0 AND "earlyMinutes" >= 0
  AND ("checkOutAt" IS NULL OR "checkOutAt" >= "checkInAt")
  AND (("status" = 'CLOSED') = ("checkOutAt" IS NOT NULL))
);

-- A row and the rows it points to always share one madrasa (see madrasa_link in the CR-01 contract migration).
CREATE TRIGGER "kiosk_scans_madrasa_1_kiosk" BEFORE INSERT ON "kiosk_scans" FOR EACH ROW EXECUTE FUNCTION madrasa_link('kiosk_devices', 'kioskId');
CREATE TRIGGER "kiosk_scans_madrasa_2_staff" BEFORE INSERT ON "kiosk_scans" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "staff_shift_assignments_madrasa_1_staff" BEFORE INSERT OR UPDATE ON "staff_shift_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "staff_shift_assignments_madrasa_2_shift" BEFORE INSERT OR UPDATE ON "staff_shift_assignments" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_shifts', 'shiftId');
CREATE TRIGGER "staff_attendance_sessions_madrasa_1_staff" BEFORE INSERT OR UPDATE ON "staff_attendance_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'staffId');
CREATE TRIGGER "staff_attendance_sessions_madrasa_2_shift" BEFORE INSERT OR UPDATE ON "staff_attendance_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_shifts', 'shiftId');
CREATE TRIGGER "staff_attendance_sessions_madrasa_3_in" BEFORE INSERT OR UPDATE ON "staff_attendance_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('kiosk_devices', 'checkInKioskId');
CREATE TRIGGER "staff_attendance_sessions_madrasa_4_out" BEFORE INSERT OR UPDATE ON "staff_attendance_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('kiosk_devices', 'checkOutKioskId');
CREATE TRIGGER "staff_attendance_corrections_madrasa_1_session" BEFORE INSERT ON "staff_attendance_corrections" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_attendance_sessions', 'sessionId');
