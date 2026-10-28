-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('FEES', 'PROGRESS', 'ATTENDANCE', 'RESULTS', 'GENERAL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","channel","category")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" UUID,
    "guardianId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "recipient" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "invoiceId" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "reportRunId" UUID,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_rules" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "offsetDays" SMALLINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" "NotificationChannel"[],
    "position" SMALLINT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "scheduled_report_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "ReportFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dayOfWeek" SMALLINT NOT NULL DEFAULT 6,
    "dayOfMonth" SMALLINT NOT NULL DEFAULT 1,
    "sendAt" TEXT NOT NULL DEFAULT '09:00',
    "channels" "NotificationChannel"[] DEFAULT ARRAY['EMAIL', 'IN_APP']::"NotificationChannel"[],
    "sections" TEXT[] DEFAULT ARRAY['attendance', 'learning', 'assessments', 'feedback']::TEXT[],
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduled_report_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_runs" (
    "id" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status" (
    "name" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMPTZ(3),
    "lastSucceededAt" TIMESTAMPTZ(3),
    "lastFailedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "lastResult" JSONB,

    CONSTRAINT "job_status_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_dedupeKey_key" ON "notification_deliveries"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_nextAttemptAt_idx" ON "notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_invoiceId_idx" ON "notification_deliveries"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "report_runs_periodKey_key" ON "report_runs"("periodKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "report_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Approved fee reminder schedule and message (from the existing reminder screen).
INSERT INTO "reminder_rules" ("key", "label", "offsetDays", "enabled", "channels", "position", "updatedAt") VALUES
  ('before', 'Before the due date', -3, true, ARRAY['EMAIL','IN_APP']::"NotificationChannel"[], 1, now()),
  ('on', 'On the due date', 0, true, ARRAY['EMAIL','IN_APP']::"NotificationChannel"[], 2, now()),
  ('after3', '3 days after the due date', 3, true, ARRAY['EMAIL','IN_APP']::"NotificationChannel"[], 3, now()),
  ('after7', '7 days after the due date', 7, true, ARRAY['EMAIL','IN_APP']::"NotificationChannel"[], 4, now());

INSERT INTO "message_templates" ("key", "subject", "body", "updatedAt") VALUES
  ('fee_reminder', 'Fee reminder for {student}', 'Assalamu Alaikum {guardian}. This is a gentle reminder from {madarsa} that the {period} fee for {student} is due on {dueDate}. Outstanding balance: {balance}. JazakAllahu khairan.', now());

INSERT INTO "scheduled_report_config" ("id", "updatedAt") VALUES (1, now());

ALTER TABLE "scheduled_report_config" ADD CONSTRAINT "scheduled_report_config_ranges" CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "dayOfMonth" BETWEEN 1 AND 28 AND "sendAt" ~ '^([01]\d|2[0-3]):[0-5]\d$');
