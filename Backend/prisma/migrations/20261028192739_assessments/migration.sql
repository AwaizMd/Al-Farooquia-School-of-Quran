-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" UUID NOT NULL,
    "scaleId" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "arabic" TEXT,
    "minPercent" SMALLINT NOT NULL,
    "meaning" TEXT,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "date" DATE NOT NULL,
    "examinerId" UUID,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "gradingScaleId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_groups" (
    "examId" UUID NOT NULL,
    "groupId" UUID NOT NULL,

    CONSTRAINT "exam_groups_pkey" PRIMARY KEY ("examId","groupId")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" SMALLINT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "enteredById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "resultId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "marks" SMALLINT NOT NULL,

    CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("resultId","subjectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_version_key" ON "grading_scales"("version");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_scaleId_minPercent_key" ON "grade_bands"("scaleId", "minPercent");

-- CreateIndex
CREATE UNIQUE INDEX "exams_code_key" ON "exams"("code");

-- CreateIndex
CREATE INDEX "exams_date_idx" ON "exams"("date");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_examId_name_key" ON "exam_subjects"("examId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_examId_studentId_key" ON "exam_results"("examId", "studentId");

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "grading_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_gradingScaleId_fkey" FOREIGN KEY ("gradingScaleId") REFERENCES "grading_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_groups" ADD CONSTRAINT "exam_groups_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_groups" ADD CONSTRAINT "exam_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "exam_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_percent" CHECK ("minPercent" BETWEEN 0 AND 100);
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_max" CHECK ("maxMarks" BETWEEN 1 AND 1000);
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_nonnegative" CHECK ("marks" >= 0);
-- Only one grading scale is in use at a time.
CREATE UNIQUE INDEX "grading_scales_one_active" ON "grading_scales"("active") WHERE "active";
-- Marks can never exceed the subject maximum, even outside the API.
CREATE FUNCTION exam_marks_within_max() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."marks" > (SELECT "maxMarks" FROM "exam_subjects" WHERE "id" = NEW."subjectId") THEN
    RAISE EXCEPTION 'marks exceed the subject maximum';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exam_marks_max BEFORE INSERT OR UPDATE ON "exam_marks" FOR EACH ROW EXECUTE FUNCTION exam_marks_within_max();
CREATE SEQUENCE "exam_code_seq" START 1;

-- Approved default grading scale (version 1).
INSERT INTO "grading_scales" ("id", "version", "active") VALUES ('00000000-0000-4000-8000-000000000001', 1, true);
INSERT INTO "grade_bands" ("id", "scaleId", "grade", "arabic", "minPercent", "meaning") VALUES
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'Mumtaz', 'ممتاز', 85, 'Excellent'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'Jayyid Jiddan', 'جيد جدا', 70, 'Very good'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'Jayyid', 'جيد', 55, 'Good'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'Maqbool', 'مقبول', 40, 'Pass'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'Rasib', 'راسب', 0, 'Re-test needed');
