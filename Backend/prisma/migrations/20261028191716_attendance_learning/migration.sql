-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "LearningCategory" AS ENUM ('SABAQ', 'SABQI', 'MANZIL', 'NAZIRA', 'QAIDA');

-- CreateEnum
CREATE TYPE "TajweedQuality" AS ENUM ('GOOD', 'FAIR', 'WEAK');

-- CreateEnum
CREATE TYPE "RevisionDone" AS ENUM ('DONE', 'PARTIAL', 'NOT');

-- CreateEnum
CREATE TYPE "TargetStatus" AS ENUM ('MET', 'PARTIAL', 'MISSED');

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "markedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "markedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "fromStatus" "AttendanceStatus" NOT NULL,
    "toStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT,
    "correctedById" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_records" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "mentorId" UUID,
    "recordedById" UUID,
    "date" DATE NOT NULL,
    "category" "LearningCategory" NOT NULL,
    "surah" SMALLINT,
    "fromAyah" SMALLINT,
    "toAyah" SMALLINT,
    "juz" SMALLINT,
    "qaidaLesson" SMALLINT,
    "performance" SMALLINT NOT NULL,
    "mistakes" SMALLINT NOT NULL,
    "fluency" SMALLINT NOT NULL,
    "tajweed" "TajweedQuality" NOT NULL,
    "prevRevision" "RevisionDone" NOT NULL,
    "revisionQuality" SMALLINT,
    "targetStatus" "TargetStatus" NOT NULL,
    "comments" TEXT NOT NULL,
    "nextTarget" TEXT NOT NULL,
    "followUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_record_revisions" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "previous" JSONB NOT NULL,
    "reason" TEXT,
    "editedById" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_record_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_groupId_date_key" ON "attendance_sessions"("groupId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_studentId_date_key" ON "attendance_records"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_sessionId_studentId_key" ON "attendance_records"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "attendance_corrections_recordId_idx" ON "attendance_corrections"("recordId");

-- CreateIndex
CREATE INDEX "learning_records_studentId_date_idx" ON "learning_records"("studentId", "date" DESC);

-- CreateIndex
CREATE INDEX "learning_records_date_idx" ON "learning_records"("date");

-- CreateIndex
CREATE INDEX "learning_record_revisions_recordId_idx" ON "learning_record_revisions"("recordId");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_record_revisions" ADD CONSTRAINT "learning_record_revisions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "learning_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ratings and counts stay within the scales the mentors use.
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_scales" CHECK (
  "performance" BETWEEN 1 AND 5 AND "fluency" BETWEEN 1 AND 5 AND "mistakes" BETWEEN 0 AND 99
  AND ("revisionQuality" IS NULL OR "revisionQuality" BETWEEN 1 AND 5)
  AND ("qaidaLesson" IS NULL OR "qaidaLesson" BETWEEN 1 AND 17)
  AND ("surah" IS NULL OR ("surah" BETWEEN 1 AND 114 AND "fromAyah" >= 1 AND "toAyah" >= "fromAyah"))
);
-- Qaida lessons carry a lesson number; every other category carries an ayah range.
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_shape" CHECK (
  ("category" = 'QAIDA' AND "qaidaLesson" IS NOT NULL AND "surah" IS NULL)
  OR ("category" <> 'QAIDA' AND "surah" IS NOT NULL AND "fromAyah" IS NOT NULL AND "toAyah" IS NOT NULL AND "qaidaLesson" IS NULL)
);
