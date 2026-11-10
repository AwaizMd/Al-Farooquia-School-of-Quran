-- CreateEnum
CREATE TYPE "HalaqaStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "HalaqaFrequency" AS ENUM ('ONE_OFF', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "HalaqaSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HalaqaAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "MureedEntryKind" AS ENUM ('MEETING', 'FOLLOW_UP', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "SiteItemType" AS ENUM ('PAGE', 'PROGRAM', 'ANNOUNCEMENT', 'EVENT', 'FAQ');

-- CreateEnum
CREATE TYPE "SiteItemStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('ADMISSION', 'HALAQA', 'MUREED', 'EVENT', 'ENQUIRY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Feature" ADD VALUE 'HALAQA';
ALTER TYPE "Feature" ADD VALUE 'PUBLIC_WEBSITE';

-- CreateTable
CREATE TABLE "halaqa_categories" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "halaqa_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqas" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "purpose" TEXT,
    "location" TEXT,
    "teacherStaffId" UUID,
    "frequency" "HalaqaFrequency" NOT NULL DEFAULT 'WEEKLY',
    "meetingDays" INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "maxParticipants" INTEGER,
    "status" "HalaqaStatus" NOT NULL DEFAULT 'PLANNED',
    "instructions" TEXT,
    "attendanceRules" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicName" TEXT,
    "publicDescription" TEXT,
    "publicEligibility" TEXT,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "halaqas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_participants" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "studentId" UUID,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "address" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "dob" DATE,
    "photoKey" TEXT,
    "photoType" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isMureed" BOOLEAN NOT NULL DEFAULT false,
    "mureedSince" DATE,
    "qrVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "halaqa_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_memberships" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "halaqaId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "joinedOn" DATE NOT NULL,
    "leftOn" DATE,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "halaqa_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_events" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorName" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_sessions" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "halaqaId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "status" "HalaqaSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rescheduledFrom" DATE,
    "cancelReason" TEXT,
    "topic" TEXT,
    "description" TEXT,
    "discussionNotes" TEXT,
    "followUp" TEXT,
    "seriesId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "halaqa_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_materials" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_attendance" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "status" "HalaqaAttendanceStatus" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "markedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "halaqa_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_attendance_corrections" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "fromStatus" "HalaqaAttendanceStatus" NOT NULL,
    "toStatus" "HalaqaAttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedBy" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "halaqa_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mureed_entries" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "kind" "MureedEntryKind" NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "dueDate" DATE,
    "doneAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mureed_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mureed_private_notes" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mureed_private_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqa_messages" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "halaqaId" UUID,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "emailCount" INTEGER NOT NULL,
    "inAppCount" INTEGER NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "halaqa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_domains" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_items" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "type" "SiteItemType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "category" TEXT,
    "imageId" UUID,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "SiteItemStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_assets" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "applicantName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "answers" JSONB NOT NULL,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "consentText" TEXT NOT NULL,
    "halaqaId" UUID,
    "siteItemId" UUID,
    "studentId" UUID,
    "participantId" UUID,
    "respondTokenHash" TEXT,
    "respondExpiresAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "anonymisedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "madrasaId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "actorName" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "halaqa_categories_madrasaId_name_key" ON "halaqa_categories"("madrasaId", "name");

-- CreateIndex
CREATE INDEX "halaqas_categoryId_idx" ON "halaqas"("categoryId");

-- CreateIndex
CREATE INDEX "halaqas_teacherStaffId_idx" ON "halaqas"("teacherStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "halaqas_madrasaId_name_key" ON "halaqas"("madrasaId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "halaqa_participants_studentId_key" ON "halaqa_participants"("studentId");

-- CreateIndex
CREATE INDEX "halaqa_participants_madrasaId_phoneKey_idx" ON "halaqa_participants"("madrasaId", "phoneKey");

-- CreateIndex
CREATE INDEX "halaqa_participants_madrasaId_email_idx" ON "halaqa_participants"("madrasaId", "email");

-- CreateIndex
CREATE INDEX "halaqa_memberships_halaqaId_idx" ON "halaqa_memberships"("halaqaId");

-- CreateIndex
CREATE INDEX "halaqa_memberships_participantId_idx" ON "halaqa_memberships"("participantId");

-- CreateIndex
CREATE INDEX "participant_events_participantId_at_idx" ON "participant_events"("participantId", "at");

-- CreateIndex
CREATE INDEX "halaqa_sessions_madrasaId_date_idx" ON "halaqa_sessions"("madrasaId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "halaqa_sessions_halaqaId_date_startTime_key" ON "halaqa_sessions"("halaqaId", "date", "startTime");

-- CreateIndex
CREATE INDEX "session_materials_sessionId_idx" ON "session_materials"("sessionId");

-- CreateIndex
CREATE INDEX "halaqa_attendance_participantId_idx" ON "halaqa_attendance"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "halaqa_attendance_sessionId_participantId_key" ON "halaqa_attendance"("sessionId", "participantId");

-- CreateIndex
CREATE INDEX "halaqa_attendance_corrections_attendanceId_idx" ON "halaqa_attendance_corrections"("attendanceId");

-- CreateIndex
CREATE INDEX "mureed_entries_participantId_date_idx" ON "mureed_entries"("participantId", "date");

-- CreateIndex
CREATE INDEX "mureed_private_notes_participantId_idx" ON "mureed_private_notes"("participantId");

-- CreateIndex
CREATE INDEX "halaqa_messages_halaqaId_idx" ON "halaqa_messages"("halaqaId");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_madrasaId_key" ON "site_settings"("madrasaId");

-- CreateIndex
CREATE UNIQUE INDEX "site_domains_hostname_key" ON "site_domains"("hostname");

-- CreateIndex
CREATE INDEX "site_domains_madrasaId_idx" ON "site_domains"("madrasaId");

-- CreateIndex
CREATE INDEX "site_items_madrasaId_type_status_idx" ON "site_items"("madrasaId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "site_items_madrasaId_type_slug_key" ON "site_items"("madrasaId", "type", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE INDEX "applications_madrasaId_type_status_idx" ON "applications"("madrasaId", "type", "status");

-- CreateIndex
CREATE INDEX "applications_madrasaId_phoneKey_idx" ON "applications"("madrasaId", "phoneKey");

-- CreateIndex
CREATE INDEX "applications_madrasaId_email_idx" ON "applications"("madrasaId", "email");

-- CreateIndex
CREATE INDEX "application_documents_applicationId_idx" ON "application_documents"("applicationId");

-- CreateIndex
CREATE INDEX "application_events_applicationId_at_idx" ON "application_events"("applicationId", "at");

-- AddForeignKey
ALTER TABLE "halaqa_categories" ADD CONSTRAINT "halaqa_categories_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqas" ADD CONSTRAINT "halaqas_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqas" ADD CONSTRAINT "halaqas_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "halaqa_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqas" ADD CONSTRAINT "halaqas_teacherStaffId_fkey" FOREIGN KEY ("teacherStaffId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_participants" ADD CONSTRAINT "halaqa_participants_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_participants" ADD CONSTRAINT "halaqa_participants_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_memberships" ADD CONSTRAINT "halaqa_memberships_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_memberships" ADD CONSTRAINT "halaqa_memberships_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "halaqas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_memberships" ADD CONSTRAINT "halaqa_memberships_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_events" ADD CONSTRAINT "participant_events_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_events" ADD CONSTRAINT "participant_events_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_sessions" ADD CONSTRAINT "halaqa_sessions_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_sessions" ADD CONSTRAINT "halaqa_sessions_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "halaqas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "halaqa_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_attendance" ADD CONSTRAINT "halaqa_attendance_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_attendance" ADD CONSTRAINT "halaqa_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "halaqa_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_attendance" ADD CONSTRAINT "halaqa_attendance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_attendance_corrections" ADD CONSTRAINT "halaqa_attendance_corrections_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_attendance_corrections" ADD CONSTRAINT "halaqa_attendance_corrections_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "halaqa_attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mureed_entries" ADD CONSTRAINT "mureed_entries_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mureed_entries" ADD CONSTRAINT "mureed_entries_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mureed_private_notes" ADD CONSTRAINT "mureed_private_notes_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mureed_private_notes" ADD CONSTRAINT "mureed_private_notes_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_messages" ADD CONSTRAINT "halaqa_messages_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqa_messages" ADD CONSTRAINT "halaqa_messages_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "halaqas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_domains" ADD CONSTRAINT "site_domains_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_items" ADD CONSTRAINT "site_items_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_items" ADD CONSTRAINT "site_items_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "site_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_assets" ADD CONSTRAINT "site_assets_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "halaqas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_siteItemId_fkey" FOREIGN KEY ("siteItemId") REFERENCES "site_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "halaqa_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_madrasa_id_fkey" FOREIGN KEY ("madrasaId") REFERENCES "madrasas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one active membership per person per Halaqa.
CREATE UNIQUE INDEX "halaqa_memberships_one_active" ON "halaqa_memberships"("halaqaId", "participantId") WHERE "status" = 'ACTIVE';

ALTER TABLE "halaqas" ADD CONSTRAINT "halaqas_dates" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");
ALTER TABLE "halaqas" ADD CONSTRAINT "halaqas_capacity" CHECK ("maxParticipants" IS NULL OR "maxParticipants" > 0);
ALTER TABLE "halaqa_memberships" ADD CONSTRAINT "halaqa_memberships_dates" CHECK ("leftOn" IS NULL OR "leftOn" >= "joinedOn");

-- A row and the rows it points to always share one madrasa.
CREATE TRIGGER "halaqas_madrasa_1_categoryId" BEFORE INSERT OR UPDATE ON "halaqas" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_categories', 'categoryId');
CREATE TRIGGER "halaqas_madrasa_2_teacherStaffId" BEFORE INSERT OR UPDATE ON "halaqas" FOR EACH ROW EXECUTE FUNCTION madrasa_link('staff_profiles', 'teacherStaffId');
CREATE TRIGGER "halaqa_participants_madrasa_1_studentId" BEFORE INSERT OR UPDATE ON "halaqa_participants" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "halaqa_memberships_madrasa_1_halaqaId" BEFORE INSERT OR UPDATE ON "halaqa_memberships" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqas', 'halaqaId');
CREATE TRIGGER "halaqa_memberships_madrasa_2_participantId" BEFORE INSERT OR UPDATE ON "halaqa_memberships" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "participant_events_madrasa_1_participantId" BEFORE INSERT ON "participant_events" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "halaqa_sessions_madrasa_1_halaqaId" BEFORE INSERT OR UPDATE ON "halaqa_sessions" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqas', 'halaqaId');
CREATE TRIGGER "session_materials_madrasa_1_sessionId" BEFORE INSERT ON "session_materials" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_sessions', 'sessionId');
CREATE TRIGGER "halaqa_attendance_madrasa_1_sessionId" BEFORE INSERT OR UPDATE ON "halaqa_attendance" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_sessions', 'sessionId');
CREATE TRIGGER "halaqa_attendance_madrasa_2_participantId" BEFORE INSERT OR UPDATE ON "halaqa_attendance" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "halaqa_attendance_corrections_madrasa_1_attendanceId" BEFORE INSERT ON "halaqa_attendance_corrections" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_attendance', 'attendanceId');
CREATE TRIGGER "mureed_entries_madrasa_1_participantId" BEFORE INSERT OR UPDATE ON "mureed_entries" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "mureed_private_notes_madrasa_1_participantId" BEFORE INSERT OR UPDATE ON "mureed_private_notes" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "halaqa_messages_madrasa_1_halaqaId" BEFORE INSERT ON "halaqa_messages" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqas', 'halaqaId');
CREATE TRIGGER "site_items_madrasa_1_imageId" BEFORE INSERT OR UPDATE ON "site_items" FOR EACH ROW EXECUTE FUNCTION madrasa_link('site_assets', 'imageId');
CREATE TRIGGER "applications_madrasa_1_halaqaId" BEFORE INSERT OR UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqas', 'halaqaId');
CREATE TRIGGER "applications_madrasa_2_siteItemId" BEFORE INSERT OR UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION madrasa_link('site_items', 'siteItemId');
CREATE TRIGGER "applications_madrasa_3_studentId" BEFORE INSERT OR UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION madrasa_link('students', 'studentId');
CREATE TRIGGER "applications_madrasa_4_participantId" BEFORE INSERT OR UPDATE ON "applications" FOR EACH ROW EXECUTE FUNCTION madrasa_link('halaqa_participants', 'participantId');
CREATE TRIGGER "application_documents_madrasa_1_applicationId" BEFORE INSERT ON "application_documents" FOR EACH ROW EXECUTE FUNCTION madrasa_link('applications', 'applicationId');
CREATE TRIGGER "application_events_madrasa_1_applicationId" BEFORE INSERT ON "application_events" FOR EACH ROW EXECUTE FUNCTION madrasa_link('applications', 'applicationId');

-- Histories are append-only.
CREATE FUNCTION cr02_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are a history and cannot be changed or deleted', TG_TABLE_NAME;
END $$;
CREATE TRIGGER participant_events_append_only BEFORE UPDATE OR DELETE ON "participant_events" FOR EACH ROW EXECUTE FUNCTION cr02_block_change();
CREATE TRIGGER halaqa_attendance_corrections_append_only BEFORE UPDATE OR DELETE ON "halaqa_attendance_corrections" FOR EACH ROW EXECUTE FUNCTION cr02_block_change();
CREATE TRIGGER application_events_append_only BEFORE UPDATE OR DELETE ON "application_events" FOR EACH ROW EXECUTE FUNCTION cr02_block_change();
